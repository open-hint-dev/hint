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

    // Appending a region to a file that already has content puts a second copy of every declaration
    // into it. That does not fail loudly — it produces a file that no longer compiles — so it has to
    // be an explicit decision rather than a cheerful "created".
    it('refuses to append a region to a file it does not manage', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts', 'export interface Invoice { id: string }\n');
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');

        const result = await runCli(['emit', 'src/invoice.ts'], root);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('already has content and no hint:begin region');
        expect(await FsPromises.readFile(Path.join(root, 'src/invoice.ts'), 'utf8')).toBe('export interface Invoice { id: string }\n');
    });

    it('adopts an existing file when asked to, without truncating it', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts', 'export const VERSION = 1;\n');
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');

        await runCli(['emit', '--adopt', 'src/invoice.ts'], root);

        const content = await FsPromises.readFile(Path.join(root, 'src/invoice.ts'), 'utf8');

        expect(content).toContain('export const VERSION = 1;');
        expect(content).toContain('export interface Invoice {');
    });

    // Once the region exists the file is managed, so subsequent runs need no flag.
    it('needs no flag once the file carries a region', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts', 'export const VERSION = 1;\n');
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');
        await runCli(['emit', '--adopt', 'src/invoice.ts'], root);

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n\n## field total: Decimal\n');

        const result = await runCli(['emit', 'src/invoice.ts'], root);

        expect(result.exitCode).toBeUndefined();
        expect(await FsPromises.readFile(Path.join(root, 'src/invoice.ts'), 'utf8')).toContain('total: Decimal;');
    });

    // An empty file is not a file anybody wrote into, so it is managed without ceremony.
    it('treats an empty file as unmanaged-but-free', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts', '');
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');

        expect((await runCli(['emit', 'src/invoice.ts'], root)).exitCode).toBeUndefined();
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
        expect(content).toMatch(/\/\/ hint:hole\(func settle:body\) spec=[0-9a-f]{8}/);
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

        expect(result.stderr).toContain('spec changed since func settle:body was implemented');
        expect(content).toContain('return ledger.settle(invoice);');
        expect(content).toContain('emits a receipt');
    });

    // The label used to come from the template, so every `func` in a file rendered `hint:hole(body)`
    // and re-emission wrote one implementation into all of them — reporting success while doing it.
    it('keeps two implementations in one file apart', async () => {
        const root = await withHoles();

        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n\n# func refund\n\nRefunds an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);

        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8'))
            .replace('throw new Error("todo");', 'return ledger.settle(x);')
            .replace('throw new Error("todo");', 'return ledger.refund(x);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');
        await runCli(['emit', 'src/svc.ts'], root);

        const content = await FsPromises.readFile(outputPath, 'utf8');

        expect(content).toContain('hint:hole(func settle:body)');
        expect(content).toContain('hint:hole(func refund:body)');
        expect(content.indexOf('return ledger.settle(x);')).toBeLessThan(content.indexOf('export function refund'));
        expect(content.indexOf('return ledger.refund(x);')).toBeGreaterThan(content.indexOf('export function refund'));
    });

    // An implementation the new artifact has nowhere to put would simply vanish, and vanished work
    // cannot be recovered — so the write is refused and the labels are named.
    it('refuses to write when an implemented hole has nowhere to go', async () => {
        const root = await withHoles();

        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);

        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8')).replace('throw new Error("todo");', 'return ledger.settle(x);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');
        // The block is renamed, so its body has no home in the new artifact.
        await write(root, 'src/svc.ts.hint', '# func settleInvoice\n\nSettles an invoice.\n');

        const result = await runCli(['emit', 'src/svc.ts'], root);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('not written');
        expect(result.stderr).toContain('func settle:body');
        expect(await FsPromises.readFile(outputPath, 'utf8')).toContain('return ledger.settle(x);');

        const forced = await runCli(['emit', '--drop-orphans', 'src/svc.ts'], root);

        expect(forced.exitCode).toBeUndefined();
        expect(await FsPromises.readFile(outputPath, 'utf8')).not.toContain('return ledger.settle(x);');
    });

    // A `{#id}` is unique by construction and survives a rename, which is exactly what the one part of
    // the artifact that cannot be regenerated needs.
    it('follows a renamed block when it carries a stable id', async () => {
        const root = await withHoles();

        await write(root, 'src/svc.ts.hint', '# func settle {#settle_impl}\n\nSettles an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);

        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8')).replace('throw new Error("todo");', 'return ledger.settle(x);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');
        await write(root, 'src/svc.ts.hint', '# func settleInvoice {#settle_impl}\n\nSettles an invoice.\n');

        const result = await runCli(['emit', 'src/svc.ts'], root);

        expect(result.exitCode).toBeUndefined();

        const content = await FsPromises.readFile(outputPath, 'utf8');

        expect(content).toContain('export function settleInvoice()');
        expect(content).toContain('return ledger.settle(x);');
        expect(content).toContain('hint:hole(#settle_impl:body)');
    });

    // Files written before labels were qualified carry the bare form. A single hole is unambiguous, so
    // its body is adopted rather than replaced by a stub.
    it('adopts a body written under the old unqualified label', async () => {
        const root = await withHoles();

        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);

        const outputPath = Path.join(root, 'src/svc.ts');
        const legacy = (await FsPromises.readFile(outputPath, 'utf8'))
            .replace('hint:hole(func settle:body)', 'hint:hole(body)')
            .replace('throw new Error("todo");', 'return ledger.settle(x);');

        await FsPromises.writeFile(outputPath, legacy, 'utf8');

        const result = await runCli(['emit', 'src/svc.ts'], root);

        expect(result.exitCode).toBeUndefined();
        expect(await FsPromises.readFile(outputPath, 'utf8')).toContain('return ledger.settle(x);');
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

// The brownfield on-ramp: without it, adoption means writing every spec by hand, which is why most
// spec-driven tooling only ever gets used on greenfield work.
describe('cli extract', () => {
    async function withAdapter(): Promise<string> {
        const root = await makeProject();

        await write(root, 'books/keywords/func.md', '<function_contract>{name}</function_contract>');
        await write(root, 'books/keywords/arg.md', '<argument>{name}</argument>');
        await write(root, 'books/keywords/result.md', '<return>{name}</return>');
        await write(
            root,
            'adapter.mjs',
            `process.stdout.write(JSON.stringify({ symbols: [
                { kind: 'interface', name: 'Invoice', fields: [{ name: 'id', type: 'string' }, { name: 'notes' }] },
                { kind: 'function', name: 'settle', params: [{ name: 'invoice', type: 'Invoice' }], returns: 'Receipt' },
                { kind: 'namespace', name: 'ignored' },
            ] }));\n`,
        );
        await write(
            root,
            'books/ts/hintbook.json',
            JSON.stringify({
                id: 'emit-ts',
                target: 'typescript',
                match: ['*.ts'],
                comment: '// {text}',
                symbols: 'node adapter.mjs {file}',
                extract: { interface: 'entity', function: 'func', param: 'arg', field: 'field', result: 'result' },
            }),
        );

        await write(root, 'src/invoice.ts', 'export const a = 1;\n');

        return root;
    }

    it('drafts a spec from the symbols the adapter reports', async () => {
        const root = await withAdapter();

        const result = await runCli(['extract', 'src/invoice.ts'], root);
        const spec = await FsPromises.readFile(Path.join(root, 'src/invoice.ts.hint'), 'utf8');

        expect(result.stderr).toContain('drafted 1 spec(s)');
        expect(spec).toContain('# entity Invoice');
        expect(spec).toContain('## field id: string');
        // A type the adapter could not determine is left off, exactly as a spec that never stated one.
        expect(spec).toContain('## field notes');
        expect(spec).toContain('# func settle');
        expect(spec).toContain('## arg invoice: Invoice');
        expect(spec).toContain('## result: Receipt');
    });

    // The half a parser cannot recover is the half that matters, and a draft that reads as finished
    // knowledge is worse than no draft at all.
    it('says out loud that the draft records shape only', async () => {
        const root = await withAdapter();

        await runCli(['extract', 'src/invoice.ts'], root);

        const spec = await FsPromises.readFile(Path.join(root, 'src/invoice.ts.hint'), 'utf8');

        expect(spec).toContain('it does not yet record why');
        expect((await runCli(['extract', '--overwrite', 'src/invoice.ts'], root)).stderr).toContain('Add the rationale');
    });

    it('skips a kind the target did not map, rather than inventing a keyword', async () => {
        const root = await withAdapter();

        await runCli(['extract', 'src/invoice.ts'], root);

        expect(await FsPromises.readFile(Path.join(root, 'src/invoice.ts.hint'), 'utf8')).not.toContain('ignored');
    });

    it('leaves an existing spec alone unless forced', async () => {
        const root = await withAdapter();

        await write(root, 'src/invoice.ts.hint', '# decision Hand written\n\nKeep me.\n');

        const result = await runCli(['extract', 'src/invoice.ts'], root);

        expect(result.stderr).toContain('already exist and were left alone');
        expect(await FsPromises.readFile(Path.join(root, 'src/invoice.ts.hint'), 'utf8')).toContain('Keep me.');

        await runCli(['extract', '--overwrite', 'src/invoice.ts'], root);

        expect(await FsPromises.readFile(Path.join(root, 'src/invoice.ts.hint'), 'utf8')).toContain('# entity Invoice');
    });

    it('reads a folder without trying to draft a spec from a spec', async () => {
        const root = await withAdapter();

        await write(root, 'src/other.ts', 'export const b = 2;\n');
        await runCli(['extract', 'src'], root);

        expect((await runCli(['extract', 'src'], root)).stderr).toContain('2 spec(s) already exist');
        await expect(FsPromises.access(Path.join(root, 'src/invoice.ts.hint.hint'))).rejects.toThrow();
    });

    it('exits 2 when no emit pack declares an adapter and an extract map', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts', 'export const a = 1;\n');

        const result = await runCli(['extract', 'src/invoice.ts'], root);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('no emit pack declaring an adapter and an extract map');
    });
});

describe('cli extract — the other paths', () => {
    it('prints to stdout and writes nothing', async () => {
        const root = await makeProject();

        await write(root, 'books/ts/hintbook.json', JSON.stringify({
            id: 'emit-ts',
            target: 'typescript',
            match: ['*.ts'],
            comment: '// {text}',
            symbols: 'node adapter.mjs {file}',
            extract: { interface: 'entity', field: 'field' },
        }));
        await write(root, 'adapter.mjs', `process.stdout.write(JSON.stringify({ symbols: [{ kind: 'interface', name: 'Invoice', fields: [{ name: 'id', type: 'string' }] }] }));\n`);
        await write(root, 'src/invoice.ts', 'export const a = 1;\n');

        const result = await runCli(['extract', '--stdout', 'src/invoice.ts'], root);

        expect(result.stdout).toContain('# entity Invoice');
        expect(result.stdout).toContain('## field id: string');
        await expect(FsPromises.access(Path.join(root, 'src/invoice.ts.hint'))).rejects.toThrow();
    });

    it('names a path that is not in the repository', async () => {
        const root = await makeProject();

        const result = await runCli(['extract', 'src/nope.ts'], root);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('src/nope.ts does not exist in this repository');
    });
});
