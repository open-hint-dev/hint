import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

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
        const books = await Transpiler.booksFingerprint(projectRootPath, config?.books ?? []);

        const hints = await Transpiler.parseHints(projectRootPath, this.paths, false);
        const fileHashes = Transpiler.hashFileHints(hints);

        const existing = await Transpiler.loadLock(projectRootPath);

        // Carry over prior entries only while the hintbook fingerprint is unchanged; a books change alters
        // keyword semantics, so entries recorded under the old books can no longer be trusted as fresh.
        const files = existing && Transpiler.booksMatch(existing.books, books) ? { ...existing.files } : {};

        for (const { name, hash } of fileHashes) {
            files[name] = { hash };
        }

        await Transpiler.saveLock(projectRootPath, {
            version: Transpiler.LOCK_VERSION,
            books,
            files,
        });

        process.stderr.write(`hint: locked ${fileHashes.length} file(s).\n`);
    }
}
