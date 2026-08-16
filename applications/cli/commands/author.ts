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

                // An emit pack ships `<keyword>.tmpl` artifact templates, not vocabulary. Listing them
                // here would advertise a keyword per target and, since folders resolve sorted, would
                // shadow the real definition an author needs to read.
                if (Transpiler.isEmitPack(hintbook)) {
                    continue;
                }

                const source = hintbook.id || hintbook.name || Path.basename(hintbookPath);

                for (const instruction of hintbook.instructions) {
                    // First hintbook to define a keyword wins, mirroring render-time lookup order.
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

        return keywords.sort((a, b) => a.keyword.localeCompare(b.keyword));
    }
}

// The vocabulary comes first and fits on a screen. Picking a legal keyword is the decision an author
// has to make; the syntax rules matter less and can be read after. Anyone who truncates this output
// still gets the part they came for.
function buildAuthorPrompt(keywords: Keyword[], paths: string[]): string {
    const target =
        paths.length > 0
            ? `Write or update the HINT knowledge (\`.hint\`) for: ${paths.join(', ')}.`
            : 'Write or update the HINT knowledge (`.hint`) the user asked for.';

    return [
        '# Authoring HINT knowledge',
        `${target} A \`.hint\` file records what future work on that path must know — decisions, invariants, constraints, hazards, and contracts. It lives in the repository, is versioned with the code, and any coding agent can query it. Capture durable knowledge, not session state, and not an implementation.`,
        '## Keyword vocabulary',
        "The first word of every heading must be one of these keywords (or a synonym) registered by this project's hintbooks. A heading whose keyword is unknown is passed through as plain markdown and carries no binding meaning.",
        formatKeywordIndex(keywords),
        '## What lasts, and what rots',
        DURABILITY,
        '## File kinds and naming',
        FILE_KINDS,
        '## Syntax',
        SYNTAX,
        '## Keyword reference',
        formatKeywordDetails(keywords),
        '## Output',
        OUTPUT_RULES,
    ].join('\n\n');
}

// Which blocks an author reaches for decides how much maintenance the spec will demand for the rest of
// its life, and that is not obvious from the vocabulary table. Knowledge that explains survives
// refactoring; knowledge that restates the code is a copy that starts drifting the moment the code moves.
const DURABILITY = [
    '- **Prefer explaining over restating.** A decision with its rationale, an invariant, a hazard, a convention the code does not make obvious — these stay true across refactors. A block that repeats a signature, a schema, or a field list is a copy of the code, and the copy is what goes stale.',
    '- **Never quote the contents of another file.** A fenced snapshot of a config, a schema, or an ignore file drifts silently and then steers the next reader wrong, with the authority of a spec behind it. Reference the file by path and state the constraint it has to satisfy.',
    '- **Always give the reason.** A bare rule gets overturned the first time it is inconvenient. A rule with its rationale tells the next reader whether a new situation is still covered — which is the whole reason to write it down instead of leaving it to be rediscovered.',
    '- **Declare surfaces only when something will check them.** Surface keywords make the spec a contract the code must satisfy, which buys `hint verify` and `hint lock` at the cost of maintaining a restatement of the code. If nobody will regenerate or verify this file, do not declare surfaces.',
    '- Knowledge that is already obvious from the code is duplication, and duplication drifts. Leave it out.',
].join('\n');

const FILE_KINDS = [
    '- **Folder knowledge** — `_.hint` applies to its folder and everything beneath it. The root `_.hint` is the project-wide baseline. This is the most common kind: a repository that only ever uses folder hints is a normal, fully supported setup.',
    '- **Companion knowledge** — `<path>.hint` applies to the file at `<path>`: `src/auth/login.ts.hint` describes `src/auth/login.ts`. The target file need not exist yet; the knowledge is keyed to the path.',
    '- **Detached store** — a folder whose name ends in `.hint` (e.g. `packages.hint/`) holds hints for the matching real path with the `.hint` tail removed: `packages.hint/db/schema.ts.hint` describes `packages/db/schema.ts`. Use it to keep hints out of, or gitignored from, the tree they document.',
].join('\n');

const SYNTAX = [
    'A `.hint` file is 100% valid Markdown. Every heading opens a typed block:',
    '```markdown',
    '# keyword Name {#stable_id}',
    '',
    'the block body — plain markdown: paragraphs, lists, code fences, tables',
    '```',
    '- **Keyword** — the first word of the heading; case-sensitive; must be a registered keyword.',
    '- **Name** — everything after the keyword (may be empty). Templates usually render it as a `name="…"` attribute.',
    '- **Id** — an optional `{#stable_id}` suffix giving the block a stable handle that survives renames.',
    '- **Body** — everything between this heading and the next heading of any level.',
    '- **Nesting** — heading depth builds the tree: a deeper heading is a child of the nearest shallower one. Text before the first heading is the file/folder preamble context.',
    '- **Includes** — a line that is exactly `@include <path>` inlines another file verbatim before parsing; use it for fragments multiple specs must state identically.',
].join('\n');

const OUTPUT_RULES = [
    '- Read the `.hint` file first if it already exists, then write it to disk at its correct path (creating folders as needed), and tell the user which files you wrote.',
    '- Record it at the most specific scope that applies: the file’s companion hint, else the folder’s `_.hint`, else the root `_.hint`. Knowledge in the wrong scope either misses the work it should govern or pollutes work it should not.',
    '- Keep it declarative and minimal: state what must be true and why. Do not write the implementation.',
    '- Reuse stable ids when revising so references stay intact.',
    '- After writing, run `hint <path>` to see exactly what a coding agent will receive.',
    '- Commit the `.hint` in the same change as the code it describes. Staleness is measured from the hint’s last commit against the churn beneath it, so a hint committed with its code starts clean.',
].join('\n');

// One row per keyword, single-line cells. Descriptions in a hintbook are multi-line YAML block scalars
// that often carry a fenced example; interpolating those into pipe-delimited cells produced rows that
// terminated mid-cell and parsed as a table in no Markdown implementation. The first line is the
// summary, and the full text moves to the reference section below.
function formatKeywordIndex(keywords: Keyword[]): string {
    const rows = [
        [
            'keyword',
            'synonyms',
            'what it declares',
        ],
        [
            '-------',
            '--------',
            '-----------------',
        ],
        ...keywords.map((keyword) => [
            keyword.keyword,
            keyword.synonyms.join(', ') || '—',
            summarize(keyword.description),
        ]),
    ];

    return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

// The first sentence or line of a description, collapsed to one line so it can never break a table row.
function summarize(description: string): string {
    const firstLine = description
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);

    if (!firstLine) {
        return '—';
    }

    const collapsed = firstLine.replace(/\|/g, '\\|');

    return collapsed.length > 120 ? `${collapsed.slice(0, 117)}...` : collapsed;
}

// Full descriptions, examples included, as prose sections — the place multi-line content can live
// without corrupting anything. Keywords with nothing but a summary are omitted rather than repeated.
function formatKeywordDetails(keywords: Keyword[]): string {
    const sections = keywords
        .filter((keyword) => keyword.description.includes('\n'))
        .map((keyword) => `### ${keyword.keyword}\n\n${keyword.description.trim()}`);

    return sections.length > 0 ? sections.join('\n\n') : '_The registered hintbooks provide no extended keyword documentation._';
}
