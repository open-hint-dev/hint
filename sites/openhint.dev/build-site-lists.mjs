import * as Fs from 'node:fs';
import * as Path from 'node:path';
import { footer, head, nav, script } from './site-components.mjs';

const ROOT = import.meta.dirname;
const manifest = JSON.parse(Fs.readFileSync(Path.join(ROOT, 'professions.json'), 'utf8'));
const checking = process.argv.includes('--check');

function escape(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function replace(file, marker, body) {
    const path = Path.join(ROOT, file);
    const source = Fs.readFileSync(path, 'utf8');
    const begin = `<!-- ${marker}:begin -->`;
    const end = `<!-- ${marker}:end -->`;
    const pattern = new RegExp(`${begin}[\\s\\S]*?${end}`);
    if (!pattern.test(source)) throw new Error(`${file}: missing ${marker} markers`);
    const built = source.replace(pattern, `${begin}\n${body}\n    ${end}`);
    if (checking && source !== built) {
        console.error(`::error::${file} generated ${marker} fragment has drifted`);
        process.exitCode = 1;
    } else if (!checking && source !== built) {
        Fs.writeFileSync(path, built);
    }
}

function home() {
    const live = manifest.filter(({ status }) => status === 'live');
    const featured = live.slice(0, 6);
    const liveCards = featured.map((entry) => `      <a class="proftile proftile--live" data-profession="${entry.slug}" data-status="live" href="${entry.page}"><div><h3>${escape(entry.title)}</h3><p>${escape(entry.tileLine)}</p></div><span class="proftile__go">Explore →</span></a>`).join('\n');
    return `    <div class="profgrid reveal" style="margin-bottom:14px;">\n${liveCards}\n    </div>\n\n    <div class="reveal profession-more"><a class="btn btn--ghost" href="professions.html">Browse all 18 professions →</a></div>`;
}

const familyNames = {
    delivery: 'Delivery',
    'law-assurance': 'Law & assurance',
    commercial: 'Commercial',
    'analysis-knowledge': 'Analysis & knowledge',
    'operations-learning': 'Operations & learning',
};

function hub() {
    return Object.entries(familyNames).map(([family, label]) => {
        const cards = manifest.filter((entry) => entry.family === family).map((entry) => {
            const tag = entry.status === 'live' ? 'a' : 'article';
            const href = entry.status === 'live' ? ` href="${entry.page}"` : '';
            return `        <${tag} class="profession-card profession-card--${entry.status}"${href} data-profession="${entry.slug}" data-status="${entry.status}"><span class="pill ${entry.status === 'live' ? 'pill--on' : ''}">${entry.status}</span><h3>${escape(entry.title)}</h3><p>${escape(entry.tileLine)}.</p>${entry.status === 'soon' ? '<small>Watch the open-hint-dev organization for the release.</small>' : '<small>Open the profession guide →</small>'}</${tag}>`;
        }).join('\n');
        return `    <section class="profession-family" data-family="${family}"><h2>${label}</h2><div class="profession-family__grid">\n${cards}\n      </div></section>`;
    }).join('\n');
}

function hubPage() {
    const jsonLd = [
        {'@context':'https://schema.org','@type':'CollectionPage',name:'HINT profession guides',url:'https://openhint.dev/professions.html',description:'Choose your profession and give your AI assistant the rules, evidence and vocabulary that apply to your work.'},
        {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:'https://openhint.dev/'},{'@type':'ListItem',position:2,name:'Professions',item:'https://openhint.dev/professions.html'}]},
    ];
    return `<!DOCTYPE html>
<html lang="en" data-accent="delivery">
<head>
${head({title:'HINT profession guides — find your work',description:'Choose your profession and give your AI assistant the rules, evidence and vocabulary that apply to your work.',canonical:'https://openhint.dev/professions.html',jsonLd})}
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
${nav('professions')}
<noscript><style>.reveal{opacity:1!important;transform:none!important}</style></noscript>
<main id="content">
  <header class="section section--tight"><div class="wrap"><nav class="crumb" aria-label="Breadcrumb"><a href="index.html">Home</a> / Professions</nav><p class="eyebrow">Profession guides</p><h1 class="display">Which profession are you?</h1><p class="lede profession-thesis">Pick the work you do. Each guide shows how your AI assistant can follow its vocabulary, evidence and non-negotiable rules.</p></div></header>
  <section class="section divider"><div class="wrap">
    <!-- profession-hub:begin -->
${hub()}
    <!-- profession-hub:end -->
  </div></section>
  <section class="section divider"><div class="wrap"><aside class="handoff"><p class="eyebrow">Start without learning a command</p><h2>Ask your AI assistant to set it up</h2><p>Pick your profession above, then copy the message on its page. Your assistant will run <code class="inl">npx -y @openhint/cli bootstrap</code>, follow the printed instructions and install the right vocabulary. <a href="https://github.com/open-hint-dev/hint/blob/main/docs/integrations.md" target="_blank" rel="noopener">Which assistants can do this?</a></p><a class="btn btn--primary" href="for-business-analysts.html#handoff-title">See an example guide</a></aside></div></section>
</main>
${footer(manifest)}
${script()}
</body>
</html>
`;
}

function sitemap() {
    const urls = [
        {loc:'https://openhint.dev/', priority:'1.0', lastmod:'2026-08-21'},
        {loc:'https://openhint.dev/professions.html', priority:'0.9', lastmod:'2026-08-21'},
        ...manifest.filter(({status}) => status === 'live').map((entry) => ({loc:`https://openhint.dev/${entry.page}`, priority:'0.8', lastmod:entry.addedOn})),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({loc,priority,lastmod}) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
}

replace('index.html', 'professions', home());
const hubPath = Path.join(ROOT, 'professions.html');
const hubBuilt = hubPage();
const hubExisting = Fs.readFileSync(hubPath, 'utf8');
if (checking && hubExisting !== hubBuilt) {
    console.error('::error::professions.html has drifted from the manifest');
    process.exitCode = 1;
} else if (!checking && hubExisting !== hubBuilt) {
    Fs.writeFileSync(hubPath, hubBuilt);
}

function replaceShared(file, pattern, built, label) {
    const path = Path.join(ROOT, file);
    const source = Fs.readFileSync(path, 'utf8');
    if (!pattern.test(source)) throw new Error(`${file}: missing ${label}`);
    const output = source.replace(pattern, built);
    if (checking && source !== output) {
        console.error(`::error::${file} generated ${label} has drifted`);
        process.exitCode = 1;
    } else if (!checking && source !== output) Fs.writeFileSync(path, output);
}

replaceShared('index.html', /(?:<!-- shared-nav:begin -->[\s\S]*?<!-- shared-nav:end -->|<nav class="nav">[\s\S]*?<\/nav>)/, nav(''), 'navigation');
replaceShared('index.html', /(?:<!-- shared-footer:begin -->[\s\S]*?<!-- shared-footer:end -->|<footer class="footer">[\s\S]*?<\/footer>)/, footer(manifest), 'footer');
const sitemapPath = Path.join(ROOT, 'sitemap.xml');
const sitemapBuilt = sitemap();
const sitemapExisting = Fs.readFileSync(sitemapPath, 'utf8');
if (checking && sitemapExisting !== sitemapBuilt) {
    console.error('::error::sitemap.xml has drifted from professions.json');
    process.exitCode = 1;
} else if (!checking && sitemapExisting !== sitemapBuilt) {
    Fs.writeFileSync(sitemapPath, sitemapBuilt);
}

if (!process.exitCode) console.log(`Profession lists are ${checking ? 'current' : 'generated'} for ${manifest.length} manifest entries.`);
