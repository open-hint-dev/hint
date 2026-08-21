const VERSION = '1.5';
const ASSET_VERSION = '1.7.0-site-quality';

export function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function nav(active = '') {
    const activeClass = (name) => active === name ? ' nav__link--active' : '';
    const activeAttr = (name) => active === name ? ' aria-current="page"' : '';
    return `<!-- shared-nav:begin -->
<nav class="nav" aria-label="Main navigation">
  <div class="wrap nav__inner">
    <a class="logo" href="index.html" aria-label="HINT home"><img class="logo__img" src="assets/logo-full.svg" alt="" width="147" height="46" /></a>
    <div class="nav__links">
      <a class="nav__link${activeClass('how')}" href="index.html#how"${activeAttr('how')}>How it works</a>
      <a class="nav__link${activeClass('professions')}" href="professions.html"${activeAttr('professions')}>Professions</a>
      <a class="nav__link" href="https://github.com/open-hint-dev/hint/tree/main/docs" target="_blank" rel="noopener">Docs</a>
      <a class="nav__link" href="https://github.com/open-hint-dev/hint" target="_blank" rel="noopener">GitHub</a>
      <a class="btn btn--primary nav__primary" href="index.html#quickstart">Get started</a>
    </div>
    <button class="nav__menu-btn" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open navigation"><span></span><span></span><span></span></button>
  </div>
</nav>
<div class="mobile-menu" id="mobile-menu" aria-hidden="true">
  <a href="index.html#how">How it works</a><a href="professions.html">Professions</a><a href="https://github.com/open-hint-dev/hint/tree/main/docs">Docs</a><a href="https://github.com/open-hint-dev/hint">GitHub</a><a href="index.html#quickstart">Get started</a>
</div>
<!-- shared-nav:end -->`;
}

export function footer(manifest) {
    const professionLinks = manifest.filter(({status}) => status === 'live')
        .map((entry) => `<li><a href="${entry.page}">${escapeHtml(entry.title)}</a></li>`).join('');
    return `<!-- shared-footer:begin -->
<footer class="footer">
  <div class="wrap">
    <div class="footer__grid">
      <div class="footer__brand footer__col"><div class="logo footer__logo"><img class="logo__img" src="assets/logo-full.svg" alt="HINT" width="147" height="46" /></div><p>Durable project knowledge, kept beside the work and delivered to your assistant when it applies.</p></div>
      <div class="footer__col"><h2>Product</h2><ul><li><a href="index.html#how">How it works</a></li><li><a href="index.html#quickstart">Quick start</a></li><li><a href="https://github.com/open-hint-dev/hint/blob/main/docs/integrations.md" target="_blank" rel="noopener">Assistant setup ↗</a></li></ul></div>
      <div class="footer__col footer__professions"><h2>Professions</h2><ul>${professionLinks}<li><a href="professions.html">All professions</a></li></ul></div>
      <div class="footer__col"><h2>Source</h2><ul><li><a href="https://github.com/open-hint-dev/hint" target="_blank" rel="noopener">HINT ↗</a></li><li><a href="https://github.com/open-hint-dev/hintbook-template" target="_blank" rel="noopener">Build a hintbook ↗</a></li><li><a href="https://www.npmjs.com/org/openhint" target="_blank" rel="noopener">npm packages ↗</a></li></ul></div>
    </div>
    <div class="footer__bottom"><span>© 2026 openhint.dev · MIT licensed</span><span>HINT ${VERSION} · Tell your assistant what matters here.</span></div>
  </div>
</footer>
<!-- shared-footer:end -->`;
}

export function head({title, description, canonical, image = 'delivery', jsonLd}) {
    return `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="https://openhint.dev/assets/og/${image}.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="alternate" type="text/plain" href="llms.txt" title="LLM-readable site summary" />
<link rel="icon" type="image/png" href="favicon.png" />
<link rel="apple-touch-icon" href="favicon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&amp;family=Hanken+Grotesk:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500;600;700&amp;display=swap" />
<link rel="stylesheet" href="styles.css?v=${ASSET_VERSION}" />
<script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll('<', '\\u003c')}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-9KTEZLFTRE"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-9KTEZLFTRE');</script>`;
}

export function script() {
    return `<script src="site.js?v=${ASSET_VERSION}"></script>`;
}

export { ASSET_VERSION, VERSION };
