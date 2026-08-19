import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { expandFolderPaths } from './paths.js';
import { EXIT_FAILED, EXIT_UNRESOLVED, reportResolution } from './report.js';

export type LintOptions = { json: boolean; strictVocab: boolean };

export class LintCommand implements ICommand {
    private paths: string[] = [];
    private options: LintOptions = { json: false, strictVocab: false };

    private constructor() {}

    static new(paths: string[], options: LintOptions): LintCommand {
        const command = new LintCommand();
        command.paths = paths;
        command.options = options;
        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());
        if (!projectRootPath) throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);
        const resolution = await Transpiler.resolveRequests(projectRootPath, await expandFolderPaths(this.paths), process.cwd());
        await reportResolution(projectRootPath, resolution);

        if (resolution.hintPaths.length === 0) {
            if (this.options.json) process.stdout.write(`${JSON.stringify({ scanned: 0, findings: [] }, null, 2)}\n`);
            process.stderr.write(`hint: no .hint files matched — nothing to lint.\n`);
            process.exitCode = EXIT_UNRESOLVED;
            return;
        }

        const findings = await Transpiler.lintHintFiles(projectRootPath, resolution.hintPaths, hintbooks, {
            strictVocabulary: this.options.strictVocab,
        });
        const failures = findings.filter((finding) => finding.severity === 'finding');

        if (this.options.json) {
            process.stdout.write(`${JSON.stringify({ scanned: resolution.hintPaths.length, findings }, null, 2)}\n`);
        } else {
            for (const finding of findings) process.stdout.write(`${finding.severity.padEnd(7)} ${Transpiler.formatLintFinding(finding)}\n`);
        }

        process.stderr.write(
            `hint: linted ${resolution.hintPaths.length} hint file(s) — ${failures.length} finding(s), ${findings.length - failures.length} note(s).\n`,
        );
        if (failures.length > 0) process.exitCode = EXIT_FAILED;
    }
}
