import * as Fs from 'node:fs';
import * as Path from 'node:path';
import { escapeHtml as e, footer, head, nav, script } from './site-components.mjs';

const ROOT = import.meta.dirname;
const manifest = JSON.parse(Fs.readFileSync(Path.join(ROOT, 'professions.json'), 'utf8'));
const checking = process.argv.includes('--check');

function inline(value) {
    return e(value).replace(/`([^`]+)`/g, '<code class="inl">$1</code>');
}

function copyMessage(entry, content) {
    return `Set up HINT in this folder for ${content.profession} work. Run \`npx -y @openhint/cli bootstrap\` and follow exactly what it prints; when it asks which hintbook to use, choose \`${entry.package}\`. When you are done, show me what you created, and write my first \`.hint\` file for ${content.artifact} so I can see how it reads. If you cannot run commands, say so and show me the manual steps from https://openhint.dev/${entry.page}#manual.`;
}

function handoff(entry, content, closing = false) {
    const message = copyMessage(entry, content);
    const demo = `Open https://github.com/open-hint-dev/${entry.demoRepo} and walk me through its README scenario 1 in this chat.`;
    if (closing) return `<div class="handoff handoff--closing"><h2>Ready to try it?</h2><p>Give one message to the assistant already working with your documents.</p><button class="btn btn--primary" type="button" data-copy data-copy-text="${e(message)}" aria-label="Copy the setup message for your AI assistant">Copy the message for your AI</button><span class="copy-status" aria-live="polite"></span></div>`;
    return `<aside class="handoff" aria-labelledby="handoff-title">
      <p class="eyebrow">No technical setup required from you</p>
      <h2 id="handoff-title">Ask your AI assistant to set it up</h2>
      <p>You need a folder with your documents and an AI assistant that can run commands in it: Claude Code, Cursor, Codex, GitHub Copilot, or OpenCode. <a href="https://github.com/open-hint-dev/hint/blob/main/docs/integrations.md" target="_blank" rel="noopener">Which assistants can do this?</a></p>
      <div class="handoff__actions"><button class="btn btn--primary" type="button" data-copy data-copy-text="${e(message)}" aria-label="Copy the setup message for your AI assistant">Copy the message for your AI</button><button class="btn btn--ghost" type="button" data-copy data-copy-text="${e(demo)}" aria-label="Copy the demo message for your AI assistant">Ask your AI to show you the demo</button><span class="copy-status" aria-live="polite"></span></div>
      <dl class="handoff__steps"><div><dt>What will happen</dt><dd>The assistant creates <code class="inl">hint.yml</code>, installs the vocabulary, and tells itself how to use it. Nothing in your documents changes.</dd></div><div><dt>What you do next</dt><dd>Write rules in plain Markdown beside your documents. Your assistant reads the ones that apply before it works.</dd></div><div><dt>If you have no such assistant</dt><dd>Send this page to a technical colleague, or use the <a href="#manual">manual steps</a>.</dd></div></dl>
    </aside>`;
}

function jsonLd(entry, content) {
    const url = `https://openhint.dev/${entry.page}`;
    return [
        {'@context':'https://schema.org','@type':'SoftwareApplication',name:`HINT for ${entry.title}`,applicationCategory:'DeveloperApplication',operatingSystem:'Cross-platform',url,description:content.metaDescription,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}},
        {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:'https://openhint.dev/'},{'@type':'ListItem',position:2,name:'Professions',item:'https://openhint.dev/professions.html'},{'@type':'ListItem',position:3,name:entry.title,item:url}]},
        {'@context':'https://schema.org','@type':'FAQPage',mainEntity:content.faq.map(({q,a}) => ({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))},
    ];
}

function render(entry, content) {
    const related = entry.related.map((slug) => manifest.find((candidate) => candidate.slug === slug));
    const keywordRows = entry.keywords.map((keyword) => `<div class="kwrow"><dt><code>${e(keyword)}</code></dt><dd>${e(content.keywordDescriptions[keyword])}</dd></div>`).join('');
    const situations = content.situations.map(({before,after,body}) => `<article class="situation"><p class="situation__before">Before: ${e(before)}</p><h3>${e(after)}</h3><p>${e(body)}</p></article>`).join('');
    const faq = content.faq.map(({q,a}) => `<details class="faq"><summary>${e(q)}</summary><p>${inline(a)}</p></details>`).join('');
    const never = content.never.map((item) => `<li>${e(item)}</li>`).join('');
    const example = content.example.lines.join('\n');
    const commands = ['npm install -g @openhint/cli','hint config',`hint add ${entry.package}`,'hint apply'];
    if (content.technical.verify) commands.push(`hint verify ${content.example.path.replace(/\.hint$/, '')}`);
    if (content.technical.emit) commands.push(`hint emit ${content.example.path.replace(/\.hint$/, '')}`);
    const works = content.technical.worksWith.map((slug) => manifest.find((candidate) => candidate.slug === slug)).filter(Boolean);
    const packageNote = entry.title !== content.packageRole ? `<p class="package-note">The package is named for the role: <code class="inl">${e(entry.package)}</code>.</p>` : '';
    return `<!DOCTYPE html>
<html lang="en" data-accent="${e(entry.accent)}">
<head>
${head({title:content.title,description:content.metaDescription,canonical:`https://openhint.dev/${entry.page}`,image:entry.accent,jsonLd:jsonLd(entry,content)})}
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
${nav('professions')}
<noscript><style>.reveal{opacity:1!important;transform:none!important}</style></noscript>
<main id="content">
  <header class="profession-hero"><div class="wrap"><nav class="crumb" aria-label="Breadcrumb"><a href="index.html">Home</a> / <a href="professions.html">Professions</a> / ${e(entry.title)}</nav><p class="eyebrow">HINT for ${e(entry.title)}</p><h1>${e(content.h1)}</h1><p class="lede">${e(content.intro)}</p>${packageNote}${handoff(entry,content)}</div></header>
  <section class="section divider" aria-labelledby="situations-title"><div class="wrap"><p class="eyebrow">Where it helps</p><h2 id="situations-title">Three situations your team will recognize</h2><div class="situation-grid">${situations}</div></div></section>
  <section class="section divider example" aria-labelledby="example-title"><div class="wrap"><p class="eyebrow">See it</p><h2 id="example-title">A real ${e(content.artifact)} from the demo</h2><p>${e(content.example.intro)}</p><div class="example__grid"><div><p class="demo__src"><a href="https://github.com/open-hint-dev/${entry.demoRepo}/blob/main/${e(content.example.path)}" target="_blank" rel="noopener">${e(entry.demoRepo)}/${e(content.example.path)} ↗</a></p><pre class="code"><code>${e(example)}</code></pre></div><div class="example__result"><h3>What your assistant does next</h3><p>${e(content.example.after)}</p><details><summary>What your AI assistant receives</summary><pre class="compiled"><code>${e(content.example.compiled)}</code></pre></details></div></div></div></section>
  <section class="section divider trust" aria-labelledby="trust-title"><div class="wrap trust__grid"><div><p class="eyebrow">Your boundaries stay visible</p><h2 id="trust-title">What it will never do</h2><ul>${never}</ul></div><aside class="disclaimer"><h3>Important boundary</h3><p>${e(content.disclaimer)}</p></aside></div></section>
  <section class="section divider" aria-labelledby="faq-title"><div class="wrap faq-layout"><div><p class="eyebrow">FAQ</p><h2 id="faq-title">Questions ${e(entry.plural.toLowerCase())} ask</h2></div><div>${faq}</div></div></section>
  <section class="section divider"><div class="wrap"><details class="technical"><summary>For your technical colleague</summary><div class="technical__body"><section><h2>The vocabulary</h2><p>A <em>hintbook</em> is a vocabulary for your profession—installed, not written by you.</p><dl class="keyword-list">${keywordRows}</dl></section><section id="manual"><h2>Manual setup</h2><p>Bootstrap is read-only: it prints instructions for the assistant. The assistant performs the installation.</p><pre class="code"><code>${e(commands.join('\n'))}</code></pre><p><a href="https://github.com/open-hint-dev/${entry.bookRepo}" target="_blank" rel="noopener">Hintbook repository ↗</a> · <a href="https://github.com/open-hint-dev/${entry.demoRepo}" target="_blank" rel="noopener">Demo repository ↗</a></p></section>${works.length ? `<section><h2>Works with</h2><ul>${works.map((item) => `<li><a href="${item.page}">${e(item.title)}</a></li>`).join('')}</ul></section>` : ''}</div></details></div></section>
  <section class="section divider"><div class="wrap related"><p class="eyebrow">Related professions</p><div class="related__links">${related.map((item) => `<a class="card" href="${item.page}"><h2>${e(item.title)}</h2><p>${e(item.tileLine)}</p></a>`).join('')}</div>${handoff(entry,content,true)}</div></section>
  <section class="section section--tight divider" aria-label="Measured results"><div class="wrap"><div class="numbers"><a class="number" href="https://github.com/open-hint-dev/hint/blob/main/docs/09-benchmarks.md"><strong>185 ms</strong><span>to answer across 10,000 files</span></a><a class="number" href="https://github.com/open-hint-dev/hint/blob/main/docs/09-benchmarks.md"><strong>100%</strong><span>of 65 test queries found the right spec</span></a><a class="number" href="https://github.com/open-hint-dev/hint/blob/main/docs/09-benchmarks.md"><strong>3.25× less</strong><span>context per measured task</span></a></div></div></section>
</main>
${footer(manifest)}
${script()}
</body>
</html>
`;
}

let changed = 0;
for (const entry of manifest.filter(({status}) => status === 'live')) {
    const contentPath = Path.join(ROOT, 'professions', `${entry.slug}.json`);
    if (!Fs.existsSync(contentPath)) throw new Error(`Missing content file: ${contentPath}`);
    const content = JSON.parse(Fs.readFileSync(contentPath, 'utf8'));
    const built = render(entry, content);
    const outputPath = Path.join(ROOT, entry.page);
    const current = Fs.existsSync(outputPath) ? Fs.readFileSync(outputPath, 'utf8') : '';
    if (current !== built) {
        changed += 1;
        if (checking) console.error(`::error::${entry.page} has drifted from ${entry.slug}.json`);
        else Fs.writeFileSync(outputPath, built);
    }
}

if (checking && changed) process.exit(1);
console.log(`${manifest.filter(({status}) => status === 'live').length} profession pages are ${checking ? 'current' : 'generated'} from content files.`);
