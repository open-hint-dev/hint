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
