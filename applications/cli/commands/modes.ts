import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class ModesCommand implements ICommand {
    static new(): ModesCommand {
        return new ModesCommand();
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const books = config?.books ?? [];

        if (books.length === 0) {
            process.stdout.write(`No hintbooks registered in ${Transpiler.CONFIG_FILE_YML}.\n`);
            process.stdout.write(`Run 'hint add <book>' to install a hintbook.\n`);
            return;
        }

        const rows: string[][] = [
            [
                'mode',
                'name',
                'description',
                'hintbook',
            ],
        ];

        for (const book of books) {
            const hintbookPaths = await Transpiler.resolveHintbookPaths(projectRootPath, book);

            if (hintbookPaths.length === 0) {
                process.stderr.write(`Skipping hintbook '${book}': not found\n`);
                continue;
            }

            for (const hintbookPath of hintbookPaths) {
                const hintbook = await Transpiler.loadHintbook(hintbookPath);
                const source = hintbook.id || hintbook.name || Path.basename(hintbookPath);

                for (const mode of hintbook.runningModes) {
                    rows.push([
                        mode.mode,
                        mode.name,
                        mode.description,
                        source,
                    ]);
                }
            }
        }

        if (rows.length === 1) {
            process.stdout.write('No modes found in registered hintbooks.\n');
            return;
        }

        this.printTable(rows);
    }

    private printTable(rows: string[][]): void {
        const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
        const widths = Array(maxCols).fill(0);

        for (const row of rows) {
            for (let i = 0; i < maxCols; i++) {
                widths[i] = Math.max(widths[i]!, row[i]?.length ?? 0);
            }
        }

        const header = rows[0]!.map((cell, i) => cell.padEnd(widths[i]!));
        const separator = rows[0]!.map((_, i) => '-'.padEnd(widths[i]!, '-'));

        process.stdout.write(`${header.join('  ')}\n`);
        process.stdout.write(`${separator.join('  ')}\n`);

        for (let r = 1; r < rows.length; r++) {
            process.stdout.write(rows[r]!.map((cell, i) => (cell ?? '').padEnd(widths[i]!)).join('  ') + '\n');
        }
    }
}
