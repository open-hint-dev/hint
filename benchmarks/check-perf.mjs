import * as Fs from 'node:fs';
import * as Path from 'node:path';

const root = Path.resolve(import.meta.dirname, '..');
const thresholds = JSON.parse(Fs.readFileSync(Path.join(root, 'benchmarks/perf/thresholds.json'), 'utf8'));
const report = JSON.parse(Fs.readFileSync(Path.join(root, `benchmarks/results/${thresholds.baseline_version}/perf.json`), 'utf8'));
const nodeMajor = Number(String(report.runner.node).match(/\d+/)?.[0]);
if (!report.runner.os.startsWith(thresholds.runner.os_prefix) || report.runner.arch !== thresholds.runner.arch || nodeMajor !== thresholds.runner.node_major) {
    console.log('performance regression comparison skipped: this runner has no reviewed baseline.');
    process.exit(0);
}
const results = report.results;
for (const [key, maximum] of Object.entries(thresholds.maximum_p95_ms)) {
    const [size, operation] = key.split('.');
    const value = results[size][operation].p95_ms;
    if (value > maximum) throw new Error(`${key} p95 ${value} ms exceeds the 25% regression ceiling ${maximum} ms`);
}
console.log('performance p95 values stay within the 1.5.0 +25% ceilings.');
