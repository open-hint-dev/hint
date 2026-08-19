import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { EXIT_FAILED, EXIT_UNRESOLVED } from './report.js';

export type StatusOptions = {
    json: boolean;
    exitCode: boolean;
};

export class StatusCommand implements ICommand {
    private options: StatusOptions = { json: false, exitCode: false };

    constructor() {}

    static new(options: StatusOptions): StatusCommand {
        const command = new StatusCommand();

        command.options = options;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        const report = await Transpiler.inspectProject(projectRootPath, hintbooks);

        // "Nothing to report" over zero hint files is the hollow success this whole exit taxonomy
        // exists to prevent — it is indistinguishable from a healthy repository, and reads as one.
        if (report.scanned === 0) {
            if (this.options.json) {
                process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
            }

            process.stderr.write(`hint: no .hint files in this project — nothing to inventory. Run 'hint author' to see how to record knowledge.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        if (this.options.json) {
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        } else {
            const table = Transpiler.formatStatus(report);

            if (table) {
                process.stdout.write(`${table}\n`);
            }
        }

        this.reportSummary(report);
    }

    private reportSummary(report: Transpiler.StatusReport): void {
        const findings = Transpiler.countFindings(report);
        const pending = Transpiler.countPending(report);

        // Say what could not be checked, so a quiet report is not mistaken for a thorough one.
        if (!report.git) {
            process.stderr.write(`hint: not a git repository — staleness and orphaned specs were not evaluated.\n`);
        }

        if (pending > 0) {
            process.stderr.write(`hint: ${pending} spec(s) describe a target that is not written yet — listed under --json.\n`);
        }

        if (findings === 0) {
            process.stderr.write(`hint: ${report.scanned} hint file(s) inventoried — nothing has come loose.\n`);

            return;
        }

        process.stderr.write(`hint: ${findings} of ${report.scanned} hint file(s) need attention.\n`);

        if (this.options.exitCode) {
            process.exitCode = EXIT_FAILED;
        }
    }
}
