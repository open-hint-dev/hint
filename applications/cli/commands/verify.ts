import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class VerifyCommand implements ICommand {
    private paths: string[] = [];
    private mode: string = '';

    constructor() {}

    static new(paths: string[], mode: string): VerifyCommand {
        const command = new VerifyCommand();

        command.paths = paths;
        command.mode = mode;

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
        if (Transpiler.countSurfaceKeywords(hintbooks, this.mode) === 0) {
            process.stderr.write(
                'hint: the active hintbooks declare no surface keywords, so structural verification is a no-op. ' +
                    'Mark the keywords whose declared name must appear in the output with `surface: true` to enable it.\n',
            );

            return;
        }

        const hints = await Transpiler.parseHints(projectRootPath, this.paths, false);
        const results = await Transpiler.verifyTargets(projectRootPath, hints, hintbooks, this.mode);

        const summary = Transpiler.formatVerification(results);

        if (!summary) {
            process.stderr.write(`hint: verified ${results.length} file(s) — every declared surface is present.\n`);

            return;
        }

        // Non-zero exit so an agent loop or CI step can gate on structural conformance.
        process.stdout.write(`${summary}\n`);
        process.exitCode = 1;
    }
}
