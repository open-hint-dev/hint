import * as Fs from 'node:fs';
import * as Path from 'node:path';

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
    const soon = manifest.filter(({ status }) => status === 'soon');
    const liveCards = live.map((entry) => `      <a class="proftile proftile--live" data-profession="${entry.slug}" data-status="live" href="${entry.page}"><div><h4>${escape(entry.title)}</h4><p>${escape(entry.tileLine)}</p></div><span class="proftile__go">Explore →</span></a>`).join('\n');
    const soonCards = soon.map((entry) => `      <div class="soontile" data-profession="${entry.slug}" data-status="soon"><h4>${escape(entry.title)}</h4><p>${escape(entry.tileLine)}</p><span class="soontile__tag">soon</span></div>`).join('\n');
    return `    <div class="profgrid reveal" style="margin-bottom:14px;">\n${liveCards}\n    </div>\n\n    <div class="reveal profession-more"><a class="btn btn--ghost" href="professions.html">All professions →</a></div>\n\n    <div class="soongrid reveal">\n${soonCards}\n      <a class="soontile soontile--author" href="https://github.com/open-hint-dev/hintbook-template"><h4>Your profession</h4><p>Author a hintbook — no code required</p><span class="soontile__tag">open vocabulary</span></a>\n    </div>`;
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
        return `    <section class="profession-family" data-family="${family}"><div class="eyebrow">${label}</div><div class="profession-family__grid">\n${cards}\n      </div></section>`;
    }).join('\n');
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
replace('professions.html', 'profession-hub', hub());
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
