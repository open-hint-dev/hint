import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import { openTerminal } from '../terminal.js';
import type { ICommand } from './command.js';

const AGENT_FILE_NAMES = [
    'AGENTS.md',
    'CLAUDE.md',
];

const DEFAULT_HINTBOOK = 'npm://@openhint/hintbook-software-engineer';

const HINT_TAG = 'hint';

const CONFIG_PROMPT_HEADER = `Configure this project's AI agent context files: ${AGENT_FILE_NAMES.join(' and ')} in the project root.

The <${HINT_TAG}>...</${HINT_TAG}> block below is the complete and only set of HINT instructions these files may contain. It is regenerated every time, so hintbook instructions inside it may have been added, updated, or removed since the last run. For each file:

- If the file does not exist, create it with exactly the <${HINT_TAG}> block below as its content.
- If the file exists but contains no <${HINT_TAG}> block, append the block below verbatim, separated from the existing content by a blank line.
- If the file already contains a <${HINT_TAG}>...</${HINT_TAG}> block, replace that entire block — including the tags — with the block below, even if the contents look similar. Do not merge, keep, or reformat anything from the old block.
- Remove any other HINT instructions found outside the <${HINT_TAG}> block (for example, leftovers from earlier runs that were not wrapped in <${HINT_TAG}> tags). Only the <${HINT_TAG}> block below may carry HINT instructions — do not add any of your own.
- Do not change anything else in these files.`;

export class ConfigCommand implements ICommand {
    static new(): ConfigCommand {
        return new ConfigCommand();
    }

    async execute(): Promise<void> {
        const projectRootPath = (await Transpiler.findProjectRoot(process.cwd())) ?? process.cwd();

        const config = (await Transpiler.loadConfig(projectRootPath)) ?? (await initConfig(projectRootPath));

        await printAgentPrompt(projectRootPath, config);
    }
}

export async function printAgentPrompt(projectRootPath: string, config: Transpiler.ConfigData): Promise<void> {
    const sections = await collectHintbookSections(projectRootPath, config);

    process.stdout.write(`${buildConfigPrompt(sections)}\n`);
}

type HintbookSection = {
    id: string;
    content: string;
};

function buildConfigPrompt(sections: HintbookSection[]): string {
    const parts = [Transpiler.CONFIG_INSTRUCTION.trim()];

    for (const section of sections) {
        const tag = `system_instructions_from_${section.id}`;

        parts.push(`<${tag}>\n\n${section.content}\n\n</${tag}>`);
    }

    return [
        CONFIG_PROMPT_HEADER,
        `<${HINT_TAG}>\n\n${parts.join('\n\n')}\n\n</${HINT_TAG}>`,
    ].join('\n\n');
}

async function initConfig(projectRootPath: string): Promise<Transpiler.ConfigData> {
    const defaultName = Path.basename(projectRootPath);

    const config: Transpiler.ConfigData = process.stdin.isTTY
        ? await askConfig(defaultName)
        : {
              name: defaultName,
              description: '',
              books: [DEFAULT_HINTBOOK],
          };

    await Transpiler.saveConfig(projectRootPath, config);
    process.stderr.write(`Created ${Transpiler.CONFIG_FILE_YML} in ${projectRootPath}\n`);

    return config;
}

async function askConfig(defaultName: string): Promise<Transpiler.ConfigData> {
    const terminal = openTerminal();

    try {
        const name = (await terminal.ask(`Project name (${defaultName}): `)).trim() || defaultName;
        const description = (await terminal.ask('Project description: ')).trim();
        const useDefaultHintbook = (await terminal.ask(`Use ${DEFAULT_HINTBOOK} as the default hintbook? [Y/n]: `)).trim().toLowerCase() !== 'n';

        return {
            name,
            description,
            books: useDefaultHintbook ? [DEFAULT_HINTBOOK] : [],
        };
    } finally {
        terminal.close();
    }
}

function hintbookSectionId(hintbook: Transpiler.HintbookData, hintbookPath: string): string {
    const raw = hintbook.id || hintbook.name || Path.basename(hintbookPath);

    return raw
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function collectHintbookSections(projectRootPath: string, config: Transpiler.ConfigData): Promise<HintbookSection[]> {
    const sections: HintbookSection[] = [];

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
                sections.push({
                    id: hintbookSectionId(hintbook, hintbookPath),
                    content,
                });
            }
        }
    }

    return sections;
}
