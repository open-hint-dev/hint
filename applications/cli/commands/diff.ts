import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class DiffCommand implements ICommand {
    private paths: string[] = [];

    constructor() {}

    static new(paths: string[]): DiffCommand {
        const command = new DiffCommand();

        command.paths = paths;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const lock = await Transpiler.loadLock(projectRootPath);

        if (!lock) {
            process.stderr.write('hint: no hint.lock — run `hint lock` after generating to start tracking drift.\n');

            return;
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        const hints = await Transpiler.parseHints(projectRootPath, this.paths, false);

        // Read each target's output so drift is reported bidirectionally: a spec whose code was edited
        // since it was locked shows up as `drifted-output`, not silently as fresh.
        const targetNames = Transpiler.collectFileNodes(hints).map((file) => file.name);
        const targetHashes = await Transpiler.hashTargetFiles(projectRootPath, targetNames);

        const drift = Transpiler.computeDrift(hints, lock, hintbooks, targetHashes);

        const summary = Transpiler.formatDrift(drift);

        if (!summary) {
            process.stderr.write('hint: everything up to date.\n');

            return;
        }

        process.stdout.write(`${summary}\n`);
    }
}
