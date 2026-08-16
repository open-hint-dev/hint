import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { EXIT_UNRESOLVED, reportResolution, reportStaleness } from './report.js';

export type CompileOptions = {
    strict: boolean;
    force: boolean;
    refs: boolean;
    prompt: boolean;
    standalone: boolean;
};

export class CompileCommand implements ICommand {
    private paths: string[] = [];
    private options: CompileOptions = { strict: false, force: false, refs: true, prompt: false, standalone: false };

    constructor() {}

    static new(paths: string[], options: CompileOptions): CompileCommand {
        const command = new CompileCommand();

        command.paths = paths;
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

        const resolution = await Transpiler.resolveRequests(projectRootPath, this.paths);

        // The verdict goes out before anything else, because an agent that truncates output keeps the
        // first lines. A run where every path resolved cleanly says nothing at all.
        const unresolved = await reportResolution(projectRootPath, resolution);

        if (this.options.strict && unresolved > 0) {
            process.stderr.write(`hint: --strict: ${unresolved} of ${resolution.requests.length} path(s) have no spec of their own.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        // Reference closure (on by default): pull the specs of referenced files into this one render so
        // shared ancestors are emitted once, instead of the agent re-invoking `hint` per referenced file.
        const hintPaths = this.options.refs ? await Transpiler.resolveClosurePaths(projectRootPath, resolution.hintPaths) : resolution.hintPaths;

        let hints = await Transpiler.parseHintFiles(projectRootPath, hintPaths);

        // Measured before the lock gate prunes anything, so the staleness of a scope is reported whether
        // or not its output happens to be up to date. Which kind of knowledge a scope holds decides how
        // far the code may move before it is worth saying anything.
        await reportStaleness(projectRootPath, resolution, Transpiler.collectContractScopes(hints, hintbooks));

        const lock = await Transpiler.loadLock(projectRootPath);

        // Hash-gate: when a lock exists (opt-in via `hint lock`), skip files whose spec, inherited context,
        // and the vocabulary they use are all unchanged and whose output still exists — so regenerating
        // costs no tokens. The effective hash folds in the hintbooks, so no separate book fingerprint is needed.
        //
        // Generation only. A plain `hint <path>` is a question about what this repository knows, and the
        // answer cannot be "nothing, it is up to date": that withholds knowledge precisely when the code is
        // stable, and makes what an agent learns about a path depend on the state of `hint.lock`.
        if (lock && this.options.prompt && !this.options.force) {
            const fileHashes = Transpiler.effectiveFileHashes(hints, hintbooks);
            const fresh = await Transpiler.selectFreshTargets(projectRootPath, fileHashes, lock);

            if (fresh.size > 0) {
                const stale = new Set(fileHashes.filter((file) => !fresh.has(file.name)).map((file) => file.name));

                hints = Transpiler.pruneFreshHints(hints, stale);

                process.stderr.write(`hint: ${fresh.size} file(s) up to date, skipped (use --force to include them).\n`);
            }
        }

        const context = Transpiler.renderContext(hints, hintbooks);
        const output = this.options.prompt
            ? Transpiler.renderPrompt(context, hintbooks, await this.promptOptions(projectRootPath, hints, hintbooks, lock))
            : context;

        if (output) {
            warnIfBroad(hints, output);

            process.stdout.write(`${output}\n`);
        }

        // Exit 2 means "you asked for something this repository does not have". Inheriting knowledge from
        // an ancestor is a successful lookup, not a failure — otherwise the commonest case in a
        // folder-knowledge repository would report an error on every call.
        if (Transpiler.resolvedNothing(resolution)) {
            process.exitCode = EXIT_UNRESOLVED;
        }
    }

    // Reconciliation framing is contextual, not a mode the caller selects: it renders only when a lock
    // exists and something actually drifted. Computing it costs a read per target, so it is skipped
    // entirely on the default (context-only) path.
    private async promptOptions(
        projectRootPath: string,
        hints: Transpiler.HintData[],
        hintbooks: Transpiler.HintbookData[],
        lock: Transpiler.LockData | null,
    ): Promise<Transpiler.PromptOptions> {
        if (!lock) {
            return { standalone: this.options.standalone };
        }

        const targetHashes = await Transpiler.hashTargetFiles(
            projectRootPath,
            Transpiler.collectFileNodes(hints).map((file) => file.name),
        );

        return {
            standalone: this.options.standalone,
            changes: Transpiler.formatDrift(Transpiler.computeDrift(hints, lock, hintbooks, targetHashes)),
        };
    }
}

// A run that pulls in a large slice of the tree is usually an accidental whole-repo render (a broad
// glob, or a folder walked with references) rather than a focused task. Warn on stderr — never on
// stdout, which the agent consumes as the context — so the breadth is visible and can be narrowed.
export const BROAD_TARGET_COUNT = 25;
export const BROAD_TOKEN_ESTIMATE = 20_000;

// Rough heuristic: ~4 characters per token. Precise enough to flag an order-of-magnitude overshoot.
export function estimateTokens(outputLength: number): number {
    return Math.round(outputLength / 4);
}

export function isBroadCompile(targetCount: number, outputLength: number): boolean {
    return targetCount >= BROAD_TARGET_COUNT || estimateTokens(outputLength) >= BROAD_TOKEN_ESTIMATE;
}

function warnIfBroad(hints: Transpiler.HintData[], output: string): void {
    // Both kinds of scope count. A repository whose knowledge lives entirely in folder `_.hint` files
    // has no file targets at all, and a file-only count could never flag a whole-repo sweep there.
    const { files, folders } = Transpiler.countScopes(hints);
    const targetCount = files + folders;

    if (!isBroadCompile(targetCount, output.length)) {
        return;
    }

    process.stderr.write(
        `hint: rendered ${targetCount} scope(s), ~${estimateTokens(output.length).toLocaleString('en-US')} tokens. ` +
            `If this is broader than the task needs, pass fewer paths or add --no-refs.\n`,
    );
}
