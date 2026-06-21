import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

export const AGENT_FILE_NAMES = [
    'AGENTS.md',
    'CLAUDE.md',
];

export const HINT_TAG = 'hint';

const CONFIG_PROMPT_HEADER = `Configure this project's AI agent context files: ${AGENT_FILE_NAMES.join(' and ')} in the project root.

The <${HINT_TAG}>...</${HINT_TAG}> block below is the complete and only set of HINT instructions these files may contain. It is regenerated every time, so hintbook instructions inside it may have been added, updated, or removed since the last run. For each file:

- If CLAUDE.md contains an @AGENTS.md reference, AGENTS.md is already included into CLAUDE.md as is — apply the steps below to AGENTS.md only, and remove any <${HINT_TAG}> block from CLAUDE.md so the instructions are not duplicated.
- If the file does not exist, create it with exactly the <${HINT_TAG}> block below as its content.
- If the file exists but contains no <${HINT_TAG}> block, append the block below verbatim, separated from the existing content by a blank line.
- If the file already contains a <${HINT_TAG}>...</${HINT_TAG}> block, replace that entire block — including the tags — with the block below, even if the contents look similar. Do not merge, keep, or reformat anything from the old block.
- Remove any other HINT instructions found outside the <${HINT_TAG}> block (for example, leftovers from earlier runs that were not wrapped in <${HINT_TAG}> tags). Only the <${HINT_TAG}> block below may carry HINT instructions — do not add any of your own.
- Do not change anything else in these files.

When finished, reply to the user with one short sentence: HINT is set up and its usage instructions now live in ${AGENT_FILE_NAMES.join(' / ')}. Do not list the files you inspected, the per-file steps you took, or what was or was not changed.`;

export class InstructCommand implements ICommand {
    static new(): InstructCommand {
        return new InstructCommand();
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());
        const config = projectRootPath ? await Transpiler.loadConfig(projectRootPath) : null;

        if (!projectRootPath || !config) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        await printAgentPrompt(projectRootPath, config);
    }
}

export async function printAgentPrompt(projectRootPath: string, config: Transpiler.ConfigData): Promise<void> {
    const sections = await collectHintbookSections(projectRootPath, config);

    process.stdout.write(`${buildConfigPrompt(sections)}\n`);
}

export type HintbookSection = {
    id: string;
    content: string;
};

// The `<hint>...</hint>` block that lives verbatim in AGENTS.md / CLAUDE.md. `hint instruct` asks an
// agent to write it; `hint apply` writes it directly. Same bytes either way.
export function buildHintBlock(sections: HintbookSection[]): string {
    const parts = [Transpiler.CONFIG_INSTRUCTION.trim()];

    for (const section of sections) {
        const tag = `system_instructions_from_${section.id}`;

        parts.push(`<${tag}>\n\n${section.content}\n\n</${tag}>`);
    }

    return `<${HINT_TAG}>\n\n${parts.join('\n\n')}\n\n</${HINT_TAG}>`;
}

function buildConfigPrompt(sections: HintbookSection[]): string {
    return [
        CONFIG_PROMPT_HEADER,
        buildHintBlock(sections),
    ].join('\n\n');
}

function hintbookSectionId(hintbook: Transpiler.HintbookData, hintbookPath: string): string {
    const raw = hintbook.id || hintbook.name || Path.basename(hintbookPath);

    return raw
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export async function collectHintbookSections(projectRootPath: string, config: Transpiler.ConfigData): Promise<HintbookSection[]> {
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
            const parts = [
                system?.content.trim(),
                formatRunningModes(hintbook.runningModes),
            ].filter((part) => part);

            if (parts.length > 0) {
                sections.push({
                    id: hintbookSectionId(hintbook, hintbookPath),
                    content: parts.join('\n\n'),
                });
            }
        }
    }

    return sections;
}

function formatRunningModes(modes: Transpiler.RunningModeData[]): string {
    const modeBlocks = modes.map(formatRunningMode).filter((mode) => mode);

    if (modeBlocks.length === 0) {
        return '';
    }

    return `<available_hint_modes>\n\nThese are the HINT modes available in this project. Read them before running HINT and choose the mode whose guidance matches the user's request. Run a mode with \`hint --mode <mode> <path...>\`.\n\n${modeBlocks.join('\n\n')}\n\n</available_hint_modes>`;
}

function formatRunningMode(mode: Transpiler.RunningModeData): string {
    const parts = [
        `Mode: ${mode.mode}`,
    ];

    if (mode.name !== mode.mode) {
        parts.push(`Name: ${mode.name}`);
    }

    if (mode.description) {
        parts.push(`Description: ${mode.description}`);
    }

    const content = mode.content.trim();

    if (content) {
        parts.push(content);
    }

    return `<hint_mode mode="${escapeAttribute(mode.mode)}">\n\n${parts.join('\n\n')}\n\n</hint_mode>`;
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
