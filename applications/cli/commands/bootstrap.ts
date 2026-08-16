import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

// The agent instruction files HINT bootstraps. HINT stays agent-neutral: `.hint` files are the source
// of truth, and these files carry only the short block that tells an agent how to query HINT. Any other
// agent that reads a project convention file can be pointed at HINT the same way.
export const AGENT_FILE_NAMES = [
    'AGENTS.md',
    'CLAUDE.md',
];

export const HINT_TAG = 'hint';

export type HintbookSection = {
    id: string;
    content: string;
};

// The `<hint>...</hint>` block written verbatim into the agent files: how to query HINT, plus each
// hintbook's tag glossary. The glossary lives here — once, per project — rather than in every render,
// which is what lets `hint <path>` return knowledge and nothing else.
export function buildHintBlock(sections: HintbookSection[]): string {
    const parts = [Transpiler.CONFIG_INSTRUCTION.trim()];

    for (const section of sections) {
        const tag = `hint_glossary_from_${section.id}`;

        parts.push(`<${tag}>\n\n${section.content}\n\n</${tag}>`);
    }

    return `<${HINT_TAG}>\n\n${parts.join('\n\n')}\n\n</${HINT_TAG}>`;
}

// A hintbook id becomes part of a tag name, so it is reduced to lowercase letters, digits, and
// underscores — every other character, including the hyphens npm package names are full of, collapses
// to a single underscore. `@openhint/hintbook-software-engineer` reads as `hintbook_software_engineer`.
function hintbookSectionId(hintbook: Transpiler.HintbookData, hintbookPath: string): string {
    const raw = hintbook.id || hintbook.name || Path.basename(hintbookPath);

    const sanitized = raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    // A name made entirely of punctuation would otherwise leave a dangling `hint_glossary_from_`.
    return sanitized || 'hintbook';
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

            // Emit packs carry no glossary — they describe artifacts, not the tags an agent reads.
            if (Transpiler.isEmitPack(hintbook)) {
                continue;
            }

            const system = hintbook.instructions.find((instruction) => instruction.name === Transpiler.RUNNING_SYSTEM)?.content.trim();

            if (system) {
                sections.push({ id: hintbookSectionId(hintbook, hintbookPath), content: system });
            }
        }
    }

    return sections;
}
