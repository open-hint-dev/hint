import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class CompileCommand implements ICommand {
    private paths: string[] = [];
    private mode: string = '';
    private dryRun: boolean = false;
    private force: boolean = false;
    private withRefs: boolean = false;

    constructor() {}

    static new(paths: string[], mode: string, dryRun: boolean, force: boolean, withRefs: boolean): CompileCommand {
        const command = new CompileCommand();

        command.paths = paths;
        command.mode = mode;
        command.dryRun = dryRun;
        command.force = force;
        command.withRefs = withRefs;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        // Reference closure: pull the specs of referenced files into this one compilation so shared
        // ancestors are emitted once, instead of the agent re-invoking `hint` per referenced file.
        const paths = this.withRefs ? await Transpiler.resolveClosurePaths(projectRootPath, this.paths) : this.paths;

        let hints = await Transpiler.parseHints(projectRootPath, paths, this.dryRun);

        // Hash-gate: when a lock exists (opt-in via `hint lock`), skip files whose spec and inherited
        // context are unchanged and whose output still exists — so unchanged runs cost no tokens.
        if (!this.force) {
            const lock = await Transpiler.loadLock(projectRootPath);

            if (lock) {
                const books = await Transpiler.booksFingerprint(projectRootPath, config?.books ?? []);
                const fileHashes = Transpiler.hashFileHints(hints);
                const fresh = await Transpiler.selectFreshTargets(projectRootPath, fileHashes, lock, books);

                if (fresh.size > 0) {
                    const stale = new Set(fileHashes.filter((file) => !fresh.has(file.name)).map((file) => file.name));

                    hints = Transpiler.pruneFreshHints(hints, stale);

                    process.stderr.write(`hint: ${fresh.size} file(s) up to date, skipped (use --force to recompile).\n`);

                    if (hints.length === 0) {
                        return;
                    }
                }
            }
        }

        const output = await Transpiler.compileHints(hints, hintbooks, this.mode);

        if (output) {
            process.stdout.write(`${output}\n`);
        }
    }
}
