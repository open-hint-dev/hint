// Layer 8 — what is actually in the file.
//
// A language adapter reports a file's real symbols. Two kinds answer to the same contract:
//
//   - a **built-in**, addressed as `hint:<name>`, shipped with the engine and costing no install;
//   - an **external command**, any program that prints the symbol table as JSON.
//
// Both exist on purpose. A built-in makes the common languages work with nothing to set up, and
// every one of them parses with that language's own parser rather than one we wrote. An external
// command keeps the door open for every language that has no built-in, can be written in that
// language itself, and can override a built-in when a project wants something different.
//
// The adapter is declared on an emit pack, because a pack is already the per-target unit. A pack with
// `symbols` and no templates is a pure adapter, and needs no new concept to register.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { CodeSymbol } from './adapters/contract.js';
import { parseSymbols } from './adapters/contract.js';
import { BUILTIN_PREFIX, builtinNames, findBuiltinAdapter } from './adapters/index.js';

// Re-exported so the symbol contract stays reachable on `@openhint/transpiler`'s surface, wherever it
// happens to live inside.
export type { AdapterReading, CodeSymbol, SymbolMember } from './adapters/contract.js';
export { parseSymbols } from './adapters/contract.js';

const execFileAsync = promisify(execFile);

const ADAPTER_TIMEOUT_MS = 20_000;

// What an adapter had to say. `symbols` is null whenever there is no honest answer, and the two ways
// that happens are kept apart on purpose:
//
//   - no adapter configured for this target — expected, and the caller degrades to the presence lint
//     exactly as a project without adapters always has;
//   - an adapter *was* configured and did not answer — a broken install, and the caller must say so.
//
// Collapsing the two is how a project silently loses shape checking it believes it has: the command
// fails, every file falls back to the name lint, and the run reports a clean verification of a check
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

export async function readSymbols(projectRootPath: string, command: string | undefined, file: string): Promise<SymbolReading> {
    if (!command) {
        return { symbols: null };
    }

    // `hint:<name>` addresses an adapter the engine ships. Everything else is a command, exactly as
    // before — so a pack can still override a built-in by naming a program instead.
    const builtin = findBuiltinAdapter(command);

    if (builtin) {
        return builtin(projectRootPath, file);
    }

    // Asking for a built-in that does not exist is a typo in a manifest, not a missing install, and
    // running it as a command would report `hint:kotlin` as an executable that is not on PATH.
    if (command.startsWith(BUILTIN_PREFIX)) {
        const available = builtinNames()
            .map((name) => `${BUILTIN_PREFIX}${name}`)
            .join(', ');

        return { symbols: null, failure: `there is no built-in adapter '${command}' — available: ${available}` };
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
    } catch (error: unknown) {
        return { symbols: null, failure: describe(error) };
    }
}
