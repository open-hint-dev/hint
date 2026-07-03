import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class LockCommand implements ICommand {
    private paths: string[] = [];
    private strict: boolean = false;

    constructor() {}

    static new(paths: string[], strict: boolean = false): LockCommand {
        const command = new LockCommand();

        command.paths = paths;
        command.strict = strict;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        const hints = await Transpiler.parseHints(projectRootPath, this.paths, false);
        const effective = new Map(
            Transpiler.effectiveFileHashes(hints, hintbooks).map((file) => [
                file.name,
                file.hash,
            ]),
        );
        const fileNodes = Transpiler.collectFileNodes(hints);

        // --strict gates recording on structural verification: a target that fails (missing output, or a
        // declared surface absent from the code) is not marked generated, and the command exits non-zero.
        // Plain `hint lock` records unconditionally — verification is the opt-in gate, `hint verify` the report.
        const failing = new Set<string>();

        if (this.strict) {
            const results = await Transpiler.verifyTargets(projectRootPath, hints, hintbooks, '');
            const summary = Transpiler.formatVerification(results);

            for (const result of results) {
                if (result.status !== 'ok') {
                    failing.add(result.name);
                }
            }

            if (summary) {
                process.stderr.write(`hint: --strict verification failed; these files were not recorded:\n${summary}\n`);
                process.exitCode = 1;
            }
        }

        const existing = await Transpiler.loadLock(projectRootPath);

        // Carry over prior entries unconditionally: each entry's hash now folds in the vocabulary it used, so
        // a keyword-semantics change already invalidates the affected entries on the next gated run — there is
        // no book fingerprint to compare against and no reason to discard entries wholesale.
        const files = existing ? { ...existing.files } : {};

        let locked = 0;

        for (const { name, node } of fileNodes) {
            if (failing.has(name)) {
                continue;
            }

            // Record the generated output's content hash so a later run can tell the code was edited
            // underneath an unchanged spec. Omitted when the target does not exist yet (locking a spec
            // before its output is produced) — freshness then falls back to output-existence.
            const target = await Transpiler.hashTargetFile(projectRootPath, name);

            const entry: Transpiler.LockEntry = { hash: effective.get(name)! };

            if (target !== null) {
                entry.target = target;
            }

            entry.blocks = Transpiler.hashFileBlocks(node);

            files[name] = entry;
            locked += 1;
        }

        await Transpiler.saveLock(projectRootPath, {
            version: Transpiler.LOCK_VERSION,
            files,
        });

        process.stderr.write(`hint: locked ${locked} file(s).\n`);
    }
}
