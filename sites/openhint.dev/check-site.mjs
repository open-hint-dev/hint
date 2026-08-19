// Lightweight validation for the dependency-free static site. This catches the failures that matter
// in production: a renamed local asset, a missing shared script, or one of the profession pages
// falling behind the setup path advertised on the home page.

import * as Fs from 'node:fs';
import * as Path from 'node:path';

const ROOT = import.meta.dirname;
const PAGES = [
    'index.html',
    'for-software-engineers.html',
    'for-lawyers.html',
];
const BOOTSTRAP = 'npx -y @openhint/cli bootstrap';

function fail(message) {
    console.error(`::error::${message}`);
    process.exitCode = 1;
}

function localTarget(page, rawUrl) {
    const url = rawUrl.replace(/&amp;/g, '&').split(/[?#]/, 1)[0];

    if (!url || url.startsWith('#') || /^(?:[a-z]+:)?\/\//i.test(url) || /^(?:mailto|tel):/i.test(url)) {
        return null;
    }

    return Path.resolve(ROOT, Path.dirname(page), url);
}

for (const page of PAGES) {
    const pagePath = Path.join(ROOT, page);
    const html = Fs.readFileSync(pagePath, 'utf8');

    if (!html.includes(BOOTSTRAP)) {
        fail(`${page} does not advertise the agent bootstrap command.`);
    }

    if (!html.includes('docs/integrations.md')) {
        fail(`${page} does not link to the agent integration documentation.`);
    }

    if (!html.includes('<link rel="stylesheet" href="styles.css" />') || !html.includes('<script src="site.js"></script>')) {
        fail(`${page} does not load the shared site assets.`);
    }

    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const target = localTarget(page, match[1]);

        if (target && !Fs.existsSync(target)) {
            fail(`${page} references missing local asset '${match[1]}'.`);
        }
    }
}

if (!process.exitCode) {
    console.log(`${PAGES.length} site pages checked: bootstrap, docs, scripts, styles, and local links are present.`);
}
