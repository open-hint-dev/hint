import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { UnresolvedError } from './report.js';

export const BOOTSTRAP_PROMPT = `Set up HINT for this repository. Work from the repository root, make the changes, and verify them; do not merely describe the steps.

1. Initialize HINT if needed:
   - If hint.yml or hint.yaml is absent, run: npx -y @openhint/cli config
   - If no hintbook is registered, use the repository's domain when one is known. For a software repository, run: npx -y @openhint/cli add --local @openhint/hintbook-software-engineer
   - Run: npx -y @openhint/cli apply
   - Preserve all existing content in AGENTS.md and CLAUDE.md outside the generated <hint> block.

2. Configure the HINT MCP server for the agent you are currently running. Configure only that client, merge with existing configuration, and never overwrite unrelated servers:

   Claude Code (shared project configuration):
     claude mcp add --scope project hint -- npx -y @openhint/cli mcp

   Codex (shared project configuration): merge this into .codex/config.toml:
     [mcp_servers.hint]
     command = "npx"
     args = ["-y", "@openhint/cli", "mcp"]

   Cursor (shared project configuration): merge this into .cursor/mcp.json:
     {"mcpServers":{"hint":{"command":"npx","args":["-y","@openhint/cli","mcp"]}}}

   VS Code / GitHub Copilot (shared workspace configuration): merge this into .vscode/mcp.json:
     {"servers":{"hint":{"command":"npx","args":["-y","@openhint/cli","mcp"]}}}

   Another MCP client: add a stdio server named "hint" whose command is "npx" and args are ["-y", "@openhint/cli", "mcp"].

3. Verify the setup:
   - Run: npx -y @openhint/cli apply --check
   - Confirm the current agent sees hint_context, hint_search, hint_status, and hint_author. Restart the agent/client if it discovers MCP servers only at startup.
   - If the repository already has .hint files, run: npx -y @openhint/cli status

4. Report which files you changed, which client you configured, and the verification results. Do not create starter .hint content without first inspecting the repository and running npx -y @openhint/cli author.
`;

export class BootstrapCommand implements ICommand {
    private constructor() {}

    static new(): BootstrapCommand {
        return new BootstrapCommand();
    }

    async execute(): Promise<void> {
        process.stdout.write(BOOTSTRAP_PROMPT);
    }
}

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
            throw new UnresolvedError(`Hintbook '${book}' not found — run 'hint add ${book.replace(/^(npm|file):\/\//, '')}' to install it.`);
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
