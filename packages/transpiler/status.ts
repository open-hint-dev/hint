import * as Path from 'node:path';

import type { GitHistoryIndex, GitSnapshot } from './git.js';
import type { HintbookData } from './hintbook.js';
import type { FileDrift } from './lock.js';
import type { HoleState } from './merge.js';
import type { ScopeStaleness } from './staleness.js';
import { planEmit, renderArtifact } from './emit.js';
import { isTrackedInHistory, readGitHistoryIndex, readGitSnapshot, readGitTimeoutCount, resetGitTimeoutCount, toGitPath } from './git.js';
import { isPathExists, readFile } from './helper.js';
import { collectFileNodes, computeDrift, hashTargetFiles, loadLock } from './lock.js';
import { lintHintFiles } from './lint.js';
import { inspectHoles } from './merge.js';
import { collectIncludedPaths, listHintFiles, parseHintFile, parseHintFiles } from './parser.js';
import { findUnreviewedBlocks } from './provenance.js';
import { hintTargetName, isFolderHintPath } from './resolve.js';
import { collectContractScopes, measureStaleness } from './staleness.js';

// What can be wrong with a piece of recorded knowledge, in the order a reader should care about it:
//
//   orphan   — the target was removed from the repository; the knowledge describes nothing
//   outdated — a hole was implemented against a spec that has since changed
//   drifted  — the target was locked and no longer matches what was locked
//   stale    — the target has moved substantially since the knowledge was last written
//   unfilled — the spec declares holes nobody has implemented yet
//   unlocked — a companion spec in a locking project that was never locked
//   pending  — the target does not exist yet and never did; a spec written ahead of its code
//
// `pending` is informational, not a defect: writing the spec first is explicitly supported.
// `unfilled` is work outstanding rather than something come loose, but it is counted, because a
// repository whose specs describe work nobody has done is exactly what an inventory should surface.
export type StatusKind = 'broken' | 'vocab' | 'lint' | 'orphan' | 'outdated' | 'drifted' | 'stale' | 'unfilled' | 'unlocked' | 'unreviewed' | 'pending';

const KIND_ORDER: StatusKind[] = [
    'broken',
    'vocab',
    'lint',
    'orphan',
    'outdated',
    'drifted',
    'stale',
    'unfilled',
    'unlocked',
    'unreviewed',
    'pending',
];

export type StatusEntry = {
    kind: StatusKind;
    // Repository-relative path of the hint file.
    hint: string;
    // Repository-relative path of what it describes.
    target: string;
    detail: string;
    staleness?: ScopeStaleness;
    provenance?: { author?: string; email?: string; commit?: string; date?: string; ageDays?: number; marker: boolean };
};

export type StatusReport = {
    entries: StatusEntry[];
    // How many hint files were inventoried. Zero means the report is about an empty set and must not
    // be presented as a clean bill of health.
    scanned: number;
    // Whether staleness could be evaluated at all (a git repository with git available).
    git: boolean;
    // Whether the project uses the contract layer, which is what makes `drifted`/`unlocked` meaningful.
    locked: boolean;
    gitTimeouts: number;
};

function driftDetail(drift: FileDrift): string | null {
    if (drift.status === 'fresh') {
        return null;
    }

    if (drift.status === 'new') {
        return 'companion spec has never been locked';
    }

    if (drift.status === 'inherited') {
        return 'inherited context or vocabulary changed since it was locked';
    }

    if (drift.status === 'unknown') {
        return 'lock has no block detail — run hint lock to refresh it';
    }

    if (drift.status === 'drifted-output') {
        return 'the generated output changed since it was locked';
    }

    const diff = drift.diff!;
    const count = diff.changed.length + diff.added.length + diff.removed.length;
    const names = [
        ...diff.changed,
        ...diff.added,
        ...diff.removed,
    ].slice(0, 3);

    return `${count} block(s) drifted since it was locked: ${names.join(', ')}${count > names.length ? ', …' : ''}`;
}

// Classifies one hint file whose target is absent. The distinction is only decidable from history:
// a target that was once committed and is now gone was deleted or renamed, and its knowledge is a
// tail nobody will notice otherwise; a target that never existed is a spec written ahead of its code.
// Without git the two are indistinguishable, so neither is claimed.
async function classifyAbsentTarget(
    projectRootPath: string,
    snapshot: GitSnapshot | null,
    history: GitHistoryIndex | null,
    target: string,
): Promise<StatusKind | null> {
    if (snapshot === null) {
        return null;
    }

    const tracked = history ? [...history.paths].some((path) => path === target || path.startsWith(`${target}/`)) : await isTrackedInHistory(projectRootPath, target);
    return tracked ? 'orphan' : 'pending';
}

// Walks every `.hint` in the project and reports what has come loose from the code it describes.
// This is the inventory pass — the one place that answers "what has accumulated?" without being
// asked about a specific path, because knowledge that nobody queries is exactly the knowledge that
// rots unnoticed.
export async function inspectProject(
    projectRootPath: string,
    hintbooks: HintbookData[],
    options: { repositoryKind?: 'code' | 'knowledge'; agentAuthors?: string[] } = {},
): Promise<StatusReport> {
    resetGitTimeoutCount();
    const allHintPaths = (await listHintFiles(projectRootPath)).map((hintFile) => Path.join(projectRootPath, hintFile));
    const included = await collectIncludedPaths(projectRootPath, allHintPaths);
    // Shared `@include` fragments describe no path, so they are not part of the inventory at all —
    // counting them would make every project with shared fragments look permanently incomplete.
    const hintPaths = allHintPaths.filter((hintPath) => !included.has(hintPath));

    const snapshot = await readGitSnapshot(projectRootPath);
    const history = snapshot ? await readGitHistoryIndex(projectRootPath) : null;
    const lock = await loadLock(projectRootPath);

    const report: StatusReport = {
        entries: [],
        scanned: hintPaths.length,
        git: snapshot !== null,
        locked: lock !== null,
        gitTimeouts: 0,
    };

    if (hintPaths.length === 0) {
        report.gitTimeouts = readGitTimeoutCount();
        return report;
    }

    const validHintPaths: string[] = [];

    for (const hintPath of hintPaths) {
        try {
            await parseHintFile(projectRootPath, hintPath);
            validHintPaths.push(hintPath);
        } catch (error: unknown) {
            const relative = toGitPath(Path.relative(projectRootPath, hintPath));

            report.entries.push({
                kind: 'broken',
                hint: relative,
                target: toGitPath(hintTargetName(projectRootPath, hintPath)),
                detail: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const hints = await parseHintFiles(projectRootPath, validHintPaths);
    for (const row of await findUnreviewedBlocks(projectRootPath, hints, options.agentAuthors)) {
        const absoluteHint = Path.join(projectRootPath, row.hint);
        report.entries.push({
            kind: 'unreviewed',
            hint: `${row.hint}:${row.line}`,
            target: toGitPath(hintTargetName(projectRootPath, absoluteHint)),
            detail: `${row.heading} is agent-authored and unreviewed${row.ageDays === undefined ? '' : ` (${row.ageDays} day(s))`}`,
            provenance: { author: row.author, email: row.email, commit: row.commit, date: row.date, ageDays: row.ageDays, marker: row.marker },
        });
    }
    const lintFindings = (await lintHintFiles(projectRootPath, validHintPaths, hintbooks, { duplicates: false, parsedRepository: hints })).filter(
        (finding) => finding.severity === 'finding',
    );

    for (const finding of lintFindings) {
        report.entries.push({
            kind: finding.kind === 'vocab' ? 'vocab' : 'lint',
            hint: finding.hint,
            target: toGitPath(hintTargetName(projectRootPath, Path.join(projectRootPath, finding.hint))),
            detail: `${finding.line ? `line ${finding.line}: ` : ''}${finding.detail}`,
        });
    }
    const contracts = collectContractScopes(hints, hintbooks);

    // Holes are work the spec asked for. Both sides are derivable — a fresh render supplies the stubs,
    // the file on disk supplies what was actually written — so nothing here needs a bookkeeping file
    // that could itself fall out of date.
    const holes = new Map<string, HoleState[]>();

    for (const unit of planEmit(hints, hintbooks).units) {
        const existing = await readFile(Path.join(projectRootPath, unit.output));

        if (existing !== null) {
            holes.set(unit.output, inspectHoles(existing, renderArtifact(unit, hintbooks)));
        }
    }

    const drifts = new Map<string, FileDrift>();

    if (lock) {
        const targetHashes = await hashTargetFiles(
            projectRootPath,
            collectFileNodes(hints).map((file) => file.name),
        );

        for (const drift of computeDrift(hints, lock, hintbooks, targetHashes)) {
            drifts.set(drift.name, drift);
        }
    }

    for (const absoluteHintPath of validHintPaths) {
        const hintPath = toGitPath(Path.relative(projectRootPath, absoluteHintPath));
        const target = toGitPath(hintTargetName(projectRootPath, absoluteHintPath));

        if (!(await isPathExists(Path.join(projectRootPath, target)))) {
            if (options.repositoryKind === 'knowledge') continue;
            const kind = await classifyAbsentTarget(projectRootPath, snapshot, history, target);

            if (kind) {
                const detail = kind === 'orphan' ? 'target was removed from the repository' : 'target has not been written yet';

                report.entries.push({ kind, hint: hintPath, target, detail });
            }

            continue;
        }

        // A hole implemented against a spec that has since changed is the most precise finding
        // available — it names a specific body and a specific version — so it outranks everything else.
        const state = holes.get(target) ?? [];
        const outdated = state.filter((hole) => hole.outdated);
        const unfilled = state.filter((hole) => !hole.filled);

        if (outdated.length > 0) {
            report.entries.push({
                kind: 'outdated',
                hint: hintPath,
                target,
                detail: `${outdated.length} implemented hole(s) written against an older spec: ${outdated.map((hole) => hole.label).join(', ')}`,
            });

            continue;
        }

        // Drift is measured, not inferred: when a lock says a target moved, that is more precise than
        // any heuristic and takes precedence over one.
        const drift = isFolderHintPath(absoluteHintPath) ? undefined : drifts.get(target);
        const detail = drift ? driftDetail(drift) : null;

        if (detail) {
            report.entries.push({ kind: drift!.status === 'new' ? 'unlocked' : 'drifted', hint: hintPath, target, detail });

            continue;
        }

        if (unfilled.length > 0) {
            report.entries.push({
                kind: 'unfilled',
                hint: hintPath,
                target,
                detail: `${unfilled.length} hole(s) still hold their emitted stub: ${unfilled.map((hole) => hole.label).join(', ')}`,
            });

            continue;
        }

        if (snapshot === null || options.repositoryKind === 'knowledge') {
            continue;
        }

        const staleness = await measureStaleness(projectRootPath, snapshot, {
            hintPath,
            target,
            contract: contracts.get(target) ?? false,
        }, history ?? undefined);

        if (staleness?.stale) {
            const moved = staleness.total === 1 ? 'the target changed' : `${staleness.changed} of ${staleness.total} files under the target changed`;

            report.entries.push({
                kind: 'stale',
                hint: hintPath,
                target,
                detail: `${moved} since this hint was last updated`,
                staleness,
            });
        }
    }

    report.entries.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0));

    report.gitTimeouts = readGitTimeoutCount();
    return report;
}

// Everything except `pending`, which records a supported authoring order rather than a problem.
export function countFindings(report: StatusReport): number {
    return report.entries.filter((entry) => entry.kind !== 'pending' && entry.kind !== 'unreviewed').length;
}

export function countPending(report: StatusReport): number {
    return report.entries.filter((entry) => entry.kind === 'pending').length;
}

// Findings only. `pending` stays in the report — `--json` and the summary count still carry it — but a
// spec-first project would otherwise open every inventory with a screenful of rows that are working as
// intended, and burying the real tails under them is how a report stops being read.
export function formatStatus(report: StatusReport): string {
    const entries = report.entries.filter((entry) => entry.kind !== 'pending');
    const width = Math.max(0, ...entries.map((entry) => entry.hint.length));

    return entries.map((entry) => `${entry.kind.padEnd(8)}  ${entry.hint.padEnd(width)}  ${entry.detail}`).join('\n');
}
