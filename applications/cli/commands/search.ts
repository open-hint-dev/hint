import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class SearchCommand implements ICommand {
    private query: string = '';
    private limit: number = 20;

    constructor() {}

    static new(query: string, limit: number): SearchCommand {
        const command = new SearchCommand();

        command.query = query;
        command.limit = limit;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const results = await Transpiler.searchHints(projectRootPath, this.query, { limit: this.limit });

        process.stdout.write(`${JSON.stringify({ query: this.query, count: results.length, results }, null, 2)}\n`);
    }
}
