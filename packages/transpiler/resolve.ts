import * as FsPromises from 'node:fs/promises';
import Path from 'node:path';

import { HINTBOOKS_FOLDER, isGlobPattern, isInsideProject, isPathExists, isPathFolder, toPortablePath } from './helper.js';

export const HINT_EXT = '.hint';
export const FOLDER_HINT = `_${HINT_EXT}`;

// How a single path the caller asked for resolved:
//   `spec`      — a `.hint` file exists for it (its companion, or the folder's `_.hint`)
//   `inherited` — the path exists on disk but declares nothing of its own, so only ancestor
//                 folder/root context applies to it
//   `missing`   — neither the path nor a spec for it exists; almost always a typo, and the case
//                 that used to return ancestor context as if it were the answer
export type RequestStatus = 'spec' | 'inherited' | 'missing';

// One caller-supplied path argument and what it actually resolved to. `request` is echoed exactly as
// typed so a message can name it back; `matched` counts the hint files it contributed (>1 for a glob).
export type PathRequest = {
    request: string;
    status: RequestStatus;
    hintPath: string | null;
    target: string | null;
    matched: number;
};

// The outcome of resolving every requested path: what each request means, and the flat list of hint
// files to parse. `hintPaths` deliberately includes candidates that do not exist — a nested folder's
// synthesized `_.hint`, or a companion spec for a file that has one but whose target is not written
// yet — because that is what carries inherited context. `requests` is what makes the difference
// visible to the caller instead of silent.
export type Resolution = {
    requests: PathRequest[];
    hintPaths: string[];
};

export function isFolderHintPath(hintPath: string): boolean {
    return Path.basename(hintPath) === FOLDER_HINT;
}

// A directory whose name ends in `.hint` (e.g. `packages.hint/`) is a detached hint store: its hints
// describe the matching real path with the `.hint` tail removed. This lets hints live in a separate
// tree — kept out of, or gitignored from, the folder they document. Strip the suffix from every
// directory segment of the derived target path so `packages.hint/db/schema.ts.hint` describes
// `packages/db/schema.ts`, and the folder hint `os.hint/_.hint` describes `os`.
function stripHintFolderTails(relativeTargetPath: string, isFolderHint: boolean): string {
    const segments = relativeTargetPath.split(Path.sep);

    // For a file hint the last segment is the target file itself, which keeps any `.hint` in its name;
    // every other segment is a folder. For a folder hint every segment, the last included, is a folder.
    const lastFolderIndex = isFolderHint ? segments.length - 1 : segments.length - 2;

    return segments
        .map((segment, index) => (index <= lastFolderIndex && segment.endsWith(HINT_EXT) ? segment.slice(0, -HINT_EXT.length) : segment))
        .join(Path.sep);
}

// The repository-relative path a hint file describes: `src/login.ts.hint` -> `src/login.ts`,
// `src/_.hint` -> `src`, the root `_.hint` -> `.`.
export function hintTargetName(projectRootPath: string, hintPath: string): string {
    const isFolderHint = isFolderHintPath(hintPath);
    const targetPath = isFolderHint ? Path.dirname(hintPath) : hintPath.slice(0, -HINT_EXT.length);
    const relativeTargetPath = Path.relative(projectRootPath, targetPath);

    return toPortablePath(stripHintFolderTails(relativeTargetPath, isFolderHint)) || '.';
}

// The hint file that would describe `path`: a folder's `_.hint`, a `.hint` file given directly, or a
// source file's `<path>.hint` companion. Always returns a candidate — whether it exists is a separate
// question, and the answer to that question is what `resolveRequests` reports.
export async function normalizeHintPath(path: string): Promise<string> {
    if ((await isPathExists(path)) && (await isPathFolder(path))) {
        return Path.join(path, FOLDER_HINT);
    }

    if (Path.extname(path) === HINT_EXT) {
        return path;
    }

    return normalizeHintPath(`${path}${HINT_EXT}`);
}

async function expandGlob(currentPath: string, pattern: string): Promise<string[]> {
    const matches: string[] = [];

    for await (const match of FsPromises.glob(pattern, {
        cwd: currentPath,
        exclude: ['node_modules/**', '.git/**', 'release/**', 'coverage/**', `${HINTBOOKS_FOLDER}/**`],
    })) {
        matches.push(match);
    }

    return matches;
}

// Resolves one concrete (non-glob) path to its hint file, or null when the path escapes the project
// root — a request the tool cannot answer and must not silently drop.
async function resolveConcretePath(projectRootPath: string, currentPath: string, path: string): Promise<string | null> {
    const resolvedPath = Path.resolve(currentPath, path);

    if (!isInsideProject(projectRootPath, resolvedPath)) {
        return null;
    }

    return normalizeHintPath(resolvedPath);
}

export async function normalizeHintPaths(currentPath: string, paths: string[], projectRootPath: string = currentPath): Promise<string[]> {
    const normalizedPaths: string[] = [];

    for (const path of paths) {
        if (isGlobPattern(path)) {
            normalizedPaths.push(...(await normalizeHintPaths(currentPath, await expandGlob(currentPath, path), projectRootPath)));

            continue;
        }

        const hintPath = await resolveConcretePath(projectRootPath, currentPath, path);

        if (hintPath) {
            normalizedPaths.push(hintPath);
        }
    }

    return normalizedPaths;
}

async function resolveRequest(projectRootPath: string, currentPath: string, request: string): Promise<{ request: PathRequest; hintPaths: string[] }> {
    if (isGlobPattern(request)) {
        const matches = await normalizeHintPaths(currentPath, await expandGlob(currentPath, request), projectRootPath);
        const existing: string[] = [];

        for (const hintPath of matches) {
            if (await isPathExists(hintPath)) {
                existing.push(hintPath);
            }
        }

        return {
            request: { request, status: existing.length > 0 ? 'spec' : 'missing', hintPath: null, target: null, matched: existing.length },
            hintPaths: existing,
        };
    }

    const hintPath = await resolveConcretePath(projectRootPath, currentPath, request);

    if (!hintPath) {
        return { request: { request, status: 'missing', hintPath: null, target: null, matched: 0 }, hintPaths: [] };
    }

    const target = hintTargetName(projectRootPath, hintPath);

    if (await isPathExists(hintPath)) {
        return { request: { request, status: 'spec', hintPath, target, matched: 1 }, hintPaths: [hintPath] };
    }

    // No spec of its own. Whether the path itself exists is what separates "nothing declared here, so
    // you get the inherited context" from "you asked for something that is not in this repository".
    const targetExists = await isPathExists(Path.resolve(currentPath, request));

    return {
        request: { request, status: targetExists ? 'inherited' : 'missing', hintPath: null, target, matched: 0 },
        hintPaths: [hintPath],
    };
}

// Resolves every requested path, reporting what each one actually matched. This is the stage that
// makes "matched nothing" distinguishable from "matched and is fine" — every caller of it can then
// say so instead of emitting a success string over an empty set.
export async function resolveRequests(projectRootPath: string, paths: string[], currentPath: string = projectRootPath): Promise<Resolution> {
    const requests: PathRequest[] = [];
    const hintPaths: string[] = [];

    for (const path of paths) {
        const resolved = await resolveRequest(projectRootPath, currentPath, path);

        requests.push(resolved.request);
        hintPaths.push(...resolved.hintPaths);
    }

    return {
        requests,
        hintPaths: [...new Set(hintPaths)],
    };
}

// True when a requested path could not be resolved at all: it names nothing in this repository. This
// is the "you asked for something that is not here" case — a typo, or a glob that matched nothing.
//
// Deliberately NOT true for `inherited`. A real path that declares nothing of its own but inherits
// folder and root knowledge is the most common case in a repository that keeps its knowledge in
// `_.hint` files, and it is a successful lookup: the inherited context is the answer. Failing it
// would make the normal case look like an error and teach callers to ignore the exit code again.
export function resolvedNothing(resolution: Resolution): boolean {
    return resolution.requests.some((request) => request.status === 'missing');
}

// True when not one requested path declares knowledge of its own, whatever it may inherit.
export function matchedNothing(resolution: Resolution): boolean {
    return resolution.requests.every((request) => request.status !== 'spec');
}

// The nearest ancestor folder hint that actually exists above `target`, repo-relative — what a path
// with no spec of its own inherits from. Returns null when nothing above it declares anything either.
export async function findNearestFolderHint(projectRootPath: string, target: string): Promise<string | null> {
    let current = Path.dirname(Path.resolve(projectRootPath, target));

    while (isInsideProject(projectRootPath, current)) {
        const candidate = Path.join(current, FOLDER_HINT);

        if (await isPathExists(candidate)) {
            return Path.relative(projectRootPath, candidate) || FOLDER_HINT;
        }

        const parent = Path.dirname(current);

        if (parent === current) {
            break;
        }

        current = parent;
    }

    return null;
}
