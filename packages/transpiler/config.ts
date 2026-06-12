import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import * as YAML from 'yaml';

export const CONFIG_INSTRUCTION = `## HINT

This project uses HINT specifications (\`.hint\` files) as the authoritative implementation contracts. The \`hint\` CLI compiles them into an AI-ready prompt.

- Do not read \`.hint\` files directly unless the user explicitly asks — always use the compiled output instead.
- Before reading, creating, or modifying project files, first run \`hint <path...>\` and treat its stdout as the primary, authoritative context for those paths.
- This applies even to files that do not exist yet: a \`.hint\` spec can define a file before it is created. Specs are keyed to the target path, not to its presence on disk.
- If the output is empty, no spec covers that path — proceed normally.
- If \`hint\` is not installed globally, use \`npx @openhint/cli <path...>\` instead.
- Run \`hint\` silently as part of your normal workflow — do not narrate routine successful runs. But if a \`hint\` command fails or behaves unexpectedly, do not just relay the raw error. First diagnose it: fetch the troubleshooting index at https://github.com/open-hint-dev/hint/blob/main/docs/troubleshooting/01-intro.md, match the symptom in its issue table, and follow the linked page for that issue. Apply the fix yourself when the page marks it as safe to autofix and retry once. Then report back to the user with the original error, your diagnosis, and the solution you applied or propose.

Examples:

- Existing files: \`hint docs/intro.md src/utils/*.py src/cli/command/fix.py\`
- A file to create: \`hint src/cli/command/new_feature.py\`
- A folder to explore: \`hint src/cli/command\`
`;

export const CONFIG_FILE_YML = 'hint.yml';
export const CONFIG_FILE_YAML = 'hint.yaml';

const CONFIG_NAMES = [
    CONFIG_FILE_YML,
    CONFIG_FILE_YAML,
];

export type ConfigData = {
    name?: string;
    description?: string;
    ignore?: string[];
    books?: string[];
};

export async function findConfig(projectRootPath: string): Promise<string | null> {
    for (const configName of CONFIG_NAMES) {
        const configPath = Path.join(projectRootPath, configName);

        try {
            const stats = await FsPromises.stat(configPath);
            if (stats.isFile()) {
                return configPath;
            }
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                continue;
            }

            throw new Error(`Failed to access '${configPath}': ${(err as any).message}`);
        }
    }

    return null;
}

export async function findProjectRoot(startPath: string): Promise<string | null> {
    let currentPath = Path.resolve(startPath);

    while (true) {
        const configPath = await findConfig(currentPath);
        if (configPath) {
            return currentPath;
        }

        const parentPath = Path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }

        currentPath = parentPath;
    }

    return null;
}

export async function loadConfig(projectRootPath: string): Promise<ConfigData | null> {
    const configPath = await findConfig(projectRootPath);
    if (!configPath) {
        return null;
    }

    try {
        const content = await FsPromises.readFile(configPath, 'utf8');
        return YAML.parse(content) as ConfigData;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw new Error(`Failed to read '${configPath}': ${(err as any).message}`);
    }
}

export async function saveConfig(projectRootPath: string, config: ConfigData): Promise<void> {
    let configPath = await findConfig(projectRootPath);
    if (!configPath) {
        configPath = Path.join(projectRootPath, CONFIG_NAMES[0]!);
    }

    const content = YAML.stringify(config, { lineWidth: 0 });

    try {
        await FsPromises.writeFile(configPath, content, 'utf8');
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        throw new Error(`Failed to write '${configPath}': ${e.message}`);
    }
}
