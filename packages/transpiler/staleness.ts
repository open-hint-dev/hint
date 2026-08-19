import type { GitHistoryIndex, GitSnapshot } from './git.js';
import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { changedFilesFromHistory, changedFilesSince, isUnderScope, lastCommitOf } from './git.js';
import { collectScopeNodes } from './parser.js';
import { collectSurfaces } from './verify.js';

// Two thresholds, because two kinds of knowledge rot at very different rates.
//
// A scope that *declares surfaces* (`func`, `entity`, `field` — whatever the active hintbooks flag
// `surface: true`) restates the shape of the code. When the code moves, the restatement is wrong,
// and it is wrong immediately.
//
// A scope that only *explains* (`decision`, `invariant`, `rule`, `bad`) records why the code is the
// way it is. That survives refactoring: a rationale written two years and a hundred commits ago is
// usually still the rationale. Holding it to the same bar would fire on every read, and a signal
// that always fires is a signal agents learn to skip — which is exactly the failure this is meant
// to correct.
//
// The measure is the share of the scope's files that changed, not a raw commit count, so it means
// the same thing for a single-file companion spec and for the repository root.
export const CONTRACT_CHANGE_RATIO = 0.2;
export const KNOWLEDGE_CHANGE_RATIO = 0.5;

export type ScopeStaleness = {
    // Repository-relative path of the hint file, forward-slashed.
    hintPath: string;
    // Repository-relative path of what it describes: a file, a folder, or `.` for the root.
    target: string;
    // Non-hint files under the target that changed since the hint was last committed.
    changed: number;
    // Non-hint files tracked under the target now.
    total: number;
    // The scope declares surfaces the code must contain, so it is held to the tighter threshold.
    contract: boolean;
    stale: boolean;
};

export type ScopeInput = {
    hintPath: string;
    target: string;
    contract: boolean;
};

function threshold(contract: boolean): number {
    return contract ? CONTRACT_CHANGE_RATIO : KNOWLEDGE_CHANGE_RATIO;
}

// How far the code under a scope has moved since its knowledge was last written down. Returns null
// whenever there is nothing honest to say: no git, a hint that has never been committed, a hint the
// author is editing right now, or a scope with no tracked files to measure against. Silence is the
// correct answer in all of those — an unmeasurable scope must not be reported as a fresh one.
export async function measureStaleness(
    projectRootPath: string,
    snapshot: GitSnapshot,
    scope: ScopeInput,
    history?: GitHistoryIndex,
): Promise<ScopeStaleness | null> {
    // Uncommitted work on the hint file itself means it is being maintained as we speak. Measuring it
    // against its last commit would nag the author mid-edit.
    if (snapshot.dirty.has(scope.hintPath)) {
        return null;
    }

    const commit = history ? (history.lastCommitByPath.get(scope.hintPath) ?? null) : await lastCommitOf(projectRootPath, scope.hintPath);

    if (commit === null) {
        return null;
    }

    const total = snapshot.trackedFiles.filter((path) => isUnderScope(path, scope.target)).length;

    if (total === 0) {
        return null;
    }

    const changed = history ? changedFilesFromHistory(history, commit, scope.target) : await changedFilesSince(projectRootPath, commit, scope.target);

    if (changed === null) {
        return null;
    }

    return {
        hintPath: scope.hintPath,
        target: scope.target,
        changed,
        total,
        contract: scope.contract,
        stale: changed > 0 && changed / total >= threshold(scope.contract),
    };
}

// One line, phrased as the observation rather than as an instruction. It reports what moved and how
// much; whether that invalidates the knowledge is a judgement the reader makes, and stating it as a
// fact is what keeps the signal credible when it is occasionally wrong.
export function formatStaleness(staleness: ScopeStaleness): string {
    const moved =
        staleness.total === 1
            ? `${staleness.target} changed since`
            : `${staleness.changed} of ${staleness.total} files under ${staleness.target} changed since`;
    const kind = staleness.contract ? 'declares surfaces the code must contain' : 'records knowledge';

    return `${moved} ${staleness.hintPath} was last updated, and it ${kind}`;
}

// Which scopes in a parsed tree restate the shape of the code, keyed by the target path each one
// governs. Derived from the hintbooks' existing `surface: true` flag rather than a new piece of
// metadata: the keywords that assert something the code must contain are precisely the ones whose
// knowledge goes stale when the code moves.
export function collectContractScopes(hints: HintData[], hintbooks: HintbookData[]): Map<string, boolean> {
    return new Map(
        collectScopeNodes(hints).map((scope) => [
            scope.name,
            collectSurfaces(scope.node, hintbooks).length > 0,
        ]),
    );
}
