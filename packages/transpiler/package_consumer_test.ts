/// <reference types="node" />
/// <reference types="vitest/globals" />

import { execSync } from 'node:child_process';
import type { ExecSyncOptions } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const transpilerDir = resolve(dirname(fileURLToPath(import.meta.url)));
const monorepoRoot = resolve(transpilerDir, '..', '..');
const releaseDir = join(monorepoRoot, 'release', '@openhint', 'transpiler');
const archivesDir = join(monorepoRoot, 'release', 'archives');
const workspaceTsc = join(monorepoRoot, 'node_modules', '.bin', 'tsc');

function run(command: string, options?: ExecSyncOptions): string {
    try {
        return execSync(command, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            ...options,
        }).trim();
    } catch (error: unknown) {
        const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
        throw new Error(
            `Command failed: ${command}\nstdout: ${String(err.stdout ?? '')}\nstderr: ${String(err.stderr ?? '')}`,
        );
    }
}

export async function createConsumerProject(tarballPath: string): Promise<string> {
    const tmpDir = mkdtempSync(join(tmpdir(), 'openhint-consumer-'));
    try {
        writeFileSync(
            join(tmpDir, 'package.json'),
            JSON.stringify({ name: 'consumer-test', version: '1.0.0', private: true, type: 'module' }),
        );
        run(`npm install --ignore-scripts "${tarballPath}"`, { cwd: tmpDir });
        return tmpDir;
    } catch (error) {
        rmSync(tmpDir, { recursive: true, force: true });
        throw error;
    }
}

describe('packedConsumer', () => {
    let tarballPath: string;
    const tempProjects: string[] = [];

    beforeAll(() => {
        run(`make -f "${join(transpilerDir, 'makefile')}" build`, { cwd: transpilerDir });
        const packOutput = run(
            `npm pack "${releaseDir}" --pack-destination "${archivesDir}" --json`,
        );
        const packed = JSON.parse(packOutput) as Array<{ filename: string }>;
        const filename = packed[0]?.filename;
        if (filename === undefined) {
            throw new Error('npm pack produced no output');
        }
        tarballPath = join(archivesDir, filename);
    }, 180_000);

    afterAll(() => {
        for (const tmpDir of tempProjects) {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('runtime root import: imports resolve and normalizeDirective("model") returns "entity"', async () => {
        const tmpDir = await createConsumerProject(tarballPath);
        tempProjects.push(tmpDir);

        const script = `
import { parse, compile, ErrorCode, normalizeDirective } from '@openhint/transpiler';
if (typeof parse !== 'function') throw new Error('parse is not a function');
if (typeof compile !== 'function') throw new Error('compile is not a function');
if (!ErrorCode || typeof ErrorCode.IO_ERROR !== 'string') throw new Error('ErrorCode.IO_ERROR missing');
const directive = normalizeDirective('model');
if (directive !== 'entity') throw new Error('normalizeDirective("model") expected "entity", got: ' + directive);
console.log('OK');
`;
        writeFileSync(join(tmpDir, 'check.mjs'), script);

        const result = run(`node --no-deprecation check.mjs 2>&1; node check.mjs 2>&1`, { cwd: tmpDir });
        expect(result).not.toMatch(/DeprecationWarning.*main/i);
        expect(result).toContain('OK');
    }, 30_000);

    it('runtime keyword subpath: all canonical directives are registered', async () => {
        const tmpDir = await createConsumerProject(tarballPath);
        tempProjects.push(tmpDir);

        const canonicalDirectives = [
            'read', 'lang', 'deps', 'build',
            'app', 'lib', 'namespace', 'module', 'res', 'rule',
            'entity', 'function', 'ui', 'action',
            'good', 'bad', 'example', 'test', 'notes',
        ];
        const script = `
import { keywordRegistry } from '@openhint/transpiler/keywords';
const directives = ${JSON.stringify(canonicalDirectives)};
for (const d of directives) {
    if (!keywordRegistry.has(d)) throw new Error('Missing keyword directive: ' + d);
}
console.log('OK');
`;
        writeFileSync(join(tmpDir, 'check.mjs'), script);
        const output = run(`node check.mjs`, { cwd: tmpDir });
        expect(output).toContain('OK');
    }, 30_000);

    it('TypeScript NodeNext consumer type-checks without TS2834 or TS2835', async () => {
        const tmpDir = await createConsumerProject(tarballPath);
        tempProjects.push(tmpDir);

        writeFileSync(
            join(tmpDir, 'tsconfig.json'),
            JSON.stringify({
                compilerOptions: {
                    module: 'NodeNext',
                    moduleResolution: 'NodeNext',
                    strict: true,
                    noEmit: true,
                },
                include: ['consumer.ts'],
            }),
        );

        const consumer = `
import { parse, compile, normalizeDirective } from '@openhint/transpiler';
import type { AppError, ParseResult, CompilerInput } from '@openhint/transpiler';
import { keywordRegistry, directives } from '@openhint/transpiler/keywords';
import type { KeywordDefinition, KeywordInput, MergePolicy, NamePolicy } from '@openhint/transpiler/keywords';

const _parse: typeof parse = parse;
const _compile: typeof compile = compile;
const _nd: typeof normalizeDirective = normalizeDirective;
const _registry: typeof keywordRegistry = keywordRegistry;
const _directives: typeof directives = directives;

type _AppError = AppError;
type _ParseResult = ParseResult;
type _CompilerInput = CompilerInput;
type _KeywordDefinition = KeywordDefinition;
type _KeywordInput = KeywordInput;
type _MergePolicy = MergePolicy;
type _NamePolicy = NamePolicy;

export { _parse, _compile, _nd, _registry, _directives };
`;
        writeFileSync(join(tmpDir, 'consumer.ts'), consumer);

        const output = run(`"${workspaceTsc}" --noEmit`, { cwd: tmpDir });
        expect(output).not.toMatch(/TS2834|TS2835/);
    }, 60_000);

    it('packed tarball includes required files and excludes source', () => {
        const packOutput = run(
            `npm pack "${releaseDir}" --dry-run --json`,
        );
        const result = JSON.parse(packOutput) as Array<{ files: Array<{ path: string }> }>;
        const files = (result[0]?.files ?? []).map((f) => f.path);

        expect(files.some((f) => /^README\.md$/i.test(f))).toBe(true);
        expect(files.some((f) => /^LICENSE$/i.test(f))).toBe(true);
        expect(files.some((f) => /^package\.json$/.test(f))).toBe(true);
        expect(files.some((f) => /^index\.js$/.test(f))).toBe(true);
        expect(files.some((f) => /^index\.d\.ts$/.test(f))).toBe(true);
        expect(files.some((f) => /^keywords[/\\]index\.js$/.test(f))).toBe(true);
        expect(files.some((f) => /^keywords[/\\]index\.d\.ts$/.test(f))).toBe(true);

        expect(files.some((f) => /\.ts$/.test(f) && !/\.d\.ts/.test(f))).toBe(false);
        expect(files.some((f) => /_test/.test(f))).toBe(false);
        expect(files.some((f) => /\.hint$/.test(f))).toBe(false);
        expect(files.some((f) => /tsconfig/.test(f))).toBe(false);
        expect(files.some((f) => /vite\.config/.test(f))).toBe(false);
        expect(files.some((f) => /makefile/i.test(f))).toBe(false);
    });
});
