import { access, readFile, readdir } from 'node:fs/promises';
import Path from 'node:path';
import { stdout } from 'node:process';

const root = Path.resolve('site');
const required = ['index.html', 'styles.css', 'favicon.png', 'robots.txt', 'sitemap.xml', 'llms.txt'];
for (const file of required) await access(Path.join(root, file));

const html = await readFile(Path.join(root, 'index.html'), 'utf8');
const robots = await readFile(Path.join(root, 'robots.txt'), 'utf8');
const sitemap = await readFile(Path.join(root, 'sitemap.xml'), 'utf8');
const llms = await readFile(Path.join(root, 'llms.txt'), 'utf8');

const mustContain = [
  '<meta name="viewport"',
  '<link rel="canonical" href="https://openhint.dev/"',
  'Hypothesis',
  'Iteration',
  'Notice',
  'Thesis',
  '@openhint/cli',
  'hint guide',
];
for (const token of mustContain) {
  if (!html.includes(token)) throw new Error(`site/index.html is missing ${token}`);
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
  if (`${html}\n${llms}`.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`site contains removed product surface: ${token}`);
  }
}

const localReferences = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)]
  .map((match) => match[1])
  .filter((value) => value && !value.startsWith('http') && !value.startsWith('mailto:'));
for (const reference of localReferences) await access(Path.join(root, reference));

for (const anchor of [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])) {
  if (!html.includes(`id="${anchor}"`)) throw new Error(`missing anchor #${anchor}`);
}
if (!robots.includes('https://openhint.dev/sitemap.xml')) throw new Error('robots.txt lacks sitemap URL');
if ((sitemap.match(/<url>/g) ?? []).length !== 1 || !sitemap.includes('<loc>https://openhint.dev/</loc>')) {
  throw new Error('sitemap must contain only the landing page');
}
if (llms.length > 4000) throw new Error('llms.txt should stay concise');

const files = await readdir(root, { recursive: true });
const legacy = files.filter((file) => /^for-.*\.html$/.test(file) || file.includes('profession') || file === 'llms-full.txt');
if (legacy.length > 0) throw new Error(`legacy site files remain: ${legacy.join(', ')}`);

stdout.write(`site: ${files.length} files checked\n`);
