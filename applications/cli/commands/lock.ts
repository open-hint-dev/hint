import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { EXIT_UNRESOLVED } from './report.js';

export class LockCommand implements ICommand {
    private paths: string[] = [];

    constructor() {}

    static new(paths: string[]): LockCommand {
        const command = new LockCommand();

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

        const resolution = await Transpiler.resolveRequests(projectRootPath, this.paths);
        const hints = await Transpiler.parseHintFiles(projectRootPath, resolution.hintPaths);

        const effective = new Map(
            Transpiler.effectiveFileHashes(hints, hintbooks).map((file) => [
                file.name,
                file.hash,
            ]),
        );
        const fileNodes = Transpiler.collectFileNodes(hints);

        const existing = await Transpiler.loadLock(projectRootPath);

        // Carry over prior entries unconditionally: each entry's hash folds in the vocabulary it used, so
        // a keyword-semantics change already invalidates the affected entries on the next gated run.
        const files = existing ? { ...existing.files } : {};

        for (const { name, node } of fileNodes) {
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
        }

        // A path that produced no lockable target must say so and say why. "locked 0 file(s)" at exit 0
        // is indistinguishable from "nothing needed locking", which is a healthy state — and in a
        // repository whose knowledge lives in folder `_.hint` files, that no-op is permanent.
        reportSkipped(resolution);

        if (fileNodes.length === 0) {
            process.stderr.write(`hint: locked nothing — none of the given path(s) resolve to a file spec.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        await Transpiler.saveLock(projectRootPath, {
            version: Transpiler.LOCK_VERSION,
            files,
        });

        process.stderr.write(`hint: locked ${fileNodes.length} file(s).\n`);
    }
}

// `lock` records a contract snapshot for a generated file, so only a companion `<file>.hint` is a
// lockable target. Folder knowledge has no single output to hash — that is a deliberate limit of the
// contract subsystem, not a silent one.
function reportSkipped(resolution: Transpiler.Resolution): void {
    for (const request of resolution.requests) {
        if (request.status === 'missing') {
            process.stderr.write(`hint: ${request.request}: not found — no such path, and no spec for it.\n`);

            continue;
        }

        if (request.status === 'inherited') {
            process.stderr.write(`hint: ${request.request}: no companion spec — nothing to lock.\n`);

            continue;
        }

        if (request.hintPath && Transpiler.isFolderHintPath(request.hintPath)) {
            process.stderr.write(
                `hint: ${request.request}: folder knowledge (_.hint) is not a contract target — ` +
                    `lock the files it governs, e.g. hint lock '${request.target === '.' ? '' : `${request.target}/`}**'.\n`,
            );
        }
    }
}
