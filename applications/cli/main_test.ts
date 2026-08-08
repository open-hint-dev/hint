import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BROAD_TARGET_COUNT, estimateTokens, isBroadCompile } from './commands/compile.js';
import { main } from './main.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = Path.resolve(here, '../../testdata/project');

type CliResult = {
    stdout: string;
    stderr: string;
    exitCode: number | string | undefined;
};

async function runCli(args: string[], cwd = projectRootPath): Promise<CliResult> {
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

        return {
            stdout: stdout.join(''),
            stderr: stderr.join(''),
            exitCode: process.exitCode,
        };
    } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();

        process.argv = previousArgv;
        process.exitCode = previousExitCode;
        process.chdir(previousCwd);
    }
}

describe('cli', () => {
    describe('compile', () => {
        it('compiles a hint file to stdout', async () => {
            const result = await runCli(['src/payment.ts.hint']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('<data_structure name="PaymentData" id="payment_data">');
            expect(result.stdout).toContain('<file_context path="src/payment.ts">');
        });

        it('returns knowledge only — no persona, no reporting footer', async () => {
            const result = await runCli(['src/payment.ts.hint']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).not.toContain('You are a senior software engineer');
            expect(result.stdout).not.toContain('The specification ends here.');
            expect(result.stdout.startsWith('<folder_context path=".">')).toBe(true);
        });

        it('adds the implementation framing only with --prompt', async () => {
            const result = await runCli([
                '--prompt',
                'src/payment.ts.hint',
            ]);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout.startsWith('You are a senior software engineer implementing a project')).toBe(true);
            expect(result.stdout).toContain('The specification ends here.');
            expect(result.stdout).toContain('<data_structure name="PaymentData" id="payment_data">');
        });

        it('rejects a removed option instead of silently ignoring it', async () => {
            const result = await runCli([
                '--mode',
                'fix',
                'src/payment.ts.hint',
            ]);

            // The mode system is gone. A stale invocation must fail loudly, not quietly render the default.
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('');
        });

        it('normalizes a folder path to its folder hint', async () => {
            const result = await runCli(['src']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('<folder_context path="src">');
            expect(result.stdout).not.toContain('<file_context');
        });

        it('--standalone implies --prompt and prepends the tag glossary', async () => {
            const plain = await runCli(['src/payment.ts.hint']);
            const standalone = await runCli([
                '--standalone',
                'src/payment.ts.hint',
            ]);

            expect(plain.stdout).not.toContain('The tag glossary below defines');
            expect(standalone.stdout).toContain('The tag glossary below defines');
            expect(standalone.stdout).toContain('You are a senior software engineer implementing a project');
        });

        it('does not warn about breadth on a small, focused compile', async () => {
            const result = await runCli(['src/payment.ts.hint']);

            expect(result.stderr).not.toContain('If this is broader than the task needs');
        });

        it('warns on stderr, never stdout, when a compile is broad', async () => {
            const tempRoot = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-broad-'));

            try {
                const hintbookPath = Path.resolve(here, '../../testdata/hintbook');
                await FsPromises.writeFile(Path.join(tempRoot, 'hint.yml'), `name: broad\nbooks:\n    - file://${hintbookPath}\n`);
                // A single spec whose body alone clears the token estimate, so the run reads as broad.
                await FsPromises.writeFile(Path.join(tempRoot, 'big.ts.hint'), `# entity Big {#big}\n\n${'lorem ipsum '.repeat(8000)}\n`);

                const result = await runCli(['big.ts.hint'], tempRoot);

                expect(result.stderr).toContain('If this is broader than the task needs');
                // The warning must not leak into stdout, which the agent consumes as the spec.
                expect(result.stdout).not.toContain('If this is broader than the task needs');
                expect(result.stdout).toContain('<data_structure name="Big"');
            } finally {
                await FsPromises.rm(tempRoot, { recursive: true, force: true });
            }
        });

        it('fails outside an initialized project', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['src/payment.ts.hint'], temporaryPath);

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('No hint.yml found');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('--strict exits 2 when a path has no spec of its own', async () => {
            const result = await runCli([
                '--strict',
                'no/such/path.hint',
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain('--strict');
            expect(result.stdout).toBe('');
        });

        it('accepts --dry-run as a hidden alias for --strict', async () => {
            const result = await runCli([
                '--dry-run',
                'no/such/path.hint',
            ]);

            expect(result.exitCode).toBe(2);
        });
    });

    describe('config', () => {
        it('reports an existing config and points to apply', async () => {
            const result = await runCli(['config']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('hint.yml already exists');
            expect(result.stdout).toContain('hint apply');
            expect(result.stdout).not.toContain('<hint>');
        });

        it('creates hint.yml in the current folder when none exists', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['config'], temporaryPath);

                expect(result.exitCode).toBeUndefined();
                expect(result.stdout).toContain('Created hint.yml');
                expect(result.stdout).toContain('hint apply');
                expect(result.stdout).not.toContain('<hint>');

                const configContent = await FsPromises.readFile(Path.join(temporaryPath, 'hint.yml'), 'utf8');
                expect(configContent).toContain(`name: ${Path.basename(temporaryPath)}`);
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });
    });

    describe('apply', () => {
        async function makeProject(): Promise<string> {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            await FsPromises.writeFile(Path.join(temporaryPath, 'hint.yml'), 'name: temp\nbooks:\n  - file://book\n', 'utf8');
            await FsPromises.mkdir(Path.join(temporaryPath, 'book'));
            await FsPromises.writeFile(Path.join(temporaryPath, 'book', 'hintbook.json'), '{ "id": "demo" }\n', 'utf8');
            await FsPromises.writeFile(Path.join(temporaryPath, 'book', '__system__.md'), '# system\nDemo glossary.\n', 'utf8');
            return temporaryPath;
        }

        it('writes the hint block into both files and is idempotent', async () => {
            const temporaryPath = await makeProject();

            try {
                const first = await runCli(['apply'], temporaryPath);

                expect(first.exitCode).toBeUndefined();
                expect(first.stdout).toContain('Created AGENTS.md');
                expect(first.stdout).toContain('Created CLAUDE.md');

                for (const fileName of [
                    'AGENTS.md',
                    'CLAUDE.md',
                ]) {
                    const content = await FsPromises.readFile(Path.join(temporaryPath, fileName), 'utf8');
                    expect(content.match(/<hint>/g)).toHaveLength(1);
                    expect(content).toContain('<hint_tag_glossary_from_demo>');
                    // The bootstrap teaches how to query HINT; it must not try to be the CLI manual.
                    expect(content).toContain('hint --help');
                    expect(content).toContain('hint search');
                }

                const second = await runCli(['apply'], temporaryPath);
                expect(second.stdout).toContain('already up to date');

                const reapplied = await FsPromises.readFile(Path.join(temporaryPath, 'AGENTS.md'), 'utf8');
                expect(reapplied.match(/<hint>/g)).toHaveLength(1);
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('keeps the block in AGENTS.md only when CLAUDE.md @-includes it', async () => {
            const temporaryPath = await makeProject();

            try {
                await FsPromises.writeFile(Path.join(temporaryPath, 'CLAUDE.md'), '@AGENTS.md\n', 'utf8');
                await FsPromises.writeFile(Path.join(temporaryPath, 'AGENTS.md'), '# Project\n\nNotes.\n', 'utf8');

                const result = await runCli(['apply'], temporaryPath);

                expect(result.exitCode).toBeUndefined();

                const agents = await FsPromises.readFile(Path.join(temporaryPath, 'AGENTS.md'), 'utf8');
                expect(agents).toContain('Notes.');
                expect(agents).toContain('<hint>');

                const claude = await FsPromises.readFile(Path.join(temporaryPath, 'CLAUDE.md'), 'utf8');
                expect(claude).toBe('@AGENTS.md\n');
                expect(claude).not.toContain('<hint>');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('fails outside an initialized project', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['apply'], temporaryPath);

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('No hint.yml found');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });
    });

    describe('add and remove', () => {
        async function makeProject(): Promise<string> {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            await FsPromises.writeFile(Path.join(temporaryPath, 'hint.yml'), 'name: temp\nbooks: []\n', 'utf8');
            await FsPromises.mkdir(Path.join(temporaryPath, 'book'));
            await FsPromises.writeFile(Path.join(temporaryPath, 'book', 'hintbook.json'), '{ "id": "temp-book" }\n', 'utf8');

            return temporaryPath;
        }

        it('registers a hintbook and removes it by its bare name', async () => {
            const temporaryPath = await makeProject();

            try {
                const addResult = await runCli(
                    [
                        'add',
                        'file://book',
                    ],
                    temporaryPath,
                );

                expect(addResult.exitCode).toBeUndefined();
                expect(addResult.stdout).toContain('Installed file://book');
                expect(addResult.stdout).toContain('hint apply');
                expect(addResult.stdout).not.toContain('<hint>');
                expect(await FsPromises.readFile(Path.join(temporaryPath, 'hint.yml'), 'utf8')).toContain('file://book');

                const removeResult = await runCli(
                    [
                        'remove',
                        'book',
                    ],
                    temporaryPath,
                );

                expect(removeResult.exitCode).toBeUndefined();
                expect(removeResult.stdout).toContain('Removed file://book');
                expect(removeResult.stdout).toContain('hint apply');
                expect(removeResult.stdout).not.toContain('<hint>');
                expect(await FsPromises.readFile(Path.join(temporaryPath, 'hint.yml'), 'utf8')).not.toContain('file://book');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('fails to remove an unregistered hintbook', async () => {
            const temporaryPath = await makeProject();

            try {
                const result = await runCli(
                    [
                        'remove',
                        'no-such-book',
                    ],
                    temporaryPath,
                );

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('Hintbook not registered');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });
    });

    describe('author', () => {
        it('prints the authoring prompt with the keyword vocabulary', async () => {
            const result = await runCli([
                'author',
                'src/payment.ts',
            ]);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('Authoring HINT knowledge');
            expect(result.stdout).toContain('src/payment.ts');
            expect(result.stdout).toContain('Keyword vocabulary');
            // The vocabulary comes before the syntax rules: picking a legal keyword is the real decision.
            expect(result.stdout.indexOf('## Keyword vocabulary')).toBeLessThan(result.stdout.indexOf('## Syntax'));
            // Keyword rows, including the synonym from rule.md and the description from entity.md.
            expect(result.stdout).toContain('| entity |');
            expect(result.stdout).toContain('A data structure or model with a fixed schema.');
            expect(result.stdout).toContain('| rule |');
            expect(result.stdout).toContain('rules');
            // Running instructions must never be advertised as keywords.
            expect(result.stdout).not.toContain('__file__');
            expect(result.stdout).not.toContain('__system__');
        });

        it('works with no target paths', async () => {
            const result = await runCli(['author']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('Authoring HINT knowledge');
            expect(result.stdout).toContain('| entity |');
        });

        it('shows help text for author command', async () => {
            const result = await runCli([
                'author',
                '--help',
            ]);

            expect(result.stdout + result.stderr).toContain('Usage: hint author');
        });

        it('fails outside an initialized project', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['author'], temporaryPath);

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('No hint.yml found');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });
    });

    describe('version', () => {
        it('prints the cli version and the registered hintbook versions', async () => {
            const result = await runCli(['version']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toMatch(/@openhint\/cli \d+\.\d+\.\d+/);
            expect(result.stdout).toContain('file://../hintbook');
        });

        it('prints only the cli version outside a project', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['version'], temporaryPath);

                expect(result.exitCode).toBeUndefined();
                expect(result.stdout).toMatch(/^@openhint\/cli \d+\.\d+\.\d+\n$/);
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('prints the cli version with the --version flag', async () => {
            const result = await runCli(['--version']);

            expect(result.stdout + result.stderr).toMatch(/@openhint\/cli \d+\.\d+\.\d+/);
        });

        it('prints the cli version with the -v flag', async () => {
            const result = await runCli(['-v']);

            expect(result.stdout + result.stderr).toMatch(/@openhint\/cli \d+\.\d+\.\d+/);
        });
    });

    describe('help', () => {
        it('leads with examples, then lists every command', async () => {
            const result = await runCli(['--help']);
            const output = result.stdout + result.stderr;

            for (const command of [
                'config',
                'apply',
                'add',
                'remove',
                'author',
                'search',
                'version',
                'verify',
                'lock',
                'diff',
            ]) {
                expect(output).toContain(command);
            }

            // Agents read the head of command output. Examples and the exit-code key must survive a `head`.
            expect(output.indexOf('Examples:')).toBeLessThan(output.indexOf('Options:'));
            expect(output).toContain('Exit codes:');
        });

        it('prints usage instead of an argument error when given nothing', async () => {
            const result = await runCli([]);
            const output = result.stdout + result.stderr;

            expect(output).toContain('Examples:');
            expect(output).not.toContain("missing required argument");
        });

        it('no longer offers the removed commands', async () => {
            const result = await runCli(['--help']);
            const output = result.stdout + result.stderr;

            // Match the command-listing form, so the prose word "instructions" does not mask a regression.
            for (const command of [
                'instruct',
                'modes',
                'list',
            ]) {
                expect(output).not.toMatch(new RegExp(`^\\s+${command}\\b`, 'm'));
            }
        });
    });
});

describe('cli lock / gate / diff / closure', () => {
    // A minimal project: hint.yml, a book whose only instruction renders the fix-mode drift section,
    // plus whatever .hint/target files a test needs. Keyword blocks pass through as their body.
    async function withProject(files: Record<string, string>, run: (dir: string) => Promise<void>): Promise<void> {
        const dir = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-track-'));

        try {
            await FsPromises.writeFile(Path.join(dir, 'hint.yml'), 'name: temp\nbooks:\n  - file://book\n', 'utf8');
            await FsPromises.mkdir(Path.join(dir, 'book'));
            await FsPromises.writeFile(Path.join(dir, 'book', 'hintbook.json'), '{ "id": "demo" }\n', 'utf8');
            await FsPromises.writeFile(Path.join(dir, 'book', '__changes__.md'), '<drift>\n\n{body}\n\n</drift>\n', 'utf8');

            for (const [
                relativePath,
                content,
            ] of Object.entries(files)) {
                const target = Path.join(dir, relativePath);
                await FsPromises.mkdir(Path.dirname(target), { recursive: true });
                await FsPromises.writeFile(target, content, 'utf8');
            }

            await run(dir);
        } finally {
            await FsPromises.rm(dir, { recursive: true, force: true });
        }
    }

    describe('lock', () => {
        it('writes hint.lock with a hash and per-block hashes for the target', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    const result = await runCli(['lock', 'src/a.ts'], dir);

                    expect(result.stderr).toContain('locked 1 file(s)');

                    const lock = await FsPromises.readFile(Path.join(dir, 'hint.lock'), 'utf8');
                    expect(lock).toContain('src/a.ts:');
                    expect(lock).toContain('hash:');
                    expect(lock).toContain('target:');
                    expect(lock).toContain('entity Foo');
                    // No version fingerprint — invalidation is driven by the per-file vocab hash instead.
                    expect(lock).not.toContain('books:');
                },
            );
        });

    });

    describe('verify', () => {
        it('reports success when every declared surface is present', async () => {
            await withProject(
                {
                    'book/func.md': '---\nsurface: true\n---\n<func>{name}</func>\n',
                    'src/a.ts.hint': '# func doLogin\n\nbody\n',
                    'src/a.ts': 'export function doLogin() {}\n',
                },
                async (dir) => {
                    const result = await runCli(['verify', 'src/a.ts'], dir);

                    expect(result.exitCode).toBeUndefined();
                    expect(result.stderr).toContain('verified 1 file(s)');
                },
            );
        });

        it('fails with a non-zero exit and lists the missing surface', async () => {
            await withProject(
                {
                    'book/func.md': '---\nsurface: true\n---\n<func>{name}</func>\n',
                    'src/a.ts.hint': '# func doLogin\n\nbody\n',
                    'src/a.ts': 'export const x = 1;\n',
                },
                async (dir) => {
                    const result = await runCli(['verify', 'src/a.ts'], dir);

                    expect(result.exitCode).toBe(1);
                    expect(result.stdout).toContain('src/a.ts: 1 declared surface(s) missing');
                    expect(result.stdout).toContain('func doLogin');
                },
            );
        });

        it('exits 2, not 0, when the books declare no surface keywords', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# func doLogin\n\nbody\n',
                    'src/a.ts': 'export const x = 1;\n',
                },
                async (dir) => {
                    const result = await runCli(['verify', 'src/a.ts'], dir);

                    expect(result.exitCode).toBe(2);
                    expect(result.stderr).toContain('no surface keywords');
                },
            );
        });
    });

    describe('gate', () => {
        it('skips a locked file whose spec is unchanged and its target exists', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    const result = await runCli(['src/a.ts'], dir);

                    expect(result.stdout).toBe('');
                    expect(result.stderr).toContain('up to date');
                },
            );
        });

        it('recompiles after the spec changes', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    await FsPromises.writeFile(Path.join(dir, 'src/a.ts.hint'), '# entity Foo\n\nfoo body changed\n', 'utf8');

                    const result = await runCli(['src/a.ts'], dir);
                    expect(result.stdout).toContain('foo body changed');
                },
            );
        });

        it('--force recompiles even when the file is fresh', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);

                    const result = await runCli(['src/a.ts', '--force'], dir);
                    expect(result.stdout).toContain('foo body');
                },
            );
        });

        it('does not skip when the target file is missing on disk', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    await FsPromises.rm(Path.join(dir, 'src/a.ts'));

                    const result = await runCli(['src/a.ts'], dir);
                    expect(result.stdout).toContain('foo body');
                },
            );
        });

        it('recompiles after a keyword instruction changes in place, with no version bump', async () => {
            await withProject(
                {
                    'book/entity.md': '<data_structure>{name}: {body}</data_structure>\n',
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);

                    // Sanity: unchanged -> skipped.
                    expect((await runCli(['src/a.ts'], dir)).stdout).toBe('');

                    // Change what `entity` compiles to — the spec, the output, and any version are all untouched.
                    await FsPromises.writeFile(Path.join(dir, 'book/entity.md'), '<data_structure>{name}: {body} — now audited</data_structure>\n', 'utf8');

                    const result = await runCli(['src/a.ts'], dir);
                    expect(result.stdout).toContain('now audited'); // recompiled under the new vocabulary
                },
            );
        });

        it('does not skip when the output was edited underneath an unchanged spec', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    // Edit the generated output only; the spec is untouched.
                    await FsPromises.writeFile(Path.join(dir, 'src/a.ts'), 'export const a = 999;\n', 'utf8');

                    const result = await runCli(['src/a.ts'], dir);
                    expect(result.stdout).toContain('foo body');
                },
            );
        });
    });

    describe('diff', () => {
        it('reports up to date right after locking', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    const result = await runCli(['diff', 'src/a.ts'], dir);

                    expect(result.stdout).toBe('');
                    expect(result.stderr).toContain('up to date');
                },
            );
        });

        it('pinpoints the block that changed', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n\n# rule Bar\n\nbar body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    await FsPromises.writeFile(
                        Path.join(dir, 'src/a.ts.hint'),
                        '# entity Foo\n\nfoo body\n\n# rule Bar\n\nbar body harder\n',
                        'utf8',
                    );

                    const result = await runCli(['diff', 'src/a.ts'], dir);
                    expect(result.stdout).toContain('changed: rule Bar');
                    expect(result.stdout).not.toContain('entity Foo');
                },
            );
        });

        it('reports output edited underneath an unchanged spec as drifted', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    await FsPromises.writeFile(Path.join(dir, 'src/a.ts'), 'export const a = 999;\n', 'utf8');

                    const result = await runCli(['diff', 'src/a.ts'], dir);
                    expect(result.stdout).toContain('src/a.ts: output changed since it was generated');
                },
            );
        });

        it('reports the absence of a lock', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    const result = await runCli(['diff', 'src/a.ts'], dir);
                    expect(result.stderr).toContain('no hint.lock');
                },
            );
        });
    });

    describe('closure', () => {
        it('includes referenced specs by default and excludes them with --no-refs', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# read src/b.ts\n\nreuse b\n',
                    'src/b.ts.hint': 'bee spec marker\n',
                    'src/b.ts': 'export const b = 1;\n',
                },
                async (dir) => {
                    const withRefs = await runCli(['src/a.ts'], dir);
                    expect(withRefs.stdout).toContain('bee spec marker');

                    const withoutRefs = await runCli(['src/a.ts', '--no-refs'], dir);
                    expect(withoutRefs.stdout).not.toContain('bee spec marker');
                },
            );
        });

    });

    describe('drift injection', () => {
        it('renders reconciliation guidance automatically under --prompt after a block changes', async () => {
            await withProject(
                {
                    'src/a.ts.hint': '# entity Foo\n\nfoo body\n\n# rule Bar\n\nbar body\n',
                    'src/a.ts': 'export const a = 1;\n',
                },
                async (dir) => {
                    await runCli(['lock', 'src/a.ts'], dir);
                    await FsPromises.writeFile(
                        Path.join(dir, 'src/a.ts.hint'),
                        '# entity Foo\n\nfoo body\n\n# rule Bar\n\nbar body harder\n',
                        'utf8',
                    );

                    // No mode to select: drift framing appears because a lock exists and something drifted.
                    const result = await runCli(['--prompt', 'src/a.ts'], dir);
                    expect(result.stdout).toContain('<drift>');
                    expect(result.stdout).toContain('changed: rule Bar');

                    // ...and never on the default context path, which carries knowledge only.
                    const context = await runCli(['src/a.ts'], dir);
                    expect(context.stdout).not.toContain('<drift>');
                },
            );
        });
    });
});

// Every case below was observed in production sessions reporting success while doing nothing, or
// returning the wrong knowledge as if it were authoritative. Each one asserts the tool now says so.
describe('cli truthfulness', () => {
    async function withProject(files: Record<string, string>, run: (dir: string) => Promise<void>): Promise<void> {
        const dir = await FsPromises.realpath(await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-truth-')));

        try {
            await FsPromises.writeFile(Path.join(dir, 'hint.yml'), 'name: temp\nbooks:\n  - file://book\n', 'utf8');
            await FsPromises.mkdir(Path.join(dir, 'book'));
            await FsPromises.writeFile(Path.join(dir, 'book', 'hintbook.json'), '{ "id": "demo" }\n', 'utf8');
            await FsPromises.writeFile(Path.join(dir, 'book', '__folder__.md'), '<folder path="{name}">\n{body}\n{children}\n</folder>\n', 'utf8');
            await FsPromises.writeFile(Path.join(dir, 'book', '__file__.md'), '<file path="{name}">\n{body}\n{children}\n</file>\n', 'utf8');

            for (const [
                relativePath,
                content,
            ] of Object.entries(files)) {
                const target = Path.join(dir, relativePath);
                await FsPromises.mkdir(Path.dirname(target), { recursive: true });
                await FsPromises.writeFile(target, content, 'utf8');
            }

            await run(dir);
        } finally {
            await FsPromises.rm(dir, { recursive: true, force: true });
        }
    }

    const FOLDER_ONLY = {
        '_.hint': '# rule Root\n\nnever commit secrets\n',
        'ai/_.hint': '# rule Ai\n\nmodel paths resolve against ai/\n',
        'ai/compose.yaml': 'services: {}\n',
    };

    describe('missing target', () => {
        it('does not pass ancestor context off as the answer for a path that does not exist', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const result = await runCli(['no/such/file.ts'], dir);

                expect(result.exitCode).toBe(2);
                expect(result.stderr).toContain('does not exist in this repository');
                expect(result.stderr).toContain('no/such/file.ts');
                // The inherited knowledge is still returned — it is simply labelled for what it is.
                expect(result.stdout).toContain('never commit secrets');
            });
        });

        it('distinguishes a real path with no spec from one that does not exist', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const existing = await runCli(['ai/compose.yaml'], dir);

                // Inheriting is a successful lookup: the ancestor knowledge IS the answer for this path.
                // Only a path that names nothing in the repository is exit 2.
                expect(existing.exitCode).toBeUndefined();
                expect(existing.stderr).toContain('no spec of its own');
                expect(existing.stderr).toContain('returning inherited context from');
                expect(existing.stderr).not.toContain('does not exist');
                expect(existing.stdout).toContain('model paths resolve against ai/');
            });
        });

        it('says nothing extra when the path does resolve', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const result = await runCli(['ai'], dir);

                expect(result.exitCode).toBeUndefined();
                expect(result.stderr).toBe('');
            });
        });
    });

    describe('empty lock target', () => {
        it('refuses to report success when a folder spec is passed', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const result = await runCli(['lock', 'ai'], dir);

                expect(result.exitCode).toBe(2);
                expect(result.stderr).toContain('folder knowledge');
                expect(result.stderr).toContain('locked nothing');
                expect(result.stderr).not.toContain('locked 0 file(s)');
            });
        });

        it('refuses to report success for a path that does not exist', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const result = await runCli(['lock', 'does/not/exist.ts'], dir);

                expect(result.exitCode).toBe(2);
                expect(result.stderr).toContain('not found');
            });
        });

        it('does not write a lock file it could not populate', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                await runCli(['lock', '.'], dir);

                await expect(FsPromises.access(Path.join(dir, 'hint.lock'))).rejects.toThrow();
            });
        });
    });

    describe('empty diff', () => {
        it('does not claim everything is up to date with no lock at all', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const result = await runCli(['diff', '.'], dir);

                expect(result.exitCode).toBe(2);
                expect(result.stderr).not.toContain('up to date');
                expect(result.stderr).toContain('no hint.lock');
            });
        });

        it('does not claim everything is up to date when the lock tracks nothing', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'hint.lock'), 'version: 2\nfiles: {}\n', 'utf8');

                const result = await runCli(['diff', '.'], dir);

                expect(result.exitCode).toBe(2);
                expect(result.stderr).toContain('tracks 0 files');
                expect(result.stderr).not.toContain('up to date');
            });
        });

        it('does not claim everything is up to date for a path that matched nothing tracked', async () => {
            await withProject({ 'src/a.ts.hint': '# entity Foo\n\nfoo\n', 'src/a.ts': 'export const a = 1;\n' }, async (dir) => {
                await runCli(['lock', 'src/a.ts'], dir);

                const result = await runCli(['diff', 'nope/x.ts'], dir);

                expect(result.exitCode).toBe(2);
                expect(result.stderr).not.toContain('up to date');
            });
        });

        it('still reports a genuinely clean comparison, naming how many files it checked', async () => {
            await withProject({ 'src/a.ts.hint': '# entity Foo\n\nfoo\n', 'src/a.ts': 'export const a = 1;\n' }, async (dir) => {
                await runCli(['lock', 'src/a.ts'], dir);

                const result = await runCli(['diff', 'src/a.ts'], dir);

                expect(result.exitCode).toBeUndefined();
                expect(result.stderr).toContain('1 file(s) compared');
            });
        });
    });

    describe('empty verify', () => {
        it('does not assert every surface is present when it verified nothing', async () => {
            await withProject(
                {
                    'book/func.md': '---\nsurface: true\n---\n<func>{name}</func>\n',
                    '_.hint': '# rule Root\n\nroot\n',
                },
                async (dir) => {
                    const result = await runCli(['verify', '.'], dir);

                    expect(result.exitCode).toBe(2);
                    expect(result.stderr).toContain('nothing to verify');
                    expect(result.stderr).not.toContain('every declared surface is present');
                },
            );
        });
    });

    describe('folder-only repository', () => {
        it('returns folder knowledge normally for context lookup', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const result = await runCli(['ai'], dir);

                expect(result.exitCode).toBeUndefined();
                expect(result.stdout).toContain('model paths resolve against ai/');
                expect(result.stdout).toContain('never commit secrets');
            });
        });

        it('counts folder scopes in the breadth guardrail', async () => {
            const files: Record<string, string> = { '_.hint': '# rule Root\n\nroot\n' };

            for (let index = 0; index < BROAD_TARGET_COUNT + 2; index++) {
                files[`pkg${index}/_.hint`] = `# rule R${index}\n\nknowledge for pkg${index}\n`;
            }

            await withProject(files, async (dir) => {
                const result = await runCli(["'**'".replaceAll("'", ''), '--no-refs'], dir);

                // A repo with zero file targets used to make this guard structurally unable to fire.
                expect(result.stderr).toContain('scope(s)');
                expect(result.stderr).toContain('broader than the task needs');
            });
        });
    });

    describe('small context lookup', () => {
        it('returns knowledge without a fixed scaffolding floor', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                const result = await runCli(['ai'], dir);

                expect(result.stdout).not.toContain('You are a senior');
                expect(result.stdout).not.toContain('Before you consider the work done');
                // Two short rules must not arrive as kilobytes.
                expect(result.stdout.length).toBeLessThan(400);
            });
        });
    });

    describe('search', () => {
        it('marks weak matches without dropping them, and names the path each result governs', async () => {
            await withProject(
                {
                    '_.hint': '# rule Root\n\nroot knowledge about deployment\n',
                    'src/auth/_.hint': '# rule Auth\n\nservice account tokens are Ed25519 signed\n',
                },
                async (dir) => {
                    const strong = JSON.parse((await runCli(['search', 'service', 'account', 'tokens'], dir)).stdout);
                    expect(strong.results[0].target).toBe(Path.join('src', 'auth'));
                    expect(strong.results[0].weak).toBe(false);

                    // A query whose terms only partly land still returns its hits, flagged rather than hidden.
                    const weak = await runCli(['search', 'deployment', 'tokens', 'kubernetes', 'ingress'], dir);
                    const parsed = JSON.parse(weak.stdout);

                    expect(parsed.count).toBeGreaterThan(0);
                    expect(parsed.results.some((result: { weak: boolean }) => result.weak)).toBe(true);
                },
            );
        });

        it('says so on stderr when nothing matched strongly', async () => {
            await withProject(
                {
                    '_.hint': '# rule Root\n\nroot knowledge about deployment\n',
                    'src/auth/_.hint': '# rule Auth\n\nservice account tokens are Ed25519 signed\n',
                },
                async (dir) => {
                    const result = await runCli(['search', 'deployment', 'kubernetes', 'ingress', 'helm'], dir);

                    expect(result.stderr).toContain('no strong match');
                    expect(JSON.parse(result.stdout).count).toBeGreaterThan(0);
                },
            );
        });
    });

    describe('authoring', () => {
        it('tells the agent it may read .hint files it is editing', async () => {
            await withProject(FOLDER_ONLY, async (dir) => {
                await runCli(['apply'], dir);

                const agents = await FsPromises.readFile(Path.join(dir, 'AGENTS.md'), 'utf8');

                // The old block forbade reading .hint outright, which made editing one impossible.
                expect(agents).toContain('You may read `.hint` files directly whenever you are writing or editing them');
                expect(agents).not.toMatch(/Do not read `\.hint` files directly unless/);
            });
        });

        it('keeps the keyword table well formed even for multi-line descriptions', async () => {
            await withProject(
                {
                    'book/thing.md': '---\ndescription: |\n    First line of the summary.\n    Example:\n        # thing Name\n        body\n---\n<thing/>\n',
                    '_.hint': '# rule Root\n\nroot\n',
                },
                async (dir) => {
                    const result = await runCli(['author'], dir);
                    const tableRows = result.stdout.split('\n').filter((line) => line.startsWith('| '));

                    // Every row must be a single line with the same cell count — embedded newlines used to
                    // terminate a row mid-cell, producing something no Markdown parser reads as a table.
                    expect(tableRows.length).toBeGreaterThan(2);

                    for (const row of tableRows) {
                        expect(row.endsWith('|')).toBe(true);
                        expect(row.split('|').length).toBe(5);
                    }

                    expect(result.stdout).toContain('First line of the summary.');
                    // The full text, examples included, still reaches the author — below the table.
                    expect(result.stdout).toContain('### thing');
                },
            );
        });
    });
});

describe('isBroadCompile', () => {
    it('estimates tokens at roughly four characters each', () => {
        expect(estimateTokens(0)).toBe(0);
        expect(estimateTokens(4000)).toBe(1000);
    });

    it('flags a run at or above the target-count threshold', () => {
        expect(isBroadCompile(BROAD_TARGET_COUNT - 1, 0)).toBe(false);
        expect(isBroadCompile(BROAD_TARGET_COUNT, 0)).toBe(true);
    });

    it('flags a run at or above the token estimate even with few targets', () => {
        // token estimate = length / 4; the threshold is 20,000 tokens, i.e. 80,000 characters
        expect(isBroadCompile(1, 79_000)).toBe(false);
        expect(isBroadCompile(1, 80_000)).toBe(true);
    });

    it('stays quiet for a small, short compile', () => {
        expect(isBroadCompile(3, 5_000)).toBe(false);
    });
});
