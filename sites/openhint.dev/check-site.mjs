// Dependency-free contract for the manifest-driven static site.
import * as Fs from 'node:fs';
import * as Path from 'node:path';
import { spawnSync } from 'node:child_process';
import { footer, nav } from './site-components.mjs';

import '../../benchmarks/check-claims.mjs';

const ROOT = import.meta.dirname;
const REPO = Path.resolve(ROOT, '../..');
const manifest = JSON.parse(Fs.readFileSync(Path.join(ROOT, 'professions.json'), 'utf8'));
const live = manifest.filter(({status}) => status === 'live');
const pages = ['index.html', 'professions.html', ...live.map(({page}) => page)];
const BOOTSTRAP = 'npx -y @openhint/cli bootstrap';
const problems = [];
const fail = (message) => problems.push(message);
const htmlByPage = new Map();
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

function localReference(page, rawUrl) {
    const decoded = rawUrl.replaceAll('&amp;', '&');
    if (/^(?:[a-z]+:)?\/\//i.test(decoded) || /^(?:mailto|tel):/i.test(decoded)) return null;
    const [pathAndQuery, anchor = ''] = decoded.split('#', 2);
    const rawPath = pathAndQuery.split('?', 1)[0];
    const path = rawPath ? Path.resolve(ROOT, Path.dirname(page), rawPath) : Path.join(ROOT, page);
    return {path, anchor};
}

function marker(html, name) {
    return html.match(new RegExp(`<!-- ${name}:begin -->[\\s\\S]*?<!-- ${name}:end -->`))?.[0] ?? '';
}

function jsonLd(html, page) {
    const values = [];
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
            const parsed = JSON.parse(match[1]);
            values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        } catch (error) {
            fail(`${page}: JSON-LD does not parse (${error.message})`);
        }
    }
    return values;
}

function visibleFaqCount(html) {
    return (html.match(/<details class="faq"/g) ?? []).length;
}

function headingLevels(html) {
    return [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
}

function repeatedSentences(html) {
    const plain = decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const counts = new Map();
    for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
        const normalized = sentence.trim().toLowerCase();
        if (normalized.split(/\s+/).length < 6) continue;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    return [...counts].filter(([, count]) => count >= 3);
}

const requiredKeys = ['slug','title','plural','family','accent','status','package','bookRepo','demoRepo','page','tileLine','keywords','related','addedOn'];
const slugs = new Set();
for (const entry of manifest) {
    for (const key of requiredKeys) if (!(key in entry)) fail(`manifest ${entry.slug ?? '<unknown>'}: missing ${key}`);
    if (slugs.has(entry.slug)) fail(`manifest: duplicate slug ${entry.slug}`);
    slugs.add(entry.slug);
    if (!['live','soon'].includes(entry.status)) fail(`manifest ${entry.slug}: invalid status`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.addedOn)) fail(`manifest ${entry.slug}: invalid addedOn`);
    for (const related of entry.related) if (!manifest.some(({slug}) => slug === related)) fail(`manifest ${entry.slug}: unknown related slug ${related}`);
    const contentPath = Path.join(ROOT, 'professions', `${entry.slug}.json`);
    if (!Fs.existsSync(contentPath)) fail(`manifest ${entry.slug}: content file is missing`);
    else {
        const content = JSON.parse(Fs.readFileSync(contentPath, 'utf8'));
        for (const key of ['title','metaDescription','profession','packageRole','h1','intro','artifact','situations','example','never','disclaimer','faq','keywordDescriptions','technical']) if (!(key in content)) fail(`${entry.slug}.json: missing ${key}`);
        if (content.situations?.length !== 3) fail(`${entry.slug}.json: must define three situations`);
        if (content.faq?.length < 3) fail(`${entry.slug}.json: must define at least three FAQs`);
        if (content.example?.lines?.length < 6 || content.example?.lines?.length > 10) fail(`${entry.slug}.json: example must be 6–10 lines`);
        for (const keyword of entry.keywords) if (!content.keywordDescriptions?.[keyword]) fail(`${entry.slug}.json: missing description for ${keyword}`);
    }
}

for (const page of pages) {
    const pagePath = Path.join(ROOT, page);
    if (!Fs.existsSync(pagePath)) { fail(`${page} is missing`); continue; }
    const html = Fs.readFileSync(pagePath, 'utf8');
    htmlByPage.set(page, html);
    if (!html.includes(BOOTSTRAP)) fail(`${page}: bootstrap command is missing`);
    if (!html.includes('docs/integrations.md')) fail(`${page}: integrations link is missing`);
    if (!/<link rel="stylesheet" href="styles\.css\?v=1\.7\.0-site-quality" \/>/.test(html) || !html.includes('<script src="site.js?v=1.7.0-site-quality"></script>')) fail(`${page}: versioned shared assets are missing`);
    for (const required of ['property="og:title"', 'name="twitter:card"', 'application/ld+json', 'rel="alternate" type="text/plain" href="llms.txt"', '<main']) if (!html.includes(required)) fail(`${page}: missing ${required}`);
    if (!html.includes('<a class="skip-link" href="#content">')) fail(`${page}: skip link is missing`);
    if (!html.includes('<noscript>')) fail(`${page}: reveal noscript fallback is missing`);
    if (html.includes('class="wrap numbers"')) fail(`${page}: numbers must be nested inside .wrap`);
    if (/target="_blank"(?![^>]*rel="noopener")/.test(html)) fail(`${page}: target=_blank link is missing rel=noopener`);
    for (const image of html.matchAll(/<img\b[^>]*>/g)) if (!/\bwidth=/.test(image[0]) || !/\bheight=/.test(image[0])) fail(`${page}: image is missing width/height`);
    if (html.indexOf('<meta charset=') > html.indexOf('googletagmanager')) fail(`${page}: charset must precede analytics`);
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const reference = localReference(page, match[1]);
        if (!reference) continue;
        if (!Fs.existsSync(reference.path)) { fail(`${page}: missing local target ${match[1]}`); continue; }
        if (reference.anchor && reference.path.endsWith('.html')) {
            const targetHtml = reference.path === pagePath ? html : Fs.readFileSync(reference.path, 'utf8');
            const escaped = reference.anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!new RegExp(`\\bid="${escaped}"`).test(targetHtml)) fail(`${page}: missing anchor target ${match[1]}`);
        }
    }
    const levels = headingLevels(html);
    for (let index = 1; index < levels.length; index += 1) if (levels[index] > levels[index - 1] + 1) fail(`${page}: heading skips from h${levels[index - 1]} to h${levels[index]}`);
    for (const [sentence, count] of repeatedSentences(html)) fail(`${page}: sentence repeated ${count} times: ${sentence.slice(0, 90)}`);
    const structured = jsonLd(html, page);
    const faq = structured.find((item) => item['@type'] === 'FAQPage');
    if (faq && faq.mainEntity.length !== visibleFaqCount(html)) fail(`${page}: JSON-LD FAQ count differs from visible FAQ (${faq.mainEntity.length} vs ${visibleFaqCount(html)})`);
    const title = decode(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '');
    const description = decode(html.match(/<meta name="description" content="([^"]+)" \/>/)?.[1] ?? '');
    if (title.includes('…')) fail(`${page}: title contains an ellipsis`);
    if (title.length > 60) fail(`${page}: title is ${title.length} characters`);
    if (description.length > 155) fail(`${page}: description is ${description.length} characters`);
}

const home = htmlByPage.get('index.html');
const hub = htmlByPage.get('professions.html');
for (const entry of manifest) if (!hub.includes(`data-profession="${entry.slug}"`) || !hub.includes(`data-status="${entry.status}"`)) fail(`professions.html: ${entry.slug} does not have status ${entry.status}`);
if ((home.match(/class="proftile proftile--live"/g) ?? []).length !== 6) fail('index.html: profession section must show exactly six guides');
if (!/<div class="demo__switch" role="tablist"[\s\S]*?<button[^>]+role="tab"[^>]+aria-selected=/.test(home)) fail('index.html: profession switcher tabs are missing ARIA roles');
if (!/<button class="nav__menu-btn"[^>]+aria-controls="mobile-menu"/.test(home)) fail('index.html: mobile menu button is missing aria-controls');
if (marker(home, 'shared-nav') !== marker(nav(''), 'shared-nav')) fail('index.html: shared navigation has drifted');
if (marker(hub, 'shared-nav') !== marker(nav('professions'), 'shared-nav')) fail('professions.html: shared navigation has drifted');
for (const page of pages) if (marker(htmlByPage.get(page), 'shared-footer') !== marker(footer(manifest), 'shared-footer')) fail(`${page}: shared footer has drifted`);

const sitemap = Fs.readFileSync(Path.join(ROOT, 'sitemap.xml'), 'utf8');
const llms = Fs.readFileSync(Path.join(ROOT, 'llms.txt'), 'utf8');
const intro = Fs.readFileSync(Path.join(REPO, 'docs/01-intro.md'), 'utf8');
const professionsDoc = Fs.readFileSync(Path.join(REPO, 'docs/10-professions.md'), 'utf8');
for (const entry of live) {
    const html = htmlByPage.get(entry.page);
    for (const required of [entry.package, entry.demoRepo, 'id="faq-title"', 'FAQPage', 'BreadcrumbList', 'SoftwareApplication', 'professions.html', 'class="handoff"', 'id="manual"']) if (!html.includes(required)) fail(`${entry.page}: missing ${required}`);
    if (!html.includes('data-copy-text="Set up HINT in this folder for') || !html.includes(entry.package)) fail(`${entry.page}: handoff copy does not contain its package`);
    if (!html.startsWith(`<!DOCTYPE html>\n<html lang="en" data-accent="${entry.accent}">`)) fail(`${entry.page}: accent differs from manifest`);
    if ((html.match(/<h1\b/g) ?? []).length !== 1) fail(`${entry.page}: must have exactly one H1`);
    if (/Declares the approved .* and its boundaries/i.test(html)) fail(`${entry.page}: placeholder vocabulary description remains`);
    if (!sitemap.includes(`<loc>https://openhint.dev/${entry.page}</loc>`) || !sitemap.includes(`<lastmod>${entry.addedOn}</lastmod>`)) fail(`sitemap: missing dated ${entry.page}`);
    for (const required of [entry.page, entry.bookRepo, entry.demoRepo]) if (!llms.includes(required)) fail(`llms.txt: missing ${required}`);
    if (!intro.includes(entry.package)) fail(`docs/01-intro.md: missing ${entry.package}`);
    if (!professionsDoc.includes(entry.package)) fail(`docs/10-professions.md: missing ${entry.package}`);
    if (marker(html, 'shared-nav') !== marker(nav('professions'), 'shared-nav')) fail(`${entry.page}: shared navigation has drifted`);
}

if (Fs.existsSync(Path.join(ROOT, '_template-profession.html'))) fail('_template-profession.html must be deleted once all pages use the generator');

// Every class used by HTML must be declared in shared or page-local CSS.
const sharedCss = Fs.readFileSync(Path.join(ROOT, 'styles.css'), 'utf8');
for (const page of pages) {
    const html = htmlByPage.get(page);
    const localCss = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n');
    const defined = new Set([...`${sharedCss}\n${localCss}`.matchAll(/\.([A-Za-z_-][\w-]*)/g)].map((match) => match[1]));
    const used = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].trim().split(/\s+/)));
    for (const className of used) if (!defined.has(className)) fail(`${page}: undefined class .${className}`);
}

for (const scriptName of ['build-site-lists.mjs', 'build-profession-pages.mjs', 'build-llms.mjs']) {
    const result = spawnSync(process.execPath, [Path.join(ROOT, scriptName), '--check'], {encoding:'utf8'});
    if (result.status !== 0) fail(`${scriptName} --check failed: ${(result.stderr || result.stdout).trim()}`);
}

if (problems.length) {
    for (const problem of [...new Set(problems)]) console.error(`::error::${problem}`);
    process.exit(1);
}
console.log(`${pages.length} pages and ${manifest.length} profession entries checked: generated content, handoffs, accessibility, metadata, links, shared components, docs, sitemap, and llms are consistent.`);
