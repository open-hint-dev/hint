import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { EXIT_FAILED, EXIT_UNRESOLVED, reportResolution } from './report.js';

export class VerifyCommand implements ICommand {
    private paths: string[] = [];

    constructor() {}

    static new(paths: string[]): VerifyCommand {
        const command = new VerifyCommand();

        command.paths = paths;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        // No surface keyword in the active books means structural verification has nothing to check — say
        // so rather than reporting a hollow pass, and point at how to enable it.
        if (Transpiler.countSurfaceKeywords(hintbooks) === 0) {
            process.stderr.write(
                'hint: the active hintbooks declare no surface keywords, so there is nothing to verify. ' +
                    'Mark the keywords whose declared name must appear in the output with `surface: true` to enable it.\n',
            );
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const resolution = await Transpiler.resolveRequests(projectRootPath, this.paths);

        await reportResolution(projectRootPath, resolution);

        const hints = await Transpiler.parseHintFiles(projectRootPath, resolution.hintPaths);
        const results = await Transpiler.verifyTargets(projectRootPath, hints, hintbooks);

        // Verification is a claim about a set of files. An empty set proves nothing, so it must not
        // report that every declared surface is present.
        if (results.length === 0) {
            process.stderr.write(`hint: no file spec matched — nothing to verify. Only companion <file>.hint specs declare surfaces.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const summary = Transpiler.formatVerification(results);

        if (!summary) {
            process.stderr.write(`hint: verified ${results.length} file(s) — every declared surface is present.\n`);

            return;
        }

        // Non-zero exit so an agent loop or CI step can gate on structural conformance.
        process.stdout.write(`${summary}\n`);
        process.exitCode = EXIT_FAILED;
    }
}
