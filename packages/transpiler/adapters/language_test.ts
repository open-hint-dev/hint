// The out-of-process built-ins, against real files.
//
// These exercise the language's actual toolchain rather than a stub, because that is the whole claim
// being made: the symbol table comes from Python's own `ast` and Go's own `go/ast`, not from a parser
// written here. A stub would test the plumbing and prove nothing about the claim.
//
// Each suite skips itself when the toolchain is absent — a machine without Go must not fail the
// build, and the adapter's own answer in that case ("not installed") is asserted separately below.

import { execFile } from 'node:child_process';
import * as Fs from 'node:fs';
import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { promisify } from 'node:util';

import { jsonSymbols, tomlSymbols, yamlSymbols } from './data.js';
import { goSymbols } from './go.js';
import { BUILTIN_PREFIX, builtinNames, findBuiltinAdapter } from './index.js';
import { pythonSymbols } from './python.js';
import { rubySymbols } from './ruby.js';
import { sqlSymbols } from './sql.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function installed(executable: string, args: string[]): Promise<boolean> {
    try {
        await execFileAsync(executable, args);

        return true;
    } catch {
        return false;
    }
}

async function project(name: string, content: string): Promise<{ root: string; file: string }> {
    const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-adapter-'));

    roots.push(root);

    await FsPromises.writeFile(Path.join(root, name), content, 'utf8');

    return { root, file: name };
}

afterAll(async () => {
    for (const root of roots) {
        await FsPromises.rm(root, { recursive: true, force: true });
    }
});

describe('the built-in registry', () => {
    it('addresses a built-in only through the hint: prefix', () => {
        expect(findBuiltinAdapter('hint:typescript')).not.toBeNull();
        expect(findBuiltinAdapter('typescript')).toBeNull();
    });

    // A pack naming a program that happens to be called `python` must still get that program.
    it('leaves an ordinary command alone', () => {
        expect(findBuiltinAdapter('python3 tool.py {file}')).toBeNull();
    });

    it('lists what it has', () => {
        expect(builtinNames()).toEqual([
            'go',
            'javascript',
            'json',
            'python',
            'ruby',
            'sql',
            'toml',
            'typescript',
            'yaml',
        ]);
        expect(BUILTIN_PREFIX).toBe('hint:');
    });
});

describe('the python adapter', async () => {
    const available = await installed('python3', ['--version']);

    it.skipIf(!available)('reports functions and classes with the annotations the author wrote', async () => {
        const { root, file } = await project(
            'billing.py',
            'from decimal import Decimal\n\n\nclass Entry:\n    id: str\n    total: Decimal\n\n\ndef settle(invoice: Entry, retries) -> Receipt:\n    pass\n',
        );

        const reading = await pythonSymbols(root, file);

        expect(reading.failure).toBeUndefined();
        expect(reading.symbols).toEqual([
            { kind: 'class', name: 'Entry', fields: [{ name: 'id', type: 'str' }, { name: 'total', type: 'Decimal' }], params: undefined, returns: undefined },
            {
                kind: 'function',
                name: 'settle',
                params: [{ name: 'invoice', type: 'Entry' }, { name: 'retries', type: undefined }],
                returns: 'Receipt',
                fields: undefined,
            },
        ]);
    });

    // `self` is not a parameter any spec would declare, and reporting it would make every method
    // spec fail for a reason nobody wrote down.
    it.skipIf(!available)('does not report the receiver of a method as a parameter', async () => {
        const { root, file } = await project('svc.py', 'class Ledger:\n    def post(self, entry: Entry) -> None:\n        pass\n');
        const reading = await pythonSymbols(root, file);

        expect(reading.symbols?.[0]?.name).toBe('Ledger');
    });

    // A file that does not parse is not a file with no symbols. Saying so is what keeps `verify` from
    // reporting every declared surface as missing the moment somebody leaves a syntax error.
    it.skipIf(!available)('reports a syntax error as a failure rather than an empty file', async () => {
        const { root, file } = await project('broken.py', 'def settle(:\n');
        const reading = await pythonSymbols(root, file);

        expect(reading.symbols).toBeNull();
        expect(reading.failure).toBeTruthy();
    });
});

describe('the go adapter', async () => {
    const available = await installed('go', ['version']);

    // The first `go run` on a machine with a cold build cache compiles the helper and the standard
    // library packages it imports, which is seconds rather than milliseconds — comfortably past
    // vitest's default. Every run after it is milliseconds, which is the point of the cache.
    const COLD_BUILD_MS = 180_000;

    it.skipIf(!available)('reports structs and funcs with the types as written', async () => {
        const { root, file } = await project(
            'billing.go',
            'package billing\n\ntype Entry struct {\n\tID    string\n\tTotal Decimal\n}\n\nfunc Settle(invoice Entry, retries int) (Receipt, error) {\n\treturn Receipt{}, nil\n}\n',
        );

        const reading = await goSymbols(root, file);

        expect(reading.failure).toBeUndefined();
        expect(reading.symbols).toEqual([
            {
                kind: 'struct',
                name: 'Entry',
                fields: [{ name: 'ID', type: 'string' }, { name: 'Total', type: 'Decimal' }],
                params: undefined,
                returns: undefined,
            },
            {
                kind: 'function',
                name: 'Settle',
                params: [{ name: 'invoice', type: 'Entry' }, { name: 'retries', type: 'int' }],
                // Go returns a tuple; a spec's single `## result` can only be about the first of them.
                returns: 'Receipt',
                fields: undefined,
            },
        ]);
    }, COLD_BUILD_MS);

    it.skipIf(!available)('reports a file that does not compile as a failure', async () => {
        const { root, file } = await project('broken.go', 'package x\n\nfunc (\n');
        const reading = await goSymbols(root, file);

        expect(reading.symbols).toBeNull();
        expect(reading.failure).toBeTruthy();
    }, COLD_BUILD_MS);

    // The helper is materialized into a cache keyed by its own hash, so the second call reuses it.
    // Both calls must give the same answer, which is what makes it safe to cache at all.
    it.skipIf(!available)('gives the same answer on a second, cached run', async () => {
        const { root, file } = await project('again.go', 'package x\n\nfunc F(a string) error { return nil }\n');

        expect(await goSymbols(root, file)).toEqual(await goSymbols(root, file));
    }, COLD_BUILD_MS);
});

describe('a toolchain that is not there', () => {
    it('says so rather than reporting a file with no symbols', async () => {
        const reading = await pythonSymbols(process.cwd(), 'definitely-not-here.py');

        expect(reading.symbols).toBeNull();
        expect(reading.failure).toBeTruthy();
    });
});

// One mapping serves all three structured formats: a top-level key is a symbol, its value's type is
// the kind, and a mapping's own keys are its fields.
describe('the structured-data adapters', () => {
    it('reports json keys with the type of each value', async () => {
        const { root, file } = await project('config.json', '{"database": {"host": "db", "port": 5432}, "debug": true}');
        const reading = await jsonSymbols(root, file);

        expect(reading.symbols).toEqual([
            {
                kind: 'object',
                name: 'database',
                fields: [{ name: 'host', type: 'string' }, { name: 'port', type: 'number' }],
            },
            { kind: 'boolean', name: 'debug', fields: undefined },
        ]);
    });

    it('reads yaml through the parser the engine already carries', async () => {
        const { root, file } = await project('config.yml', 'database:\n    host: db\n    port: 5432\ndebug: true\n');
        const reading = await yamlSymbols(root, file);

        expect(reading.symbols?.map((symbol) => symbol.name)).toEqual([
            'database',
            'debug',
        ]);
        expect(reading.symbols?.[0]?.fields).toEqual([{ name: 'host', type: 'string' }, { name: 'port', type: 'number' }]);
    });

    // A document that names nothing is not a broken document. It parsed; it simply has no surfaces.
    it('reports a document that is not a mapping as declaring nothing', async () => {
        const { root, file } = await project('list.json', '[1, 2, 3]');

        expect((await jsonSymbols(root, file)).symbols).toEqual([]);
    });

    it('reports a syntax error as a failure rather than an empty document', async () => {
        const { root, file } = await project('broken.json', '{"a": }');
        const reading = await jsonSymbols(root, file);

        expect(reading.symbols).toBeNull();
        expect(reading.failure).toBeTruthy();
    });

    it('reads toml through python tomllib', async () => {
        const { root, file } = await project('Cargo.toml', '[package]\nname = "probe"\nversion = "1.0.0"\n');
        const reading = await tomlSymbols(root, file);

        expect(reading.failure).toBeUndefined();
        expect(reading.symbols).toEqual([
            {
                kind: 'object',
                name: 'package',
                fields: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }],
            },
        ]);
    });
});

describe('the sql adapter', () => {
    it('reports tables and their real columns, from the catalogue rather than the text', async () => {
        const { root, file } = await project(
            'schema.sql',
            '-- a comment; with a semicolon\nCREATE TABLE invoice (\n    id TEXT PRIMARY KEY,\n    total NUMERIC NOT NULL\n);\n',
        );

        const reading = await sqlSymbols(root, file);

        expect(reading.failure).toBeUndefined();
        expect(reading.symbols).toEqual([
            {
                kind: 'table',
                name: 'invoice',
                fields: [{ name: 'id', type: 'TEXT' }, { name: 'total', type: 'NUMERIC' }],
                params: undefined,
                returns: undefined,
            },
        ]);
    });

    // This is a reader. It must not run somebody's INSERT, even against a database it throws away.
    it('executes only CREATE statements', async () => {
        const { root, file } = await project('seed.sql', "CREATE TABLE t (a TEXT);\nINSERT INTO t VALUES ('x');\nDROP TABLE t;\n");
        const reading = await sqlSymbols(root, file);

        expect(reading.symbols?.map((symbol) => symbol.name)).toEqual(['t']);
    });

    // The stated limitation: this reads SQLite's dialect. Anything it refuses is reported as a
    // refusal, never as a table with fewer columns than the file declares.
    it('reports a dialect it cannot read rather than a partial reading', async () => {
        const { root, file } = await project('pg.sql', 'CREATE TABLE t (a TEXT) PARTITION BY RANGE (a);\n');
        const reading = await sqlSymbols(root, file);

        expect(reading.symbols).toBeNull();
        expect(reading.failure).toBeTruthy();
    });
});

describe('the ruby adapter', () => {
    it('reports classes and methods, with no types because ruby writes none', async () => {
        const { root, file } = await project('ledger.rb', 'class Ledger\n  def post(entry, retries = 3)\n  end\nend\n');
        const reading = await rubySymbols(root, file);

        expect(reading.failure).toBeUndefined();
        expect(reading.symbols?.map((symbol) => [symbol.kind, symbol.name])).toEqual([
            ['class', 'Ledger'],
            ['function', 'post'],
        ]);
        expect(reading.symbols?.[1]?.params).toEqual([{ name: 'entry', type: undefined }, { name: 'retries', type: undefined }]);
    });

    it('reports a file ruby cannot parse as a failure', async () => {
        const { root, file } = await project('broken.rb', 'def settle(\n');
        const reading = await rubySymbols(root, file);

        expect(reading.symbols).toBeNull();
        expect(reading.failure).toBeTruthy();
    });
});

// The helper scripts for Python, Ruby, SQL and TOML are embedded in JavaScript template literals,
// where a backslash is consumed before the interpreter ever sees it: `\\*` in the file arrives as
// `*`. That cost an afternoon once — a regex silently became a different regex, the file on disk
// read correctly, and only the running program was wrong. The scripts are kept backslash-free so
// what is read is what runs.
describe('the embedded helper scripts', () => {
    const scripted = [
        'python.ts',
        'ruby.ts',
        'sql.ts',
        'data.ts',
    ];

    it.each(scripted)('has no backslash in %s that a template literal would eat', (file) => {
        const source = Fs.readFileSync(new URL(file, import.meta.url), 'utf8');
        const script = source.match(/const [A-Z_]*SCRIPT = `([\s\S]*?)`;/)?.[1] ?? '';

        expect(script).not.toBe('');
        expect(script).not.toContain('\\');
    });
});
