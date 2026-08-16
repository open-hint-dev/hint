import * as Path from 'node:path';

import type { GitSnapshot } from './git.js';
import type { HintbookData } from './hintbook.js';
import type { FileDrift } from './lock.js';
import type { ScopeStaleness } from './staleness.js';
import { isTrackedInHistory, readGitSnapshot, toGitPath } from './git.js';
import { isPathExists } from './helper.js';
import { collectFileNodes, computeDrift, hashTargetFiles, loadLock } from './lock.js';
import { collectIncludedPaths, listHintFiles, parseHintFiles } from './parser.js';
import { hintTargetName, isFolderHintPath } from './resolve.js';
import { collectContractScopes, measureStaleness } from './staleness.js';

// What can be wrong with a piece of recorded knowledge, in the order a reader should care about it:
//
//   orphan   — the target was removed from the repository; the knowledge describes nothing
//   drifted  — the target was locked and no longer matches what was locked
//   stale    — the target has moved substantially since the knowledge was last written
//   unlocked — a companion spec in a locking project that was never locked
//   pending  — the target does not exist yet and never did; a spec written ahead of its code
//
// `pending` is informational, not a defect: writing the spec first is explicitly supported.
export type StatusKind = 'orphan' | 'drifted' | 'stale' | 'unlocked' | 'pending';

const KIND_ORDER: StatusKind[] = [
    'orphan',
    'drifted',
    'stale',
    'unlocked',
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
async function classifyAbsentTarget(projectRootPath: string, snapshot: GitSnapshot | null, target: string): Promise<StatusKind | null> {
    if (snapshot === null) {
        return null;
    }

    return (await isTrackedInHistory(projectRootPath, target)) ? 'orphan' : 'pending';
}

// Walks every `.hint` in the project and reports what has come loose from the code it describes.
// This is the inventory pass — the one place that answers "what has accumulated?" without being
// asked about a specific path, because knowledge that nobody queries is exactly the knowledge that
// rots unnoticed.
export async function inspectProject(projectRootPath: string, hintbooks: HintbookData[]): Promise<StatusReport> {
    const allHintPaths = (await listHintFiles(projectRootPath)).map((hintFile) => Path.join(projectRootPath, hintFile));
    const included = await collectIncludedPaths(projectRootPath, allHintPaths);
    // Shared `@include` fragments describe no path, so they are not part of the inventory at all —
    // counting them would make every project with shared fragments look permanently incomplete.
    const hintPaths = allHintPaths.filter((hintPath) => !included.has(hintPath));

    const snapshot = await readGitSnapshot(projectRootPath);
    const lock = await loadLock(projectRootPath);

    const report: StatusReport = {
        entries: [],
        scanned: hintPaths.length,
        git: snapshot !== null,
        locked: lock !== null,
    };

    if (hintPaths.length === 0) {
        return report;
    }

    const hints = await parseHintFiles(projectRootPath, hintPaths);
    const contracts = collectContractScopes(hints, hintbooks);

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

    for (const absoluteHintPath of hintPaths) {
        const hintPath = toGitPath(Path.relative(projectRootPath, absoluteHintPath));
        const target = toGitPath(hintTargetName(projectRootPath, absoluteHintPath));

        if (!(await isPathExists(Path.join(projectRootPath, target)))) {
            const kind = await classifyAbsentTarget(projectRootPath, snapshot, target);

            if (kind) {
                const detail = kind === 'orphan' ? 'target was removed from the repository' : 'target has not been written yet';

                report.entries.push({ kind, hint: hintPath, target, detail });
            }

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

        if (snapshot === null) {
            continue;
        }

        const staleness = await measureStaleness(projectRootPath, snapshot, {
            hintPath,
            target,
            contract: contracts.get(target) ?? false,
        });

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

    report.entries.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.hint.localeCompare(b.hint));

    return report;
}

// Everything except `pending`, which records a supported authoring order rather than a problem.
export function countFindings(report: StatusReport): number {
    return report.entries.filter((entry) => entry.kind !== 'pending').length;
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
