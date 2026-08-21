// Dependency-free contract for the manifest-driven static site.
import * as Fs from 'node:fs';
import * as Path from 'node:path';
import { spawnSync } from 'node:child_process';

import '../../benchmarks/check-claims.mjs';

const ROOT = import.meta.dirname;
const REPO = Path.resolve(ROOT, '../..');
const manifest = JSON.parse(Fs.readFileSync(Path.join(ROOT, 'professions.json'), 'utf8'));
const live = manifest.filter(({status}) => status === 'live');
const pages = ['index.html','professions.html', ...live.map(({page}) => page)];
const BOOTSTRAP = 'npx -y @openhint/cli bootstrap';
const problems = [];
const fail = (message) => problems.push(message);

function localTarget(page, rawUrl) {
    const url = rawUrl.replace(/&amp;/g, '&').split(/[?#]/, 1)[0];
    if (!url || url.startsWith('#') || /^(?:[a-z]+:)?\/\//i.test(url) || /^(?:mailto|tel):/i.test(url)) return null;
    return Path.resolve(ROOT, Path.dirname(page), url);
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
}

for (const page of pages) {
    const pagePath = Path.join(ROOT, page);
    if (!Fs.existsSync(pagePath)) { fail(`${page} is missing`); continue; }
    const html = Fs.readFileSync(pagePath, 'utf8');
    if (!html.includes(BOOTSTRAP)) fail(`${page}: bootstrap command is missing`);
    if (!html.includes('docs/integrations.md')) fail(`${page}: integrations link is missing`);
    if (!/<link rel="stylesheet" href="styles\.css(?:\?[^"#]+)?" \/>/.test(html) || !html.includes('<script src="site.js"></script>')) fail(`${page}: shared assets are missing`);
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const target = localTarget(page, match[1]);
        if (target && !Fs.existsSync(target)) fail(`${page}: missing local target ${match[1]}`);
    }
}

const home = Fs.readFileSync(Path.join(ROOT,'index.html'),'utf8');
const hub = Fs.readFileSync(Path.join(ROOT,'professions.html'),'utf8');
for (const entry of manifest) {
    for (const [file, html] of [['index.html',home],['professions.html',hub]]) {
        if (!html.includes(`data-profession="${entry.slug}"`) || !html.includes(`data-status="${entry.status}"`)) fail(`${file}: ${entry.slug} does not have status ${entry.status}`);
    }
}

const sitemap = Fs.readFileSync(Path.join(ROOT,'sitemap.xml'),'utf8');
const llms = Fs.readFileSync(Path.join(ROOT,'llms.txt'),'utf8');
const intro = Fs.readFileSync(Path.join(REPO,'docs/01-intro.md'),'utf8');
const professionsDoc = Fs.readFileSync(Path.join(REPO,'docs/10-professions.md'),'utf8');
for (const entry of live) {
    const html = Fs.readFileSync(Path.join(ROOT,entry.page),'utf8');
    for (const required of [entry.package,entry.demoRepo,'id="faq"','property="og:title"','name="twitter:card"','application/ld+json','FAQPage','BreadcrumbList','SoftwareApplication','professions.html']) if (!html.includes(required)) fail(`${entry.page}: missing ${required}`);
    const decode = (value) => value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
    const title = decode(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '');
    const description = decode(html.match(/<meta name="description" content="([^"]+)" \/>/)?.[1] ?? '');
    if (title.length > 60) fail(`${entry.page}: title is ${title.length} characters`);
    if (description.length > 155) fail(`${entry.page}: description is ${description.length} characters`);
    if ((html.match(/<h1\b/g) ?? []).length !== 1) fail(`${entry.page}: must have exactly one H1`);
    if (!sitemap.includes(`<loc>https://openhint.dev/${entry.page}</loc>`) || !sitemap.includes(`<lastmod>${entry.addedOn}</lastmod>`)) fail(`sitemap: missing dated ${entry.page}`);
    for (const required of [entry.page,entry.bookRepo,entry.demoRepo]) if (!llms.includes(required)) fail(`llms.txt: missing ${required}`);
    if (!intro.includes(entry.package)) fail(`docs/01-intro.md: missing ${entry.package}`);
    if (!professionsDoc.includes(entry.package)) fail(`docs/10-professions.md: missing ${entry.package}`);
}

for (const script of ['build-site-lists.mjs','build-llms.mjs']) {
    const result = spawnSync(process.execPath,[Path.join(ROOT,script),'--check'],{encoding:'utf8'});
    if (result.status !== 0) fail(`${script} --check failed: ${(result.stderr || result.stdout).trim()}`);
}

if (problems.length) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
}
console.log(`${pages.length} pages and ${manifest.length} profession entries checked from the manifest; metadata, local links, docs, sitemap, llms, and generated fragments are consistent.`);
