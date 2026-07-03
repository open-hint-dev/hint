import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class CompileCommand implements ICommand {
    private paths: string[] = [];
    private mode: string = '';
    private dryRun: boolean = false;
    private force: boolean = false;
    private refs: boolean = true;
    private standalone: boolean = false;

    constructor() {}

    static new(paths: string[], mode: string, dryRun: boolean, force: boolean, refs: boolean, standalone: boolean = false): CompileCommand {
        const command = new CompileCommand();

        command.paths = paths;
        command.mode = mode;
        command.dryRun = dryRun;
        command.force = force;
        command.refs = refs;
        command.standalone = standalone;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        // Reference closure (on by default): pull the specs of referenced files into this one compilation so
        // shared ancestors are emitted once, instead of the agent re-invoking `hint` per referenced file.
        const paths = this.refs ? await Transpiler.resolveClosurePaths(projectRootPath, this.paths) : this.paths;

        let hints = await Transpiler.parseHints(projectRootPath, paths, this.dryRun);

        const lock = await Transpiler.loadLock(projectRootPath);
        const books = lock ? await Transpiler.booksFingerprint(projectRootPath, config?.books ?? []) : {};

        // Hash-gate: when a lock exists (opt-in via `hint lock`), skip files whose spec and inherited
        // context are unchanged and whose output still exists — so unchanged runs cost no tokens.
        if (lock && !this.force) {
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

        // Drift guidance: when a lock exists, tell the agent which blocks changed. It renders only if the
        // active mode defines a `__changes__` instruction (fix mode), so plain compiles are unaffected.
        const changes = lock ? Transpiler.formatDrift(Transpiler.computeDrift(hints, lock, !Transpiler.booksMatch(lock.books, books))) : '';

        const output = await Transpiler.compileHints(hints, hintbooks, this.mode, changes, this.standalone);

        if (output) {
            warnIfBroad(hints, output);

            process.stdout.write(`${output}\n`);
        }
    }
}

// A run that pulls in a large slice of the tree is usually an accidental whole-repo compile (a broad
// glob, or a folder walked with references) rather than a focused task. Warn on stderr — never on
// stdout, which the agent consumes as the spec — so the breadth is visible and can be narrowed.
const BROAD_TARGET_COUNT = 25;
const BROAD_TOKEN_ESTIMATE = 20_000;

function warnIfBroad(hints: Transpiler.HintData[], output: string): void {
    const targetCount = Transpiler.collectFileNodes(hints).length;
    // Rough heuristic: ~4 characters per token. Precise enough to flag an order-of-magnitude overshoot.
    const tokenEstimate = Math.round(output.length / 4);

    if (targetCount < BROAD_TARGET_COUNT && tokenEstimate < BROAD_TOKEN_ESTIMATE) {
        return;
    }

    process.stderr.write(
        `hint: compiled ${targetCount} file target(s), ~${tokenEstimate.toLocaleString('en-US')} tokens. ` +
            `If this is broader than the task needs, pass fewer paths or add --no-refs.\n`,
    );
}
