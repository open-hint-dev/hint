import { execFile } from 'node:child_process';
import * as Crypto from 'node:crypto';
import * as Fs from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { promisify } from 'node:util';

import { listHintFiles, parseHintFile, parseHintFiles, renderContext } from '../packages/transpiler/index.js';

const exec = promisify(execFile);
const root = Path.resolve(import.meta.dirname, '..');
const version = process.env.BENCH_VERSION ?? '1.5.0';
const output = Path.join(root, 'benchmarks/results', version);
const runs = Number(process.env.BENCH_RUNS ?? 20);

function percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]! * 100) / 100;
}

async function timed<T>(operation: () => Promise<T>, count = runs): Promise<{ p50_ms: number; p95_ms: number; value: T }> {
    const values: number[] = [];
    let value!: T;
    for (let index = 0; index < count; index++) {
        const start = performance.now();
        value = await operation();
        values.push(performance.now() - start);
    }
    return { p50_ms: percentile(values, 0.5), p95_ms: percentile(values, 0.95), value };
}

async function synthetic(size: number): Promise<string> {
    const folder = await Fs.mkdtemp(Path.join(Os.tmpdir(), `hint-bench-${size}-`));
    await Fs.writeFile(Path.join(folder, 'hint.yml'), `name: benchmark-${size}\n`);
    for (let start = 0; start < size; start += 500) {
        await Promise.all(Array.from({ length: Math.min(500, size - start) }, async (_, offset) => {
            const index = start + offset;
            const dir = Path.join(folder, `domain-${index % 20}`, `area-${index % 100}`);
            await Fs.mkdir(dir, { recursive: true });
            await Fs.writeFile(Path.join(dir, `unit-${index}.ts`), `export const unit${index} = ${index};\n`);
            await Fs.writeFile(Path.join(dir, `unit-${index}.ts.hint`), `# decision Unit ${index} {#unit_${index}}\n\nUnit ${index} preserves deterministic account routing and audit records.\n`);
        }));
    }
    await exec('git', ['init', '-q'], { cwd: folder });
    await exec('git', ['config', 'user.name', 'Benchmark'], { cwd: folder });
    await exec('git', ['config', 'user.email', 'benchmark@example.com'], { cwd: folder });
    await exec('git', ['add', '-A'], { cwd: folder });
    await exec('git', ['commit', '-q', '-m', 'seed'], { cwd: folder });
    for (let revision = 1; revision <= 2; revision++) {
        for (let index = 0; index < Math.max(1, Math.floor(size * 0.01)); index++) {
            const dir = Path.join(folder, `domain-${index % 20}`, `area-${index % 100}`);
            await Fs.writeFile(Path.join(dir, `unit-${index}.ts`), `export const unit${index} = ${index + revision};\n`);
        }
        await exec('git', ['add', '-A'], { cwd: folder });
        await exec('git', ['commit', '-q', '-m', `revision ${revision}`], { cwd: folder });
    }
    return folder;
}

function tokens(text: string): number {
    return text.normalize('NFC').match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu)?.length ?? 0;
}

async function contextResult(project: string): Promise<Record<string, unknown>> {
    const candidates = (await listHintFiles(project)).map((path) => Path.join(project, path));
    const hints: string[] = [];
    for (const hint of candidates) {
        try { await parseHintFile(project, hint); hints.push(hint); } catch { /* malformed fixtures are measured by lint, not context cost */ }
    }
    const monolith = renderContext(await parseHintFiles(project, hints), []);
    const sample = hints.slice(0, Math.min(50, hints.length));
    const costs = await Promise.all(sample.map(async (hint) => tokens(renderContext(await parseHintFiles(project, [hint]), []))));
    return {
        fixture: Path.relative(root, project) || '.', tokenizer: 'openhint-unicode-v1', sample_size: sample.length,
        baseline_tokens: tokens(monolith), median_task_tokens: percentile(costs, 0.5), p90_task_tokens: percentile(costs, 0.9),
        ratio: costs.length && percentile(costs, 0.5) ? Math.round(tokens(monolith) / percentile(costs, 0.5) * 100) / 100 : 0,
    };
}

async function main(): Promise<void> {
    await Fs.mkdir(output, { recursive: true });
    await exec('make', ['release'], { cwd: root, env: { ...process.env, VERSION: version }, maxBuffer: 64 * 1024 * 1024 });
    const cli = Path.join(root, 'release/@openhint/cli/index.js');
    const performanceResults: Record<string, unknown> = {};
    for (const size of [100, 1_000, 10_000]) {
        const project = await synthetic(size);
        try {
            const compile = await timed(async () => exec(process.execPath, [cli, 'domain-0/area-0/unit-0.ts'], { cwd: project, maxBuffer: 64 * 1024 * 1024 }));
            const search = await timed(() => exec(process.execPath, [cli, 'search', 'deterministic account routing', '--limit', '20'], { cwd: project, maxBuffer: 64 * 1024 * 1024 }), Math.min(5, runs));
            const trace = Path.join(project, 'git-trace.jsonl');
            process.env.GIT_TRACE2_EVENT = trace;
            const status = await timed(() => exec(process.execPath, [cli, 'status'], { cwd: project, maxBuffer: 64 * 1024 * 1024 }), 1);
            delete process.env.GIT_TRACE2_EVENT;
            const traceText = await Fs.readFile(trace, 'utf8').catch(() => '');
            let peakRss = 0;
            if (process.platform !== 'win32') {
                try {
                    const timeArgs = process.platform === 'darwin' ? ['-l', process.execPath, cli, 'status'] : ['-v', process.execPath, cli, 'status'];
                    const measured = await exec('/usr/bin/time', timeArgs, { cwd: project, maxBuffer: 64 * 1024 * 1024 });
                    const match = process.platform === 'darwin'
                        ? /\s(\d+)\s+maximum resident set size/.exec(measured.stderr)
                        : /Maximum resident set size \(kbytes\):\s*(\d+)/.exec(measured.stderr);
                    peakRss = match ? Number(match[1]) * (process.platform === 'darwin' ? 1 : 1024) : 0;
                } catch { /* RSS stays unavailable on runners without POSIX time. */ }
            }
            performanceResults[String(size)] = {
                hints: size,
                compile: { p50_ms: compile.p50_ms, p95_ms: compile.p95_ms, runs },
                search: { p50_ms: search.p50_ms, p95_ms: search.p95_ms, runs: Math.min(5, runs) },
                status: { p50_ms: status.p50_ms, p95_ms: status.p95_ms, runs: 1, git_processes: traceText.split('\n').filter((line) => line.includes('"event":"start"')).length },
                peak_rss_bytes: peakRss,
            };
        } finally {
            await Fs.rm(project, { recursive: true, force: true });
        }
    }

    const context = [
        await contextResult(Path.join(root, 'benchmarks/context/fixtures/demo-pied-piper')),
        await contextResult(Path.join(root, 'testdata/knowledge-repo')),
    ];
    const determinismCandidates = (await listHintFiles(root)).map((path) => Path.join(root, path));
    const determinismFiles: string[] = [];
    for (const hint of determinismCandidates) {
        try { await parseHintFile(root, hint); determinismFiles.push(hint); } catch { /* deliberately broken parser fixtures are excluded */ }
    }
    const deterministicOutput = renderContext(await parseHintFiles(root, determinismFiles), []);
    const cliPackage = JSON.parse(await Fs.readFile(Path.join(root, 'applications/cli/package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const { stdout: packOutput } = await exec('npm', ['pack', '--dry-run', '--json', './release/@openhint/cli'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    const packed = JSON.parse(packOutput) as { size: number; unpackedSize: number }[];
    const footprint = { package_bytes: packed[0]?.size ?? 0, unpacked_bytes: packed[0]?.unpackedSize ?? 0, runtime_dependencies: Object.keys(cliPackage.dependencies).length, native_modules: 0 };
    const runner = { os: `${Os.platform()} ${Os.release()}`, arch: Os.arch(), cpu: Os.cpus()[0]?.model ?? 'unknown', node: process.version, date: new Date().toISOString().slice(0, 10) };
    await Fs.writeFile(Path.join(output, 'perf.json'), `${JSON.stringify({ version, command: 'make bench', runner, results: performanceResults, footprint }, null, 2)}\n`);
    await Fs.writeFile(Path.join(output, 'context.json'), `${JSON.stringify({ version, command: 'make bench', runner, tokenizer: 'openhint-unicode-v1', results: context }, null, 2)}\n`);
    await Fs.writeFile(Path.join(output, 'determinism.json'), `${JSON.stringify({ version, command: 'make bench', runner, files: determinismFiles.length, sha256: Crypto.createHash('sha256').update(deterministicOutput).digest('hex') }, null, 2)}\n`);
    process.stdout.write(`bench: wrote ${output}\n`);
}

await main();
