import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

// Exit semantics, uniform across every command that takes paths:
//   0 — the operation ran and succeeded
//   1 — the operation ran and a check failed (e.g. a declared surface is missing)
//   2 — nothing the caller asked for could be resolved, so the operation had no subject
// The distinction that matters is 0 vs 2: a command must never report success over an empty set.
export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_UNRESOLVED = 2;

// Where a path with no spec of its own gets its knowledge from, phrased for the caller.
async function inheritedFrom(projectRootPath: string, target: string | null): Promise<string> {
    const ancestor = target === null ? null : await Transpiler.findNearestFolderHint(projectRootPath, target);

    return ancestor ? `returning inherited context from ${ancestor}` : 'and nothing above it applies either';
}

// Says out loud what each requested path actually matched, one line per path that did not resolve to a
// spec of its own. Returns how many did not. Silent when everything resolved, so a clean run stays clean.
export async function reportResolution(projectRootPath: string, resolution: Transpiler.Resolution): Promise<number> {
    let unresolved = 0;

    for (const request of resolution.requests) {
        if (request.status === 'spec') {
            continue;
        }

        unresolved += 1;

        if (request.hintPath === null && request.target === null) {
            process.stderr.write(`hint: '${request.request}' matched no .hint files.\n`);

            continue;
        }

        const inherited = await inheritedFrom(projectRootPath, request.target);

        if (request.status === 'missing') {
            process.stderr.write(`hint: ${request.request} does not exist in this repository and has no spec; ${inherited}.\n`);

            continue;
        }

        process.stderr.write(`hint: no spec of its own for ${request.request}; ${inherited}.\n`);
    }

    return unresolved;
}

// A read is the only moment we can count on: an agent queries HINT before it edits, and it does not
// reliably come back afterwards to record what changed. So the staleness signal rides the read rather
// than waiting for a maintenance step nobody runs.
export const STALE_REPORT_LIMIT = 3;

// Above this many requested paths the call is a sweep, not a focused lookup, and per-scope git reads
// stop being worth their latency. The reference closure is excluded from the check for the same
// reason — only the paths the caller actually named are measured.
export const STALE_REQUEST_LIMIT = 10;

// The hint file that governs a requested path: its own spec when it has one, otherwise the nearest
// ancestor folder hint it inherits from. That ancestor is the file that would have to be updated, so
// it is the one worth naming.
async function governingHintPath(projectRootPath: string, request: Transpiler.PathRequest): Promise<string | null> {
    if (request.status === 'spec' && request.hintPath) {
        return Transpiler.repositoryPath(projectRootPath, request.hintPath);
    }

    if (request.target === null) {
        return null;
    }

    const ancestor = await Transpiler.findNearestFolderHint(projectRootPath, request.target);

    return ancestor === null ? null : Transpiler.toGitPath(ancestor);
}

// Says when the code under a scope has moved substantially since its knowledge was last written down.
// Advisory and quiet by construction: no git, no commits, or an in-flight edit all produce nothing,
// and the phrasing states the observation rather than issuing an instruction — the reader decides
// whether the knowledge is actually invalidated.
export async function reportStaleness(projectRootPath: string, resolution: Transpiler.Resolution, contracts: Map<string, boolean>): Promise<void> {
    if (resolution.requests.length === 0 || resolution.requests.length > STALE_REQUEST_LIMIT) {
        return;
    }

    const scopes = new Map<string, Transpiler.ScopeInput>();

    for (const request of resolution.requests) {
        const hintPath = await governingHintPath(projectRootPath, request);

        if (hintPath === null || scopes.has(hintPath)) {
            continue;
        }

        const target = Transpiler.toGitPath(Transpiler.hintTargetName(projectRootPath, Path.join(projectRootPath, hintPath)));

        scopes.set(hintPath, { hintPath, target, contract: contracts.get(target) ?? false });
    }

    if (scopes.size === 0) {
        return;
    }

    const snapshot = await Transpiler.readGitSnapshot(projectRootPath, [
        ...[...scopes.values()].map((scope) => scope.target),
        ...scopes.keys(),
    ]);

    if (snapshot === null) {
        return;
    }

    let reported = 0;

    for (const scope of scopes.values()) {
        if (reported >= STALE_REPORT_LIMIT) {
            return;
        }

        const staleness = await Transpiler.measureStaleness(projectRootPath, snapshot, scope);

        if (staleness?.stale) {
            process.stderr.write(
                `hint: ${Transpiler.formatStaleness(staleness)} — re-check it against the code and update it if it no longer holds.\n`,
            );

            reported += 1;
        }
    }
}
