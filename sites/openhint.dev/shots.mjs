// Dependency-free visual QA for the static site. Each capture uses a neutral wrapper with an
// iframe pinned to the exact review width, making overflow beyond 1440 px or 390 px visible.
import * as Fs from 'node:fs';
import * as Http from 'node:http';
import * as Path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = import.meta.dirname;
const OUTPUT = Path.join(ROOT, 'shots');
const pages = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const targets = pages.length ? pages : ['index.html', 'professions.html', 'for-lawyers.html', 'for-qa-engineers.html', 'for-marketing-and-brand.html', 'for-clinical-operations.html'];
const widths = [1440, 390];
const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean);
const chrome = candidates.find((candidate) => Fs.existsSync(candidate));
if (!chrome) throw new Error('Chrome or Chromium was not found. Set CHROME_BIN to run visual QA.');
Fs.mkdirSync(OUTPUT, {recursive:true});

const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const server = Http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/__shot') {
        const page = url.searchParams.get('page');
        const width = Number(url.searchParams.get('width'));
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:#d9dce2}iframe{display:block;width:${width}px;height:1500px;margin-left:20px;border:0;background:white}</style><iframe id="page" sandbox="allow-scripts allow-same-origin" scrolling="no" src="/${encodeURI(page)}?shot=${Date.now()}" title="${page} at ${width}px"></iframe><script>scrollTo(0,0);page.addEventListener('load',()=>{let passes=0;const reset=setInterval(()=>{page.contentWindow.scrollTo(0,0);scrollTo(0,0);if(++passes===100)clearInterval(reset)},20)})<\/script>`);
        return;
    }
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = Path.resolve(ROOT, `.${requested}`);
    if (!file.startsWith(`${ROOT}${Path.sep}`) || !Fs.existsSync(file) || Fs.statSync(file).isDirectory()) { response.writeHead(404).end('Not found'); return; }
    response.setHeader('content-type', types[Path.extname(file)] ?? 'application/octet-stream');
    response.end(Fs.readFileSync(file));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const {port} = server.address();

function capture(page, width) {
    const output = Path.join(OUTPUT, `${page.replace(/\.html$/, '')}-${width}.png`);
    const url = `http://127.0.0.1:${port}/__shot?page=${encodeURIComponent(page)}&width=${width}`;
    const args = ['--headless=new', '--incognito', '--disable-gpu', '--hide-scrollbars', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=2500', `--window-size=${width + 40},1500`, `--screenshot=${output}`, url];
    return new Promise((resolve, reject) => {
        const child = spawn(chrome, args, {stdio:['ignore','ignore','pipe']});
        let error = '';
        child.stderr.on('data', (chunk) => { error += chunk; });
        child.on('error', reject);
        child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`Chrome exited ${code}: ${error.trim()}`)));
    });
}

try {
    for (const page of targets) {
        if (!Fs.existsSync(Path.join(ROOT, page))) throw new Error(`Unknown page: ${page}`);
        for (const width of widths) console.log(Path.relative(ROOT, await capture(page, width)));
    }
} finally {
    await new Promise((resolve) => server.close(resolve));
}
