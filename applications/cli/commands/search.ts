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

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);
        const results = await Transpiler.searchHints(projectRootPath, this.query, { limit: this.limit, hintbooks });

        // A ranked list with nothing strong in it reads as confident even when it is noise, because
        // scores are corpus-relative. Say so on stderr — the results still print, unfiltered.
        if (results.length > 0 && results.every((result) => result.weak)) {
            process.stderr.write(`hint: no strong match for '${this.query}' — every result matched under half the query terms.\n`);
        } else if (results.length === 0) {
            process.stderr.write(`hint: no hint covers this query.\n`);
        }

        process.stdout.write(`${JSON.stringify({ query: this.query, count: results.length, results }, null, 2)}\n`);
    }
}
