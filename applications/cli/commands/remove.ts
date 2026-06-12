import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { printAgentPrompt } from './config.js';

export class RemoveCommand implements ICommand {
    private books: string[] = [];

    constructor() {}

    static new(books: string[]): RemoveCommand {
        const command = new RemoveCommand();

        command.books = books;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = (await Transpiler.loadConfig(projectRootPath)) ?? {};
        const books = config.books ?? [];

        for (const book of this.books) {
            const entry = books.find((candidate) => matchesBook(candidate, book));

            if (!entry) {
                throw new Error(`Hintbook not registered in ${Transpiler.CONFIG_FILE_YML}: ${book}`);
            }

            books.splice(books.indexOf(entry), 1);
            process.stderr.write(`Removed ${entry}\n`);
        }

        config.books = books;
        await Transpiler.saveConfig(projectRootPath, config);

        await printAgentPrompt(projectRootPath, config);
    }
}

function matchesBook(entry: string, book: string): boolean {
    return (
        entry === book ||
        entry === `${Transpiler.URL_NPM_PREFIX}${book}` ||
        entry === `${Transpiler.URL_FILE_PREFIX}${book}`
    );
}
