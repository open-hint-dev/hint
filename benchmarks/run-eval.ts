import * as Fs from 'node:fs/promises';
import * as Path from 'node:path';

import { searchHints } from '../packages/transpiler/index.js';

const root = Path.resolve(import.meta.dirname, '..');
const version = process.env.BENCH_VERSION ?? '1.5.0';
const casesPath = Path.join(root, 'benchmarks/retrieval/cases/core.jsonl');
const fixture = Path.join(root, 'benchmarks/retrieval/fixture');
const cases = (await Fs.readFile(casesPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { query: string; expected: string[]; notes?: string });
let p1 = 0, p3 = 0, r5 = 0, reciprocal = 0, weakCorrect = 0;
for (const test of cases) {
    const results = await searchHints(fixture, test.query, { limit: 5 });
    const ranked = results.map((result) => result.target);
    if (test.expected.length === 0) {
        if (results.length === 0 || results.every((result) => result.weak)) weakCorrect += 1;
        continue;
    }
    if (test.expected.includes(ranked[0]!)) p1 += 1;
    if (ranked.slice(0, 3).some((target) => test.expected.includes(target))) p3 += 1;
    r5 += test.expected.filter((target) => ranked.slice(0, 5).includes(target)).length / test.expected.length;
    const rank = ranked.findIndex((target) => test.expected.includes(target));
    if (rank >= 0) reciprocal += 1 / (rank + 1);
}
const nonEmpty = cases.filter((test) => test.expected.length > 0).length;
const empty = cases.length - nonEmpty;
const metrics = {
    cases: cases.length,
    non_latin_cases: cases.filter((test) => /[^\x00-\x7F]/.test(test.query)).length,
    precision_at_1: p1 / nonEmpty,
    precision_at_3: p3 / nonEmpty,
    recall_at_5: r5 / nonEmpty,
    mrr: reciprocal / nonEmpty,
    weak_flag_precision: empty ? weakCorrect / empty : 1,
};
const thresholds = JSON.parse(await Fs.readFile(Path.join(root, 'benchmarks/retrieval/thresholds.json'), 'utf8')) as Record<string, number>;
for (const [metric, minimum] of Object.entries(thresholds)) {
    if ((metrics[metric as keyof typeof metrics] as number) < minimum) throw new Error(`${metric} fell below ${minimum}`);
}
const output = Path.join(root, 'benchmarks/results', version);
await Fs.mkdir(output, { recursive: true });
await Fs.writeFile(Path.join(output, 'retrieval.json'), `${JSON.stringify({ version, command: 'make eval', fixture: 'benchmarks/retrieval/fixture', metrics }, null, 2)}\n`);
await Fs.writeFile(Path.join(output, 'retrieval.md'), `| cases | P@1 | P@3 | R@5 | MRR | weak precision |\n| ---: | ---: | ---: | ---: | ---: | ---: |\n| ${metrics.cases} | ${metrics.precision_at_1.toFixed(3)} | ${metrics.precision_at_3.toFixed(3)} | ${metrics.recall_at_5.toFixed(3)} | ${metrics.mrr.toFixed(3)} | ${metrics.weak_flag_precision.toFixed(3)} |\n`);
process.stdout.write(`eval: ${JSON.stringify(metrics)}\n`);
