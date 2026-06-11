import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import { openTerminal } from '../terminal.js';
import type { ICommand } from './command.js';

const AGENT_FILE_NAMES = [
    'AGENTS.md',
    'CLAUDE.md',
];

const DEFAULT_HINTBOOK = 'npm://@openhint/hintbooks-software-engineer';

const CONFIG_PROMPT_HEADER = `Configure this project's AI agent context files: ${AGENT_FILE_NAMES.join(' and ')} in the project root.

For every <instruction> block below, check whether each file already contains it — match by the block's first line. Then:

- If a file does not exist, create it.
- If a block is missing from a file, append the block content verbatim (without the <instruction> wrapper), separated from existing content by a blank line.
- If a block is already present, leave it untouched — do not duplicate, rewrite, or reformat it.

Do not change anything else in these files.`;

export class ConfigCommand implements ICommand {
    static new(): ConfigCommand {
        return new ConfigCommand();
    }

    async execute(): Promise<void> {
        const projectRootPath = (await Transpiler.findProjectRoot(process.cwd())) ?? process.cwd();

        const config = (await Transpiler.loadConfig(projectRootPath)) ?? (await initConfig(projectRootPath));
        const instructions = await collectInstructions(projectRootPath, config);

        process.stdout.write(`${buildConfigPrompt(instructions)}\n`);
    }
}

function buildConfigPrompt(instructions: string[]): string {
    const blocks = instructions.map((instruction) => `<instruction>\n\n${instruction}\n\n</instruction>`);

    return [
        CONFIG_PROMPT_HEADER,
        ...blocks,
    ].join('\n\n');
}

async function initConfig(projectRootPath: string): Promise<Transpiler.ConfigData> {
    const terminal = openTerminal();

    try {
        const defaultName = Path.basename(projectRootPath);
        const name = (await terminal.ask(`Project name (${defaultName}): `)).trim() || defaultName;
        const description = (await terminal.ask('Project description: ')).trim();
        const useDefaultHintbook = (await terminal.ask(`Use ${DEFAULT_HINTBOOK} as the default hintbook? [Y/n]: `)).trim().toLowerCase() !== 'n';

        const config: Transpiler.ConfigData = {
            name,
            description,
            books: useDefaultHintbook ? [DEFAULT_HINTBOOK] : [],
        };

        await Transpiler.saveConfig(projectRootPath, config);
        process.stderr.write(`Created ${Transpiler.CONFIG_FILE_YML} in ${projectRootPath}\n`);

        return config;
    } finally {
        terminal.close();
    }
}

async function collectInstructions(projectRootPath: string, config: Transpiler.ConfigData): Promise<string[]> {
    const instructions = [Transpiler.CONFIG_INSTRUCTION.trim()];

    for (const book of config.books ?? []) {
        const hintbookPaths = await Transpiler.resolveHintbookPaths(projectRootPath, book);

        if (hintbookPaths.length === 0) {
            process.stderr.write(`Skipping hintbook '${book}': not found\n`);
            continue;
        }

        for (const hintbookPath of hintbookPaths) {
            const hintbook = await Transpiler.loadHintbook(hintbookPath);
            const system = hintbook.modes[Transpiler.INSTRUCTION_MODE_DEFAULT]?.instructions.find(
                (instruction) => instruction.name === Transpiler.RUNNING_SYSTEM,
            );
            const content = system?.content.trim();

            if (content) {
                instructions.push(content);
            }
        }
    }

    return instructions;
}
