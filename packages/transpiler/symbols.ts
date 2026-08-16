// Layer 8 — what is actually in the file.
//
// A language adapter is an external command that reports a file's real symbols as JSON. Keeping it
// external is deliberate: vendoring a TypeScript, Go, and Python parser into the CLI would multiply
// its install size and its failure modes, and would put language expertise in the one place that has
// stayed language-free. Vocabularies are plugins; languages should be too.
//
// The adapter is declared on an emit pack, because a pack is already the per-target unit. A pack with
// `symbols` and no templates is a pure adapter, and needs no new concept to register.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ADAPTER_TIMEOUT_MS = 20_000;

// One declared name in a symbol: a parameter, or a field of a structure. `type` is absent when the
// adapter could not determine one — which is treated exactly like a spec that did not state one.
export type SymbolMember = {
    name: string;
    type?: string;
};

// A symbol the file actually contains. `kind` is the adapter's own word for it (`function`,
// `interface`, `struct`, `class`); nothing here interprets it, so a new language needs no changes.
export type CodeSymbol = {
    kind: string;
    name: string;
    params?: SymbolMember[];
    returns?: string;
    fields?: SymbolMember[];
};

function parseMembers(value: unknown): SymbolMember[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const members: SymbolMember[] = [];

    for (const entry of value) {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';

        if (name) {
            members.push({ name, type: typeof entry?.type === 'string' && entry.type.trim() ? entry.type.trim() : undefined });
        }
    }

    return members;
}

// Parses an adapter's stdout. Anything malformed yields null rather than a partial reading: a
// half-understood symbol table would produce confident, wrong verification findings, which is worse
// than falling back to the presence lint.
export function parseSymbols(stdout: string): CodeSymbol[] | null {
    let data: unknown;

    try {
        data = JSON.parse(stdout);
    } catch {
        return null;
    }

    const list = (data as { symbols?: unknown })?.symbols;

    if (!Array.isArray(list)) {
        return null;
    }

    const symbols: CodeSymbol[] = [];

    for (const entry of list) {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';

        if (!name) {
            continue;
        }

        symbols.push({
            kind: typeof entry?.kind === 'string' ? entry.kind.trim() : '',
            name,
            params: parseMembers(entry?.params),
            returns: typeof entry?.returns === 'string' && entry.returns.trim() ? entry.returns.trim() : undefined,
            fields: parseMembers(entry?.fields),
        });
    }

    return symbols;
}

// Splits a command template into argv, substituting `{file}`. Deliberately not a shell: the file path
// reaches the adapter as one argument whatever it contains, so a path with a space or a quote in it
// cannot turn into two arguments or into something else entirely.
export function adapterCommand(template: string, file: string): string[] {
    return template
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.replace('{file}', file));
}

// What an adapter had to say. `symbols` is null whenever there is no honest answer, and the two ways
// that happens are kept apart on purpose:
//
//   - no adapter configured for this target — expected, and the caller degrades to the presence lint
//     exactly as a project without adapters always has;
//   - an adapter *was* configured and did not answer — a broken install, and the caller must say so.
//
// Collapsing the two is how a project silently loses shape checking it believes it has: the command
// 404s, every file falls back to the name lint, and the run reports a clean verification of a check
// that never ran. `failure` exists so that cannot happen quietly.
export type SymbolReading = {
    symbols: CodeSymbol[] | null;
    failure?: string;
};

function describe(error: unknown): string {
    const reason = error as { code?: string; killed?: boolean; stderr?: string };

    if (reason?.killed) {
        return `timed out after ${ADAPTER_TIMEOUT_MS / 1000}s`;
    }

    const stderr = (reason?.stderr ?? '').trim().split('\n')[0]?.trim();

    if (stderr) {
        return stderr;
    }

    return reason?.code ? `failed (${reason.code})` : 'failed';
}

export async function readSymbols(projectRootPath: string, command: string | undefined, file: string): Promise<SymbolReading> {
    if (!command) {
        return { symbols: null };
    }

    const [
        executable,
        ...args
    ] = adapterCommand(command, file);

    if (!executable) {
        return { symbols: null, failure: 'the configured command is empty' };
    }

    try {
        const { stdout } = await execFileAsync(executable, args, {
            cwd: projectRootPath,
            timeout: ADAPTER_TIMEOUT_MS,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
        });

        const symbols = parseSymbols(stdout);

        // An adapter that exits cleanly and prints something unreadable is as broken as one that
        // crashes, and is easier to miss — it is a contract violation, not a missing install.
        return symbols === null ? { symbols: null, failure: 'produced no readable symbol table' } : { symbols };
    } catch (error) {
        return { symbols: null, failure: describe(error) };
    }
}
