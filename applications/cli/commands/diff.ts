import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { expandFolderPaths } from './paths.js';
import { EXIT_UNRESOLVED, reportResolution } from './report.js';

export class DiffCommand implements ICommand {
    private paths: string[] = [];
    private json = false;

    constructor() {}

    static new(paths: string[], json = false): DiffCommand {
        const command = new DiffCommand();

        command.paths = paths;
        command.json = json;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const lock = await Transpiler.loadLock(projectRootPath);

        if (!lock) {
            process.stderr.write(`hint: no hint.lock — run 'hint lock <path>' on a file spec to start tracking drift.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        if (Object.keys(lock.files).length === 0) {
            process.stderr.write(`hint: hint.lock tracks 0 files — nothing to compare. Run 'hint lock <path>' on a file spec first.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        const resolution = await Transpiler.resolveRequests(projectRootPath, await expandFolderPaths(this.paths), process.cwd());

        await reportResolution(projectRootPath, resolution);

        const hints = await Transpiler.parseHintFiles(projectRootPath, resolution.hintPaths);

        // Read each target's output so drift is reported bidirectionally: a spec whose code was edited
        // since it was locked shows up as `drifted-output`, not silently as fresh.
        const targetNames = Transpiler.collectFileNodes(hints).map((file) => file.name);

        // "Up to date" is an assertion about a set of files. Never make it about an empty one — that is
        // how a genuinely drifted repository read as clean for three weeks.
        if (targetNames.length === 0) {
            process.stderr.write(`hint: no tracked file spec matched — nothing to compare.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const targetHashes = await Transpiler.hashTargetFiles(projectRootPath, targetNames);
        const drift = Transpiler.computeDrift(hints, lock, hintbooks, targetHashes);

        const summary = Transpiler.formatDrift(drift);

        if (this.json) {
            process.stdout.write(
                `${JSON.stringify({ compared: targetNames.length, findings: drift.filter((entry) => entry.status !== 'fresh') }, null, 2)}\n`,
            );
        }

        if (!summary) {
            process.stderr.write(`hint: ${targetNames.length} file(s) compared — all up to date.\n`);

            return;
        }

        if (!this.json) process.stdout.write(`${summary}\n`);
    }
}
