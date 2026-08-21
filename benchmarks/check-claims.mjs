import * as Fs from 'node:fs';
import * as Path from 'node:path';

const root = Path.resolve(import.meta.dirname, '..');
const results = Path.join(root, 'benchmarks/results/1.5.0');
const perf = JSON.parse(Fs.readFileSync(Path.join(results, 'perf.json'), 'utf8'));
const context = JSON.parse(Fs.readFileSync(Path.join(results, 'context.json'), 'utf8'));
const retrieval = JSON.parse(Fs.readFileSync(Path.join(results, 'retrieval.json'), 'utf8'));
const determinism = JSON.parse(Fs.readFileSync(Path.join(results, 'determinism.json'), 'utf8'));
const number = (value, digits = 2) => Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const integer = (value) => Number(value).toLocaleString('en-US');
const demo = context.results.find((item) => item.fixture.endsWith('demo-pied-piper'));
const claims = [
    number(perf.results['1000'].compile.p50_ms), number(perf.results['1000'].compile.p95_ms),
    number(perf.results['10000'].compile.p50_ms), number(perf.results['10000'].compile.p95_ms),
    number(perf.results['10000'].search.p50_ms), number(perf.results['10000'].search.p95_ms),
    number(perf.results['10000'].status.p50_ms), String(perf.results['10000'].status.git_processes),
    integer(demo.median_task_tokens), integer(demo.baseline_tokens), `${demo.ratio}`,
    retrieval.metrics.precision_at_1.toFixed(3), retrieval.metrics.mrr.toFixed(3), String(retrieval.metrics.cases), String(retrieval.metrics.non_latin_cases),
    String(determinism.files), determinism.sha256.slice(0, 12), integer(perf.footprint.package_bytes), String(perf.footprint.runtime_dependencies), String(perf.footprint.native_modules),
];

const files = [
    'README.md', 'docs/09-benchmarks.md', 'applications/cli/README.md', 'packages/transpiler/README.md',
    'sites/openhint.dev/index.html', 'sites/openhint.dev/for-software-engineers.html', 'sites/openhint.dev/for-knowledge-librarians.html',
];
const combined = files.map((file) => Fs.readFileSync(Path.join(root, file), 'utf8')).join('\n');
for (const claim of claims) {
    if (!combined.includes(claim)) throw new Error(`benchmark claim '${claim}' is absent from published surfaces`);
}
for (const file of files) {
    const text = Fs.readFileSync(Path.join(root, file), 'utf8');
    if (text.match(/(?:By the numbers|Measured engineering results|Measured knowledge results)/) && !text.includes('09-benchmarks')) {
        throw new Error(`${file} publishes figures without a methodology link`);
    }
}
const readme = Fs.readFileSync(Path.join(root, 'README.md'), 'utf8');
const section = readme.split('## By the numbers\n')[1]?.split('\n## ')[0]?.trim().split('\n') ?? [];
if (section.length > 24) throw new Error(`README By the numbers section is ${section.length + 1} lines; maximum is 25`);
console.log(`benchmark claims checked against ${Path.relative(root, results)} (${claims.length} generated values).`);
