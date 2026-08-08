import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

// One command answering the whole environment question: which CLI, which hintbooks, which versions,
// and whether each one actually resolves on this machine.
export class VersionCommand implements ICommand {
    static new(): VersionCommand {
        return new VersionCommand();
    }

    async execute(): Promise<void> {
        process.stdout.write(`@openhint/cli ${await findCliVersion()}\n`);

        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            return;
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const books = config?.books ?? [];

        if (books.length === 0) {
            process.stdout.write(`No hintbooks registered in ${Transpiler.CONFIG_FILE_YML}. Run 'hint add <book>' to install one.\n`);

            return;
        }

        for (const book of books) {
            const hintbookPaths = await Transpiler.resolveHintbookPaths(projectRootPath, book);

            if (hintbookPaths.length === 0) {
                process.stdout.write(`${book} (not installed)\n`);
                continue;
            }

            const version = await Transpiler.resolveHintbookVersion(projectRootPath, book);
            const locations = hintbookPaths.map((path) => displayPath(projectRootPath, path)).join(', ');

            process.stdout.write(`${book} ${version ?? '(version unknown)'} — ${locations}\n`);
        }
    }
}

// Relative inside the project, absolute outside it — a book installed globally or linked from
// elsewhere should not be reported as a wall of `../..`.
function displayPath(projectRootPath: string, hintbookPath: string): string {
    const relative = Path.relative(projectRootPath, hintbookPath);

    return relative.startsWith('..') ? hintbookPath : relative;
}

export async function findCliVersion(): Promise<string> {
    let folderPath = Path.dirname(fileURLToPath(import.meta.url));

    while (true) {
        const content = await Transpiler.readFile(Path.join(folderPath, 'package.json'));

        if (content !== null) {
            try {
                const packageJson = JSON.parse(content);

                return typeof packageJson.version === 'string' && packageJson.version ? packageJson.version : 'unknown';
            } catch {
                // Malformed package.json — keep walking up.
            }
        }

        const parentPath = Path.dirname(folderPath);

        if (parentPath === folderPath) {
            return 'unknown';
        }

        folderPath = parentPath;
    }
}
