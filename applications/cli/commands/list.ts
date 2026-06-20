import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class ListCommand implements ICommand {
    private verbose: boolean = false;

    constructor() {}

    static new(verbose: boolean): ListCommand {
        const command = new ListCommand();

        command.verbose = verbose;

        return command;
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

        const table: string[][] = [];

        for (const book of books) {
            const hintbookPaths = await Transpiler.resolveHintbookPaths(projectRootPath, book);
            const installed = hintbookPaths.length > 0;
            const version = installed ? await Transpiler.resolveHintbookVersion(projectRootPath, book) : null;

            if (this.verbose) {
                for (const hintbookPath of installed ? hintbookPaths : []) {
                    table.push([
                        book,
                        version ?? '(version unknown)',
                        installed ? 'installed' : 'not found',
                        Path.relative(projectRootPath, hintbookPath),
                    ]);
                }

                if (!installed) {
                    table.push([
                        book,
                        '(version unknown)',
                        'not found',
                        book,
                    ]);
                }
            } else {
                table.push([
                    book,
                    version ?? '(version unknown)',
                    installed ? 'installed' : 'not found',
                ]);
            }
        }

        this.printTable(table);
    }

    private printTable(rows: string[][]): void {
        if (rows.length === 0) {
            return;
        }

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
