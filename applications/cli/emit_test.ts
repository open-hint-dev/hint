import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import { main } from './main.js';

type CliResult = {
    stdout: string;
    stderr: string;
    exitCode: number | string | undefined;
};

async function runCli(args: string[], cwd: string): Promise<CliResult> {
    const previousCwd = process.cwd();
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

    process.chdir(cwd);
    process.argv = [
        'node',
        'hint',
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
        process.chdir(previousCwd);
    }
}

const roots: string[] = [];

async function write(root: string, path: string, content: string): Promise<void> {
    const filePath = Path.join(root, path);

    await FsPromises.mkdir(Path.dirname(filePath), { recursive: true });
    await FsPromises.writeFile(filePath, content, 'utf8');
}

async function makeProject(withEmitter = true): Promise<string> {
    const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-cliemit-'));

    roots.push(root);

    await write(root, 'hint.yml', 'name: temp\nbooks:\n    - file://books\n');
    await write(root, 'books/keywords/hintbook.json', '{"id":"vocab"}');
    await write(root, 'books/keywords/entity.md', '<data_structure>{name}</data_structure>');
    await write(root, 'books/keywords/field.md', '<field>{name}</field>');
    await write(root, 'books/keywords/decision.md', '<decision>{name}</decision>');
    await write(root, 'books/keywords/__folder__.md', '<folder_context path="{name}">{children}</folder_context>');
    await write(root, 'books/keywords/__file__.md', '<file_context path="{name}">{children}</file_context>');

    if (withEmitter) {
        await write(root, 'books/ts/hintbook.json', '{"id":"emit-ts","target":"typescript","match":["*.ts"],"comment":"// {text}"}');
        await write(root, 'books/ts/entity.tmpl', 'export interface {name} {\n    {children:field sep="\\n"}\n}');
        await write(root, 'books/ts/field.tmpl', '{ident}{?: {type}};');
    }

    return root;
}

afterAll(async () => {
    for (const root of roots) {
        await FsPromises.rm(root, { recursive: true, force: true });
    }
});

describe('cli emit', () => {
    it('renders the artifact a spec produces', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n\n## field notes\n');

        const result = await runCli([
            'emit',
            '--stdout',
            'src/invoice.ts',
        ], root);

        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toBe('export interface Invoice {\n    id: string;\n    notes;\n}\n');
        expect(result.stderr).toContain('rendered 1 artifact(s)');
    });

    // A folder hint has no single output, so a folder argument can only mean its subtree.
    it('expands a folder argument to everything beneath it', async () => {
        const root = await makeProject();

        await write(root, 'src/_.hint', '# decision Only knowledge here\n\nbody\n');
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n');
        await write(root, 'src/payment.ts.hint', '# entity Payment\n\nbody\n');

        const result = await runCli([
            'emit',
            '--stdout',
            'src',
        ], root);

        expect(result.stdout).toContain('export interface Invoice');
        expect(result.stdout).toContain('export interface Payment');
        expect(result.stderr).toContain('rendered 2 artifact(s)');
    });

    it('explains that folder hints do not emit, rather than reporting nothing matched', async () => {
        const root = await makeProject();

        await write(root, 'src/_.hint', '# decision Only knowledge here\n\nbody\n');

        const result = await runCli([
            'emit',
            'src',
        ], root);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('never emits');
        expect(result.stdout).toBe('');
    });

    it('names the registered targets when none matches the output path', async () => {
        const root = await makeProject();

        await write(root, 'src/schema.sql.hint', '# entity Invoice\n\nbody\n');

        const result = await runCli([
            'emit',
            'src/schema.sql',
        ], root);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('no emitter matched');
        expect(result.stderr).toContain('typescript');
    });

    it('exits 2 when the project has no emitters at all', async () => {
        const root = await makeProject(false);

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n');

        const result = await runCli([
            'emit',
            'src/invoice.ts',
        ], root);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('no emitters registered');
    });

    it('rejects an unknown --target and lists what exists', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n');

        const result = await runCli([
            'emit',
            '--target',
            'kotlin',
            'src/invoice.ts',
        ], root);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("no emitter for target 'kotlin'");
        expect(result.stderr).toContain('Available: typescript');
    });

    it('writes nothing to disk under --stdout or --check', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n');

        await runCli(['emit', '--stdout', 'src/invoice.ts'], root);
        await expect(FsPromises.access(Path.join(root, 'src/invoice.ts'))).rejects.toThrow();

        await runCli(['emit', '--check', 'src/invoice.ts'], root);
        await expect(FsPromises.access(Path.join(root, 'src/invoice.ts'))).rejects.toThrow();
    });
});

describe('cli emit — writing', () => {
    it('creates the artifact wrapped in a generated region', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');

        const result = await runCli(['emit', 'src/invoice.ts'], root);

        expect(result.stderr).toContain('1 created');
        expect(await FsPromises.readFile(Path.join(root, 'src/invoice.ts'), 'utf8')).toBe(
            ['// hint:begin', 'export interface Invoice {', '    id: string;', '}', '// hint:end', ''].join('\n'),
        );
    });

    it('is idempotent', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');

        await runCli(['emit', 'src/invoice.ts'], root);
        const first = await FsPromises.readFile(Path.join(root, 'src/invoice.ts'), 'utf8');
        const second = await runCli(['emit', 'src/invoice.ts'], root);

        expect(second.stderr).toContain('1 unchanged');
        expect(await FsPromises.readFile(Path.join(root, 'src/invoice.ts'), 'utf8')).toBe(first);
    });

    // The promise that makes re-running safe: the generator owns marked spans, the human owns the rest.
    it('preserves hand-written code outside the region', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');
        await runCli(['emit', 'src/invoice.ts'], root);

        const outputPath = Path.join(root, 'src/invoice.ts');

        await FsPromises.appendFile(outputPath, '\nexport function settle(invoice: Invoice) {\n    return invoice;\n}\n', 'utf8');

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n\n## field total: Decimal\n');

        const result = await runCli(['emit', 'src/invoice.ts'], root);
        const content = await FsPromises.readFile(outputPath, 'utf8');

        expect(result.stderr).toContain('1 updated');
        expect(content).toContain('total: Decimal;');
        expect(content).toContain('export function settle(invoice: Invoice) {');
    });

    it('adopts an existing hand-written file without truncating it', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts', 'export const VERSION = 1;\n');
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');

        await runCli(['emit', 'src/invoice.ts'], root);

        const content = await FsPromises.readFile(Path.join(root, 'src/invoice.ts'), 'utf8');

        expect(content).toContain('export const VERSION = 1;');
        expect(content).toContain('export interface Invoice {');
    });
});

describe('cli emit --check', () => {
    it('passes when the artifact matches its spec', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');
        await runCli(['emit', 'src/invoice.ts'], root);

        const result = await runCli(['emit', '--check', 'src/invoice.ts'], root);

        expect(result.exitCode).toBeUndefined();
        expect(result.stderr).toContain('1 artifact(s) match their specs');
    });

    it('exits 1 and names the file when the spec moved', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');
        await runCli(['emit', 'src/invoice.ts'], root);
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n\n## field total: Decimal\n');

        const result = await runCli(['emit', '--check', 'src/invoice.ts'], root);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('1 of 1 artifact(s) differ');
        expect(result.stderr).toContain('src/invoice.ts');
    });

    it('exits 1 when the artifact does not exist at all', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n');

        expect((await runCli(['emit', '--check', 'src/invoice.ts'], root)).exitCode).toBe(1);
    });
});

describe('cli emit — holes', () => {
    async function withHoles(): Promise<string> {
        const root = await makeProject();

        await write(root, 'books/keywords/func.md', '<function_contract>{name}</function_contract>');
        await write(root, 'books/ts/func.tmpl', 'export function {name}() {\n    {hole:body|throw new Error("todo");}\n}');

        return root;
    }

    it('emits a hole with its constraints and a stub body', async () => {
        const root = await withHoles();

        await write(root, '_.hint', '# decision Money is integer minor units\n\nBecause decimals drifted.\n');
        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n\n## decision Net before writing\n\nNet the ledger first.\n');

        await runCli(['emit', 'src/svc.ts'], root);

        const content = await FsPromises.readFile(Path.join(root, 'src/svc.ts'), 'utf8');

        expect(content).toContain('// Settles an invoice.');
        expect(content).toContain('// Honor:');
        expect(content).toContain('//   decision Net before writing:');
        expect(content).toContain('//     Net the ledger first.');
        expect(content).toContain('plus the knowledge inherited from ., src — run `hint src/svc.ts`');
        expect(content).toMatch(/\/\/ hint:hole\(body\) spec=[0-9a-f]{8}/);
        expect(content).toContain('throw new Error("todo");');
    });

    // Without this, the first re-emit after a model run destroys the work and nobody re-runs it.
    it('preserves a filled hole body across re-emission', async () => {
        const root = await withHoles();

        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);

        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8')).replace('throw new Error("todo");', 'return ledger.settle(invoice);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');

        const result = await runCli(['emit', 'src/svc.ts'], root);
        const content = await FsPromises.readFile(outputPath, 'utf8');

        expect(result.stderr).toContain('1 filled hole(s) preserved');
        expect(content).toContain('return ledger.settle(invoice);');
        expect(content).not.toContain('throw new Error("todo");');
    });

    it('reports a body whose governing spec moved, without rewriting it', async () => {
        const root = await withHoles();

        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);

        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8')).replace('throw new Error("todo");', 'return ledger.settle(invoice);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');
        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice, and now also emits a receipt.\n');

        const result = await runCli(['emit', 'src/svc.ts'], root);
        const content = await FsPromises.readFile(outputPath, 'utf8');

        expect(result.stderr).toContain('spec changed since body was implemented');
        expect(content).toContain('return ledger.settle(invoice);');
        expect(content).toContain('emits a receipt');
    });

    it('does not report a filled hole as a --check difference', async () => {
        const root = await withHoles();

        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);

        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8')).replace('throw new Error("todo");', 'return ledger.settle(invoice);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');

        expect((await runCli(['emit', '--check', 'src/svc.ts'], root)).exitCode).toBeUndefined();
    });
});

// An adapter is an external command reporting a file's real symbols as JSON. A fake one is enough to
// exercise the contract end to end — the point is that the engine learns no language.
describe('cli verify — conformance via an adapter', () => {
    async function withAdapter(symbols: unknown): Promise<string> {
        const root = await makeProject();

        await write(root, 'books/keywords/func.md', '---\nsurface: true\n---\n\n<function_contract>{name}</function_contract>');
        await write(root, 'books/keywords/arg.md', '<argument>{name}</argument>');
        await write(root, 'books/keywords/result.md', '<return>{name}</return>');
        await write(root, 'adapter.mjs', `process.stdout.write(${JSON.stringify(JSON.stringify({ symbols }))});\n`);
        await write(
            root,
            'books/ts/hintbook.json',
            '{"id":"emit-ts","target":"typescript","match":["*.ts"],"comment":"// {text}","symbols":"node adapter.mjs {file}"}',
        );

        await write(root, 'src/svc.ts', 'export function settle() {}\n');
        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n\n## arg invoice: Invoice\n\n## result: Receipt\n');

        return root;
    }

    it('passes when the file matches what the spec declared', async () => {
        const root = await withAdapter([{ kind: 'function', name: 'settle', params: [{ name: 'invoice', type: 'Invoice' }], returns: 'Receipt' }]);

        const result = await runCli(['verify', 'src/svc.ts'], root);

        expect(result.exitCode).toBeUndefined();
        expect(result.stderr).toContain('1 against the code');
    });

    // A presence lint could never catch this: the name is in the file, the shape is wrong.
    it('fails on a parameter type that contradicts the spec', async () => {
        const root = await withAdapter([{ kind: 'function', name: 'settle', params: [{ name: 'invoice', type: 'string' }], returns: 'Receipt' }]);

        const result = await runCli(['verify', 'src/svc.ts'], root);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("parameter 'invoice' is string, spec says Invoice");
    });

    it('fails on a return type that contradicts the spec', async () => {
        const root = await withAdapter([{ kind: 'function', name: 'settle', params: [{ name: 'invoice', type: 'Invoice' }], returns: 'void' }]);

        expect((await runCli(['verify', 'src/svc.ts'], root)).stdout).toContain('returns void, spec says Receipt');
    });

    // An adapter that cannot answer must degrade to the old presence lint, never to a pass.
    it('falls back to the presence lint when the adapter fails', async () => {
        const root = await withAdapter([]);

        await write(root, 'adapter.mjs', 'process.exit(3);\n');

        const result = await runCli(['verify', 'src/svc.ts'], root);

        // `settle` does appear in the file, so the presence lint passes — but it was not checked by shape.
        expect(result.exitCode).toBeUndefined();
        expect(result.stderr).not.toContain('against the code');
    });
});
