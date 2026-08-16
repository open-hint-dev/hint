import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { EXIT_FAILED, EXIT_UNRESOLVED, reportResolution } from './report.js';

// An adapter this project declared that could not be run. Distinct from having no adapter at all,
// which is a supported configuration and says nothing.
type AdapterFailure = {
    file: string;
    target: string;
    reason: string;
};

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
        const files = Transpiler.collectFileNodes(hints);

        // Verification is a claim about a set of files. An empty set proves nothing, so it must not
        // report that every declared surface is present.
        if (files.length === 0) {
            process.stderr.write(`hint: no file spec matched — nothing to verify. Only companion <file>.hint specs declare surfaces.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const conformed = await this.conform(projectRootPath, hints, hintbooks);

        // A configured adapter that did not answer is a broken install, and the run has just silently
        // downgraded to the weaker check. Said before the verdict, because the verdict is worth less
        // than the reader thinks it is.
        for (const failure of conformed.failures) {
            // The reason is the adapter's own first stderr line, so it is quoted rather than folded
            // into the sentence — it is a message from another program, not a phrase of ours.
            process.stderr.write(
                `hint: ${failure.file} — the '${failure.target}' adapter did not answer (${failure.reason}), ` +
                    `so it was checked by declared name only, not against the code. ` +
                    `Fix or remove "symbols" in that emit pack to get shape checking back.\n`,
            );
        }

        // Files an adapter covered are checked by shape; the rest fall back to the presence lint, so a
        // project that has installed no adapter behaves exactly as it did before.
        const linted = (await Transpiler.verifyTargets(projectRootPath, hints, hintbooks)).filter((result) => !conformed.checked.has(result.name));
        const summary = [
            conformed.summary,
            Transpiler.formatVerification(linted),
        ]
            .filter(Boolean)
            .join('\n');

        if (!summary) {
            // Never "every declared surface is present" when nothing was checked against the code: the
            // sentence has to name the weaker check it actually performed.
            const how =
                conformed.checked.size > 0
                    ? `${conformed.checked.size} against the code, ${linted.length} by declared name`
                    : `every declared surface is present by name${conformed.failures.length > 0 ? ' — no file was checked against the code' : ''}`;

            process.stderr.write(`hint: verified ${files.length} file(s) — ${how}.\n`);

            return;
        }

        // Non-zero exit so an agent loop or CI step can gate on structural conformance.
        process.stdout.write(`${summary}\n`);
        process.exitCode = EXIT_FAILED;
    }

    // Compares each spec against the symbols its language adapter reports. An adapter is declared on
    // an emit pack, so a target gains real conformance checking by installing one — and a target with
    // none degrades to the presence lint rather than to a pass it never established.
    private async conform(
        projectRootPath: string,
        hints: Transpiler.HintData[],
        hintbooks: Transpiler.HintbookData[],
    ): Promise<{ summary: string; checked: Set<string>; failures: AdapterFailure[] }> {
        const checked = new Set<string>();
        const failures: AdapterFailure[] = [];
        const sections: string[] = [];

        for (const { name, node } of Transpiler.collectFileNodes(hints)) {
            const emitter = Transpiler.selectEmitter(hintbooks, name);
            const reading = await Transpiler.readSymbols(projectRootPath, emitter?.symbols, name);

            if (reading.symbols === null) {
                if (reading.failure) {
                    failures.push({ file: name, target: emitter?.target ?? 'unknown', reason: reading.failure });
                }

                continue;
            }

            checked.add(name);

            const findings = Transpiler.compareExpectations(Transpiler.collectExpectations(node, hintbooks), reading.symbols);

            if (findings.length > 0) {
                sections.push(Transpiler.formatFindings(name, findings));
            }
        }

        return { summary: sections.join('\n'), checked, failures };
    }
}
