import * as FsPromises from 'node:fs/promises';

import { collectSymbols } from './symbols.js';

const USAGE = `hint-adapter-typescript <file>

Reports the symbols a TypeScript file declares, as the JSON symbol table HINT consumes:

  { "symbols": [ { "kind": "function", "name": "settle",
                   "params": [{ "name": "invoice", "type": "Invoice" }],
                   "returns": "Receipt" } ] }

Register it on an emit pack so 'hint verify' checks a spec against the shape of the
code rather than the presence of a name:

  { "target": "typescript", "match": ["*.ts"],
    "symbols": "npx --yes @openhint/adapter-typescript {file}" }
`;

export async function main(): Promise<void> {
    const file = process.argv[2];

    if (!file || file === '--help' || file === '-h') {
        process.stderr.write(USAGE);
        process.exitCode = file ? 0 : 2;

        return;
    }

    let content: string;

    try {
        content = await FsPromises.readFile(file, 'utf8');
    } catch (error: unknown) {
        // Exiting non-zero with nothing on stdout is the contract for "no answer": HINT falls back to
        // its presence lint rather than treating an unreadable file as a file with no symbols, which
        // would turn every missing output into a wall of false conformance failures.
        process.stderr.write(`hint-adapter-typescript: cannot read '${file}': ${(error as Error).message}\n`);
        process.exitCode = 2;

        return;
    }

    process.stdout.write(`${JSON.stringify({ symbols: collectSymbols(file, content) })}\n`);
}
