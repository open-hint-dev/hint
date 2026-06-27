import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

// Running instructions (`__file__`, `__header__`, …) are structural slots, not authoring keywords —
// they never appear in a `.hint` heading, so the author prompt must not advertise them.
const RUNNING_INSTRUCTION = /^__.+__$/;

type Keyword = {
    keyword: string;
    synonyms: string[];
    description: string;
    hintbook: string;
};

export class AuthorCommand implements ICommand {
    private paths: string[] = [];

    static new(paths: string[]): AuthorCommand {
        const command = new AuthorCommand();

        command.paths = paths;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const books = config?.books ?? [];

        if (books.length === 0) {
            throw new Error(`No hintbooks registered in ${Transpiler.CONFIG_FILE_YML} — run 'hint add <book>' to install a hintbook.`);
        }

        const keywords = await this.collectKeywords(projectRootPath, books);

        if (keywords.length === 0) {
            throw new Error('No keywords found in the registered hintbooks.');
        }

        process.stdout.write(`${buildAuthorPrompt(keywords, this.paths)}\n`);
    }

    private async collectKeywords(projectRootPath: string, books: string[]): Promise<Keyword[]> {
        const keywords: Keyword[] = [];
        const seen = new Set<string>();

        for (const book of books) {
            const hintbookPaths = await Transpiler.resolveHintbookPaths(projectRootPath, book);

            if (hintbookPaths.length === 0) {
                process.stderr.write(`Skipping hintbook '${book}': not found\n`);
                continue;
            }

            for (const hintbookPath of hintbookPaths) {
                const hintbook = await Transpiler.loadHintbook(hintbookPath);
                const source = hintbook.id || hintbook.name || Path.basename(hintbookPath);

                for (const mode of Object.values(hintbook.modes)) {
                    for (const instruction of mode.instructions) {
                        // First hintbook to define a keyword wins, mirroring compile-time lookup order.
                        if (RUNNING_INSTRUCTION.test(instruction.name) || seen.has(instruction.name)) {
                            continue;
                        }

                        seen.add(instruction.name);

                        keywords.push({
                            keyword: instruction.name,
                            synonyms: instruction.metadata?.synonyms ?? [],
                            description: instruction.metadata?.description ?? '',
                            hintbook: source,
                        });
                    }
                }
            }
        }

        return keywords.sort((a, b) => a.keyword.localeCompare(b.keyword));
    }
}

function buildAuthorPrompt(keywords: Keyword[], paths: string[]): string {
    const target =
        paths.length > 0
            ? `Write or update the HINT specification (\`.hint\`) for each of these target paths: ${paths.join(', ')}.`
            : 'Write or update the HINT specification (`.hint`) files the user asked for.';

    return [
        '# Authoring HINT specification files',
        `${target} A \`.hint\` file is the authoritative implementation contract for a target file or folder; the \`hint\` CLI compiles it into an AI-ready prompt. Capture intent, contracts, and constraints — not an implementation.`,
        '## File kinds and naming',
        FILE_KINDS,
        '## Syntax',
        SYNTAX,
        '## Keyword vocabulary',
        "Use only these keywords (or their synonyms) registered by this project's hintbooks. The first word of every heading must be one of them — a heading whose keyword is unknown is passed through as plain markdown and carries no binding meaning. Pick the keyword whose description matches what you are declaring.",
        formatKeywordTable(keywords),
        '## Output',
        OUTPUT_RULES,
    ].join('\n\n');
}

const FILE_KINDS = [
    '- **Companion hint** — `<path>.hint` specifies the file at `<path>`: `src/auth/login.ts.hint` specifies `src/auth/login.ts`. The target file need not exist yet; the spec is keyed to the path.',
    '- **Folder hint** — `_.hint` specifies its folder and everything beneath it. The root `_.hint` is the project-wide baseline. Put shared context here so companion hints stay focused.',
    '- **Detached hint store** — a folder whose name ends in `.hint` (e.g. `packages.hint/`) holds hints for the matching real path with the `.hint` tail removed: `packages.hint/db/schema.ts.hint` specifies `packages/db/schema.ts`. Use it to keep hints out of, or gitignored from, the tree they document.',
].join('\n');

const SYNTAX = [
    'A `.hint` file is 100% valid Markdown. Every heading opens a typed block:',
    '```markdown',
    '# keyword Name {#stable_id}',
    '',
    'the block body — plain markdown: paragraphs, lists, code fences, tables',
    '```',
    '- **Keyword** — the first word of the heading; case-sensitive; must be a registered keyword (below).',
    '- **Name** — everything after the keyword (may be empty). Templates usually render it as a `name="…"` attribute.',
    '- **Id** — an optional `{#stable_id}` suffix giving the block a stable handle that survives renames.',
    '- **Body** — everything between this heading and the next heading of any level.',
    '- **Nesting** — heading depth builds the tree: a deeper heading is a child of the nearest shallower one. Text before the first heading is the file/folder preamble context.',
    '- **Includes** — a line that is exactly `@include <path>` inlines another file verbatim before parsing; use it for fragments multiple specs must state identically.',
].join('\n');

const OUTPUT_RULES = [
    '- Write each `.hint` file to disk at its correct path (creating folders as needed), then tell the user which files you wrote.',
    '- Keep it declarative and minimal: state what must be true, the data shapes, behaviors, and constraints — do not write the implementation.',
    '- Reuse stable ids when revising an existing spec so references stay intact.',
    '- After writing, you may run `hint <path...>` to compile a spec and read the result as the agent would.',
].join('\n');

function formatKeywordTable(keywords: Keyword[]): string {
    const rows = [
        [
            'keyword',
            'synonyms',
            'description',
            'hintbook',
        ],
        [
            '-------',
            '--------',
            '-----------',
            '--------',
        ],
        ...keywords.map((keyword) => [
            keyword.keyword,
            keyword.synonyms.join(', ') || '—',
            keyword.description || '—',
            keyword.hintbook,
        ]),
    ];

    return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}
