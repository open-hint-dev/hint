// What every out-of-process built-in adapter needs: run a command, and turn whatever happened into
// either a symbol table or a stated reason there is none. Shared so that "the interpreter is missing"
// and "the interpreter crashed" read the same way whichever language asked.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { AdapterReading } from './contract.js';
import { parseSymbols } from './contract.js';

const execFileAsync = promisify(execFile);

// Generous: a cold `go run` compiles the helper before it parses anything. Still bounded, because a
// hung toolchain must not hang `hint verify`.
const TIMEOUT_MS = 30_000;

export function describeFailure(error: unknown): string {
    const reason = error as { code?: string; killed?: boolean; stderr?: string };

    if (reason?.killed) {
        return `timed out after ${TIMEOUT_MS / 1000}s`;
    }

    // ENOENT from a spawn means the interpreter itself is not on PATH, which is a different problem
    // from the interpreter disliking the file, and has a different fix.
    if (reason?.code === 'ENOENT') {
        return 'not installed';
    }

    const stderr = (reason?.stderr ?? '').trim().split('\n')[0]?.trim();

    return stderr || (reason?.code ? `failed (${reason.code})` : 'failed');
}

// For adapters whose helper produces the *document* rather than a symbol table — a TOML file read by
// Python, say — leaving the mapping onto symbols to one implementation shared across formats.
export async function runText(executable: string, args: string[], cwd: string): Promise<{ stdout: string | null; failure?: string }> {
    try {
        const { stdout } = await execFileAsync(executable, args, {
            cwd,
            timeout: TIMEOUT_MS,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
        });

        return { stdout };
    } catch (error: unknown) {
        return { stdout: null, failure: describeFailure(error) };
    }
}

export async function runAdapter(executable: string, args: string[], cwd: string): Promise<AdapterReading> {
    try {
        const { stdout } = await execFileAsync(executable, args, {
            cwd,
            timeout: TIMEOUT_MS,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
        });

        const symbols = parseSymbols(stdout);

        return symbols === null ? { symbols: null, failure: 'produced no readable symbol table' } : { symbols };
    } catch (error: unknown) {
        return { symbols: null, failure: describeFailure(error) };
    }
}
