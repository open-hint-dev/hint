// Assembles llms-full.txt from docs/.
//
// That file is a derived artifact: its core-docs half is `docs/*.md` concatenated, with the relative
// links between them rewritten to absolute ones, because a reader who arrives through an LLM has no
// repository to resolve `05-hintbooks.md` against. It was kept in sync by hand, which is a promise
// nobody can keep across a 2,000-line file — and it had already drifted.
//
// Dependency-free on purpose, matching the rest of this repository's CI.
//
//   node sites/openhint.dev/build-llms.mjs           write it
//   node sites/openhint.dev/build-llms.mjs --check   fail if what is committed is not what docs say

import * as Fs from 'node:fs';
import * as Path from 'node:path';

const ROOT = Path.resolve(import.meta.dirname, '../..');
const OUTPUT = Path.join(ROOT, 'sites/openhint.dev/llms-full.txt');
const DOCS = Path.join(ROOT, 'docs');
const REPO = 'https://github.com/open-hint-dev/hint/blob/main/';
const BASE = `${REPO}docs/`;

// The heading each doc appears under. Order is the reading order, not the filename order — the same
// order `docs/01-intro.md` sends a reader through.
const SECTIONS = [
    { file: '01-intro.md', title: 'Introduction' },
    { file: '02-quick-start.md', title: 'Quick Start' },
    { file: '03-syntax.md', title: 'Syntax Specification' },
    { file: '04-how-it-works.md', title: 'How It Works (the pipeline)' },
    { file: '05-hintbooks.md', title: 'Hintbooks (Authoring & Distribution)' },
    { file: '06-cli.md', title: 'CLI Reference' },
    { file: '07-migration.md', title: 'Migrating to 1.1' },
    { file: '08-emit.md', title: 'Emit (artifacts from specs)' },
];

const RULE = '<!-- ============================================================ -->';

// Everything before the first section marker is the file's own preamble, and everything from the
// first HINTBOOK marker on is copied from two other repositories. Both are kept verbatim: this script
// owns the half it can derive and does not pretend to own the half it cannot.
const HINTBOOK_MARKER = '<!-- HINTBOOK:';

function banner(label) {
    return `${RULE}\n<!-- ${label} -->\n${RULE}`;
}

// `05-hintbooks.md` means nothing to a reader with no checkout, and neither does `../packages/…`.
// Anchors survive the rewrite; links that already point somewhere absolute are left alone.
function absolute(markdown) {
    return markdown
        .replace(/\]\((\d{2}-[a-z-]+\.md)(#[^)]*)?\)/g, (_, file, anchor) => `](${BASE}${file}${anchor ?? ''})`)
        .replace(/\]\(\.\.\/([^)]+)\)/g, (_, path) => `](${REPO}${path})`);
}

function build(existing) {
    const hintbooksAt = existing.indexOf(HINTBOOK_MARKER);

    if (hintbooksAt === -1) {
        throw new Error(`No ${HINTBOOK_MARKER} section in llms-full.txt — refusing to write a file that would drop the hintbook references.`);
    }

    const preambleAt = existing.indexOf(RULE);

    if (preambleAt === -1) {
        throw new Error('No section rule in llms-full.txt — cannot tell the preamble from the body.');
    }

    const parts = [existing.slice(0, preambleAt).trimEnd()];

    for (const section of SECTIONS) {
        const body = absolute(Fs.readFileSync(Path.join(DOCS, section.file), 'utf8').trim());

        parts.push(`${banner(`CORE DOCS — ${section.title}`)}\n\n${body}`);
    }

    // The rule line opening the hintbook half belongs to it, not to the last core doc.
    parts.push(existing.slice(existing.lastIndexOf(RULE, hintbooksAt)).trimEnd());

    return `${parts.join('\n\n')}\n`;
}

function main() {
    const existing = Fs.readFileSync(OUTPUT, 'utf8');
    const built = build(existing);

    if (!process.argv.includes('--check')) {
        Fs.writeFileSync(OUTPUT, built);
        console.log(`llms-full.txt: ${SECTIONS.length} core docs assembled${built === existing ? ' (unchanged)' : ''}.`);

        return;
    }

    if (built === existing) {
        console.log('llms-full.txt is up to date with docs/.');

        return;
    }

    console.error('::error::llms-full.txt has drifted from docs/ — run `node sites/openhint.dev/build-llms.mjs` and commit the result.');
    process.exit(1);
}

main();
