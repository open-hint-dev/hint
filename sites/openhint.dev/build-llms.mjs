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
const SITE = Path.join(ROOT, 'sites/openhint.dev');
const MANIFEST = JSON.parse(Fs.readFileSync(Path.join(SITE, 'professions.json'), 'utf8'));
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
    { file: 'integrations.md', title: 'Integrations' },
    { file: '07-migration.md', title: 'Migrating to 1.1' },
    { file: '08-emit.md', title: 'Emit (artifacts from specs)' },
    { file: '09-knowledge-repos.md', title: 'Knowledge Repositories' },
    { file: '10-professions.md', title: 'Profession Hintbooks' },
];

const RULE = '<!-- ============================================================ -->';

// Everything before the first section marker is the file's own preamble. Hintbook README sections
// are refreshed from sibling repositories in the maintainer checkout. A clean CI clone preserves
// their committed snapshots so --check is deterministic without checking out eighteen repositories.
const HINTBOOK_MARKER = '<!-- HINTBOOK:';

function banner(label) {
    return `${RULE}\n<!-- ${label} -->\n${RULE}`;
}

function committedHintbookReadme(existing, entry) {
    const marker = banner(`HINTBOOK: ${entry.slug} — README`);
    const markerAt = existing.indexOf(marker);

    if (markerAt === -1) return null;

    const bodyAt = markerAt + marker.length;
    const nextBannerAt = existing.indexOf(RULE, bodyAt);

    return existing.slice(bodyAt, nextBannerAt === -1 ? undefined : nextBannerAt).trim();
}

// `05-hintbooks.md` means nothing to a reader with no checkout, and neither does `../packages/…`.
// Anchors survive the rewrite; links that already point somewhere absolute are left alone.
function absolute(markdown) {
    return markdown
        .replace(/\]\(([a-z0-9-]+\.md)(#[^)]*)?\)/g, (_, file, anchor) => `](${BASE}${file}${anchor ?? ''})`)
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

    for (const entry of MANIFEST.filter(({ status }) => status === 'live')) {
        const readme = Path.resolve(ROOT, '../hintbooks', entry.bookRepo, 'README.md');
        const fallback = `# ${entry.package}\n\n${entry.tileLine}.\n\nSource: https://github.com/open-hint-dev/${entry.bookRepo}`;
        const body = Fs.existsSync(readme)
            ? Fs.readFileSync(readme, 'utf8').trim()
            : committedHintbookReadme(existing, entry) ?? fallback;
        parts.push(`${banner(`HINTBOOK: ${entry.slug} — README`)}\n\n${absolute(body)}`);
    }

    return `${parts.join('\n\n')}\n`;
}

function buildShort(existing) {
    const begin = '<!-- professions:begin -->';
    const end = '<!-- professions:end -->';
    const pages = ['- [Profession hub](https://openhint.dev/professions.html): All official and planned profession vocabularies.', ...MANIFEST.filter(({status}) => status === 'live').map((entry) => `- [For ${entry.title}](https://openhint.dev/${entry.page}): ${entry.tileLine}.`)];
    const books = MANIFEST.filter(({status}) => status === 'live').map((entry) => `- [${entry.bookRepo}](https://github.com/open-hint-dev/${entry.bookRepo}): ${entry.tileLine}.`);
    const demos = MANIFEST.filter(({status}) => status === 'live').map((entry) => `- [${entry.demoRepo}](https://github.com/open-hint-dev/${entry.demoRepo}): Demonstrates ${entry.title.toLowerCase()} Spec-as-Source.`);
    const fragment = `${begin}\n## Pages\n\n${pages.join('\n')}\n\n## Hintbooks\n\n${books.join('\n')}\n\n## Demos\n\n${demos.join('\n')}\n${end}`;
    if (!existing.includes(begin) || !existing.includes(end)) throw new Error('llms.txt profession markers are missing');
    return existing.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), fragment);
}

function main() {
    const existing = Fs.readFileSync(OUTPUT, 'utf8');
    const built = build(existing);
    const shortPath = Path.join(SITE, 'llms.txt');
    const shortExisting = Fs.readFileSync(shortPath, 'utf8');
    const shortBuilt = buildShort(shortExisting);

    if (!process.argv.includes('--check')) {
        Fs.writeFileSync(OUTPUT, built);
        Fs.writeFileSync(shortPath, shortBuilt);
        console.log(`llms files: ${SECTIONS.length} core docs and ${MANIFEST.filter(({status}) => status === 'live').length} live professions assembled${built === existing && shortBuilt === shortExisting ? ' (unchanged)' : ''}.`);

        return;
    }

    if (built === existing && shortBuilt === shortExisting) {
        console.log('llms.txt and llms-full.txt are up to date.');

        return;
    }

    console.error('::error::llms-full.txt has drifted from docs/ — run `node sites/openhint.dev/build-llms.mjs` and commit the result.');
    process.exit(1);
}

main();
