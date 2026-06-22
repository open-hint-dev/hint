import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export class VersionCommand implements ICommand {
    static new(): VersionCommand {
        return new VersionCommand();
    }

    async execute(): Promise<void> {
        process.stdout.write(`@openhint/cli ${await findCliVersion()}\n`);

        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            return;
        }

        const config = await Transpiler.loadConfig(projectRootPath);

        for (const book of config?.books ?? []) {
            const installed = (await Transpiler.resolveHintbookPaths(projectRootPath, book)).length > 0;

            if (!installed) {
                process.stdout.write(`${book} (not installed)\n`);
                continue;
            }

            const version = await Transpiler.resolveHintbookVersion(projectRootPath, book);

            process.stdout.write(`${book} ${version ?? '(version unknown)'}\n`);
        }
    }
}

export async function findCliVersion(): Promise<string> {
    let folderPath = Path.dirname(fileURLToPath(import.meta.url));

    while (true) {
        const content = await Transpiler.readFile(Path.join(folderPath, 'package.json'));

        if (content !== null) {
            try {
                const packageJson = JSON.parse(content);

                return typeof packageJson.version === 'string' && packageJson.version ? packageJson.version : 'unknown';
            } catch {
                // Malformed package.json — keep walking up.
            }
        }

        const parentPath = Path.dirname(folderPath);

        if (parentPath === folderPath) {
            return 'unknown';
        }

        folderPath = parentPath;
    }
}
