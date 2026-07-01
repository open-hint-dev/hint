import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import * as YAML from 'yaml';

import { readFile, writeFile } from './helper.js';

export const CONFIG_INSTRUCTION = `## HINT

This project uses HINT specifications (\`.hint\` files) as the authoritative implementation contracts. The \`hint\` CLI compiles them into an AI-ready prompt.

- Do not read \`.hint\` files directly unless the user explicitly asks — always use the compiled output instead.
- Before reading, creating, or modifying project files, first run \`hint <path...>\` and treat its stdout as the primary, authoritative context for those paths.
- This applies even to files that do not exist yet: a \`.hint\` spec can define a file before it is created. Specs are keyed to the target path, not to its presence on disk.
- If the output is empty, either no spec covers that path, or — when a \`hint.lock\` exists — the spec is unchanged since it was last generated; a note on stderr says which. Either way there is nothing to (re)generate, so proceed normally instead of rewriting conforming work.
- \`hint <path...>\` automatically includes the specs of the files a spec references (its \`# read\` targets and path links), with shared folder/root context emitted once — so you already have every referenced spec in a single prompt. Do not run \`hint\` again for a file just because the first spec pointed at it. Pass \`--no-refs\` only when you deliberately want the named specs alone.
- After you finish implementing or drafting what a spec defines, record it with \`hint lock <path...>\`. This marks those targets as generated, so later plain \`hint\` runs skip them while their specs stay unchanged — keeping repeated runs cheap and the output stable.
- When a spec has drifted from what you last generated, reconcile it instead of rewriting from scratch: run \`hint diff <path...>\` to see exactly which blocks changed, then \`hint --mode fix <path...>\` to correct only those blocks — the compiled prompt already carries the drift list. Run \`hint lock <path...>\` again afterward.
- Persist durable project knowledge as HINT, not in a separate memory store. When you learn a lasting fact, rule, or decision worth remembering, do not write it to \`MEMORY.md\` (or any similar agent-memory file) — record it in the most specific \`.hint\` file that applies: a file's companion \`<file>.hint\`, a folder's \`_.hint\`, or, when nothing more specific fits, the root \`_.hint\`. This keeps reminders versioned with the code and part of the authoritative compiled context. Use \`hint author <path...>\` for the keyword vocabulary when writing these.
- If this file includes an \`<available_hint_modes>\` section, read it before running HINT. It lists the project-specific modes and when to use them. To use one, run \`hint --mode <mode> <path...>\` instead of plain \`hint <path...>\`.
- When the user asks you to write, create, or update \`.hint\` specs (or to capture knowledge as HINT), first run \`hint author <path...>\` and follow the prompt it prints: it lists the project's keyword vocabulary and the authoring rules, so you write specs with the correct keywords instead of guessing. Then write the \`.hint\` files yourself.
- If \`hint\` is not installed globally, use \`npx @openhint/cli <path...>\` instead.
- Run \`hint\` silently as part of your normal workflow — do not narrate routine successful runs. But if a \`hint\` command fails or behaves unexpectedly, do not just relay the raw error. First diagnose it: fetch the troubleshooting index at https://github.com/open-hint-dev/hint/blob/main/docs/troubleshooting/01-intro.md, match the symptom in its issue table, and follow the linked page for that issue. Apply the fix yourself when the page marks it as safe to autofix and retry once. Then report back to the user with the original error, your diagnosis, and the solution you applied or propose.

Examples:

- Existing files: \`hint docs/intro.md src/utils/*.py src/cli/command/fix.py\`
- A file to create: \`hint src/cli/command/new_feature.py\`
- A folder to explore: \`hint src/cli/command\`
- Just the named spec, no references: \`hint --no-refs src/cli/command/fix.py\`
- Record generated work: \`hint lock src/cli/command/fix.py\`
- See and reconcile drift: \`hint diff src/cli/command/fix.py\` then \`hint --mode fix src/cli/command/fix.py\`
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
        const content = await readFile(configPath);
        if (content === null) {
            return null;
        }

        return YAML.parse(content) as ConfigData;
    } catch (err: unknown) {
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
        await writeFile(configPath, content);
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        throw new Error(`Failed to write '${configPath}': ${e.message}`);
    }
}
