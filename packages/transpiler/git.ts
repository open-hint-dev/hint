import { execFile } from 'node:child_process';
import * as Path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Pathspec that drops every `.hint` file — and every file inside a detached `<name>.hint/` store —
// from a result set. Git's default pathspec matching is a wildmatch in which `*` crosses `/`, so a
// single trailing-suffix pattern covers both. Used so a hint file never counts as churn in the code
// it describes, and so the hints themselves are not part of a folder's file count.
const EXCLUDE_HINTS = ':(exclude)*.hint';

// Wall-clock ceiling for any single git invocation. Staleness is advisory: a repository large or
// slow enough to blow through this gets no signal rather than a stalled command.
const GIT_TIMEOUT_MS = 5_000;

// Runs git and returns its stdout, or null for *any* failure — git missing, not a repository, a
// broken invocation, a timeout. Every caller treats null as "no signal available" and stays silent,
// because a staleness hint that cannot be computed must never look like a staleness hint that came
// back clean.
async function git(projectRootPath: string, args: string[]): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('git', args, {
            cwd: projectRootPath,
            timeout: GIT_TIMEOUT_MS,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
        });

        return stdout;
    } catch {
        return null;
    }
}

function lines(stdout: string | null): string[] {
    if (stdout === null) {
        return [];
    }

    return stdout.split('\n').filter((line) => line.length > 0);
}

// Git reports paths with forward slashes on every platform, so scope containment is tested against
// `/` rather than `Path.sep`. The root scope (`.`) contains everything.
export function isUnderScope(path: string, target: string): boolean {
    return target === '.' || path === target || path.startsWith(`${target}/`);
}

// A pathspec for a scope: the repository root is addressed as `.`, anything else by its path. Paths
// are passed after `--`, so a file named like a flag cannot be misread as one.
function scopePathspec(target: string): string[] {
    return [
        '--',
        target === '.' ? '.' : target,
        EXCLUDE_HINTS,
    ];
}

// One read shared by every scope measured in a run: the tracked non-hint files, and the paths with
// uncommitted work. Two git calls total instead of two per scope. Returns null when this is not a git
// repository (or git is unavailable), which turns the whole staleness feature off rather than
// degrading it into guesswork.
export type GitSnapshot = {
    // Every tracked file except hints, repository-relative, forward-slashed.
    trackedFiles: string[];
    // Paths with uncommitted changes — staged, unstaged, or untracked.
    dirty: Set<string>;
};

// `paths` narrows both reads. An inventory of the whole project passes the default; a single `hint
// <path>` read passes just the scopes it is about to report on, so the cost of the signal stays
// proportional to the question asked rather than to the size of the repository.
export async function readGitSnapshot(projectRootPath: string, paths: string[] = ['.']): Promise<GitSnapshot | null> {
    if (paths.length === 0) {
        return null;
    }

    const tracked = await git(projectRootPath, [
        'ls-files',
        '-z',
        '--',
        ...paths,
        EXCLUDE_HINTS,
    ]);

    if (tracked === null) {
        return null;
    }

    // Deliberately not excluding hints here: whether the hint file itself is being edited right now is
    // the thing this read exists to answer.
    const status = await git(projectRootPath, [
        'status',
        '--porcelain',
        '-z',
        '--',
        ...paths,
    ]);

    return {
        trackedFiles: tracked.split('\0').filter((path) => path.length > 0),
        // Unlike every other read here, porcelain status reports paths from the *git* root, which is not
        // the HINT project root when the project sits inside a larger repository.
        dirty: parsePorcelain(status, await repositoryPrefix(projectRootPath)),
    };
}

// How far the HINT project root sits below the git root, as a trailing-slashed path (empty when they
// coincide). A `hint.yml` in a monorepo package is the normal case, and every path this module hands
// back has to be relative to that `hint.yml`, not to the repository containing it.
async function repositoryPrefix(projectRootPath: string): Promise<string> {
    const stdout = await git(projectRootPath, [
        'rev-parse',
        '--show-prefix',
    ]);

    return stdout?.trim() ?? '';
}

// `git status --porcelain -z` emits `XY <path>` records separated by NULs; a rename additionally
// emits its source path as the following record. Both sides are treated as dirty — a hint moved in
// the working tree is still a hint the author is holding open.
function parsePorcelain(stdout: string | null, prefix: string): Set<string> {
    const dirty = new Set<string>();

    if (stdout === null) {
        return dirty;
    }

    for (const record of stdout.split('\0')) {
        if (record.length === 0) {
            continue;
        }

        const path = record.length > 3 ? record.slice(3) : record;

        if (prefix && !path.startsWith(prefix)) {
            continue;
        }

        dirty.add(path.slice(prefix.length));
    }

    return dirty;
}

// The commit that last touched `path`, or null when the path has never been committed — a brand-new
// hint that only exists in the working tree, which has nothing to be stale against.
export async function lastCommitOf(projectRootPath: string, path: string): Promise<string | null> {
    const stdout = await git(projectRootPath, [
        'log',
        '-1',
        '--format=%H',
        '--',
        path,
    ]);
    const sha = stdout?.trim();

    return sha ? sha : null;
}

// How many non-hint files under `target` changed between `commit` and HEAD. This is the churn the
// scope's knowledge has not been reviewed against.
export async function changedFilesSince(projectRootPath: string, commit: string, target: string): Promise<number | null> {
    const stdout = await git(projectRootPath, [
        'diff',
        '--name-only',
        // Without this, diff reports from the git root while `ls-files` reports from the project root,
        // and the two counts stop being about the same set of files.
        '--relative',
        `${commit}..HEAD`,
        ...scopePathspec(target),
    ]);

    return stdout === null ? null : lines(stdout).length;
}

// True when `path` exists somewhere in the recorded history. Separates a spec whose target was
// deleted or renamed (an orphan — a real tail) from a spec written before its target (legitimate,
// and explicitly supported).
export async function isTrackedInHistory(projectRootPath: string, path: string): Promise<boolean> {
    const stdout = await git(projectRootPath, [
        'log',
        '-1',
        '--format=%H',
        '--all',
        '--',
        path,
    ]);

    return Boolean(stdout?.trim());
}

// Git speaks forward slashes on every platform, and so does every message quoting a path back at the
// caller. Anything derived from `Path` has to pass through here before it reaches either.
export function toGitPath(path: string): string {
    return path.split(Path.sep).join('/');
}

// Repository-relative, forward-slashed form of an absolute path.
export function repositoryPath(projectRootPath: string, absolutePath: string): string {
    return toGitPath(Path.relative(projectRootPath, absolutePath));
}
