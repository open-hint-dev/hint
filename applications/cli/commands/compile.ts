import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class CompileCommand implements ICommand {
    private paths: string[] = [];
    private mode: string = '';
    private dryRun: boolean = false;

    constructor() {}

    static new(paths: string[], mode: string, dryRun: boolean): CompileCommand {
        const command = new CompileCommand();

        command.paths = paths;
        command.mode = mode;
        command.dryRun = dryRun;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        const hints = await Transpiler.parseHints(projectRootPath, this.paths, this.dryRun);
        const output = await Transpiler.compileHints(hints, hintbooks, this.mode);

        if (output) {
            process.stdout.write(`${output}\n`);
        }
    }
}
