import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import { main } from './main.js';

type Result = {
    stdout: string;
    stderr: string;
    exitCode: number | string | undefined;
};

async function run(args: string[]): Promise<Result> {
    const previousArgv = process.argv;
    const previousExitCode = process.exitCode;

    const stdout: string[] = [];
    const stderr: string[] = [];

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdout.push(String(chunk));
        return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr.push(String(chunk));
        return true;
    });

    process.argv = [
        'node',
        'hint-adapter-typescript',
        ...args,
    ];
    process.exitCode = undefined;

    try {
        await main();

        return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode: process.exitCode };
    } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();

        process.argv = previousArgv;
        process.exitCode = previousExitCode;
    }
}

const roots: string[] = [];

afterAll(async () => {
    for (const root of roots) {
        await FsPromises.rm(root, { recursive: true, force: true });
    }
});

async function withFile(content: string): Promise<string> {
    const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-adapter-'));

    roots.push(root);

    const file = Path.join(root, 'a.ts');

    await FsPromises.writeFile(file, content, 'utf8');

    return file;
}

describe('the adapter contract', () => {
    it('writes the symbol table to stdout and exits 0', async () => {
        const result = await run([await withFile('export function settle(invoice: Invoice): Receipt { return null!; }\n')]);

        expect(result.exitCode).toBeUndefined();
        expect(JSON.parse(result.stdout)).toEqual({
            symbols: [{ kind: 'function', name: 'settle', params: [{ name: 'invoice', type: 'Invoice' }], returns: 'Receipt' }],
        });
    });

    // HINT falls back to its presence lint on any non-zero exit. Reporting an unreadable file as a file
    // with no symbols would instead turn every missing output into a wall of false conformance failures.
    it('exits non-zero with nothing on stdout when the file cannot be read', async () => {
        const result = await run(['/nonexistent/nope.ts']);

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('cannot read');
    });

    it('exits non-zero with usage when given no file', async () => {
        const result = await run([]);

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('hint-adapter-typescript <file>');
    });

    it('prints usage and succeeds for --help', async () => {
        const result = await run(['--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('symbols');
    });

    // A file that declares nothing is a valid answer, and distinct from a file that could not be read.
    it('reports an empty table for a file that declares nothing', async () => {
        const result = await run([await withFile('import "./side-effect.js";\n')]);

        expect(result.exitCode).toBeUndefined();
        expect(JSON.parse(result.stdout)).toEqual({ symbols: [] });
    });

    it('does not fail on a file that would not compile', async () => {
        const result = await run([await withFile('export function broken(a: Missing): Alsomissing {\n')]);

        expect(result.exitCode).toBeUndefined();
        expect(JSON.parse(result.stdout).symbols[0].name).toBe('broken');
    });
});
