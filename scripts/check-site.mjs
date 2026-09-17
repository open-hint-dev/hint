import { access, readFile, readdir } from 'node:fs/promises';
import Path from 'node:path';
import { argv, stdout } from 'node:process';
import { URL } from 'node:url';

const repositoryRoot = Path.resolve(import.meta.dirname, '..');
const sourceRoot = Path.join(repositoryRoot, 'sites', 'openhint.dev');
const args = argv.slice(2);
let root = sourceRoot;
let packaged = false;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--root' && args[index + 1]) {
    root = Path.resolve(args[index + 1]);
    index += 1;
  } else if (argument === '--packaged') {
    packaged = true;
  } else {
    throw new Error('usage: check-site.mjs [--root DIRECTORY] [--packaged]');
  }
}

const publicFiles = [
  '.htaccess',
  'index.html',
  '404.html',
  'styles.css',
  'favicon.png',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
];
for (const file of publicFiles) await access(Path.join(root, file));
if (!packaged && root === sourceRoot) await access(Path.join(root, 'README.md'));

const indexHtml = await readFile(Path.join(root, 'index.html'), 'utf8');
const notFoundHtml = await readFile(Path.join(root, '404.html'), 'utf8');
const htaccess = await readFile(Path.join(root, '.htaccess'), 'utf8');
const robots = await readFile(Path.join(root, 'robots.txt'), 'utf8');
const sitemap = await readFile(Path.join(root, 'sitemap.xml'), 'utf8');
const llms = await readFile(Path.join(root, 'llms.txt'), 'utf8');

const mustContain = [
  '<meta name="viewport"',
  '<link rel="canonical" href="https://openhint.dev/"',
  '<meta property="og:url" content="https://openhint.dev/"',
  '<meta property="og:title"',
  '<meta property="og:description"',
  'Hypothesis',
  'Iteration',
  'Notice',
  'Thesis',
  '@openhint/cli',
  'hint guide',
];
for (const token of mustContain) {
  if (!indexHtml.includes(token)) throw new Error(`index.html is missing ${token}`);
}

for (const token of ['<meta name="robots" content="noindex, follow"', 'href="/"', '404']) {
  if (!notFoundHtml.includes(token)) throw new Error(`404.html is missing ${token}`);
}
for (const token of ['ErrorDocument 404 /404.html', 'AddDefaultCharset UTF-8', 'AddType text/plain .txt']) {
  if (!htaccess.includes(token)) throw new Error(`.htaccess is missing ${token}`);
}

const forbidden = [
  'for-software-engineers',
  'professions.json',
  'hintbook',
  'hint bootstrap',
  'hint emit',
  'hint extract',
  'hint verify',
  'hint search',
  'token savings',
  'guaranteed quality',
];
for (const token of forbidden) {
  if (`${indexHtml}\n${notFoundHtml}\n${llms}`.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`site contains removed product surface: ${token}`);
  }
}

async function validateHtml(file, html) {
  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const reference of references) {
    if (reference.startsWith('#')) continue;
    const url = new URL(reference, `https://openhint.dev/${file === 'index.html' ? '' : file}`);
    if (url.origin !== 'https://openhint.dev' || url.pathname === '/') continue;
    await access(Path.join(root, decodeURIComponent(url.pathname.slice(1))));
  }
  for (const anchor of references.filter((reference) => reference.startsWith('#')).map((reference) => reference.slice(1))) {
    if (!html.includes(`id="${anchor}"`)) throw new Error(`${file} has missing anchor #${anchor}`);
  }
}
await validateHtml('index.html', indexHtml);
await validateHtml('404.html', notFoundHtml);

if (!robots.includes('https://openhint.dev/sitemap.xml')) throw new Error('robots.txt lacks sitemap URL');
if ((sitemap.match(/<url>/g) ?? []).length !== 1 || !sitemap.includes('<loc>https://openhint.dev/</loc>')) {
  throw new Error('sitemap must contain only the landing page');
}
if (sitemap.includes('404.html')) throw new Error('sitemap must not index the 404 page');
if (llms.length > 4000) throw new Error('llms.txt should stay concise');

const files = (await readdir(root, { recursive: true })).filter((file) => !file.endsWith('/'));
const legacy = files.filter((file) => /^for-.*\.html$/.test(file) || file.includes('profession') || file === 'llms-full.txt');
if (legacy.length > 0) throw new Error(`legacy site files remain: ${legacy.join(', ')}`);
if (packaged) {
  const actual = files.toSorted();
  const expected = publicFiles.toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`packaged site manifest differs: ${actual.join(', ')}`);
  }
}

stdout.write(`site: ${files.length} files checked${packaged ? ' in package' : ''}\n`);
