import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

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

        it('wraps the output with the requested mode header', async () => {
            const result = await runCli([
                '--mode',
                'fix',
                'src/payment.ts.hint',
            ]);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout.startsWith('You are a senior software engineer fixing defects')).toBe(true);
        });

        it('normalizes a folder path to its folder hint', async () => {
            const result = await runCli(['src']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('<folder_context path="src">');
            expect(result.stdout).not.toContain('<file_context');
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

        it('fails on unresolvable paths with --dry-run', async () => {
            const result = await runCli([
                '--dry-run',
                'no/such/path.hint',
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).not.toBe('');
        });
    });

    describe('config', () => {
        it('reports an existing config and points to instruct', async () => {
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

    describe('instruct', () => {
        it('prints the agent prompt for an initialized project', async () => {
            const result = await runCli(['instruct']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('AGENTS.md and CLAUDE.md');
            expect(result.stdout).toContain('<hint>');
            expect(result.stdout).toContain('</hint>');
            expect(result.stdout).toContain('<system_instructions_from_hintbook-testdata>');
            expect(result.stdout).toContain('</system_instructions_from_hintbook-testdata>');
            expect(result.stdout).toContain('<available_hint_modes>');
            expect(result.stdout).toContain('read it before running HINT');
            expect(result.stdout).toContain('hint --mode <mode> <path...>');
            expect(result.stdout).toContain('Mode: review');
        });

        it('fails outside an initialized project', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['instruct'], temporaryPath);

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('No hint.yml found');
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
            await FsPromises.writeFile(
                Path.join(temporaryPath, 'book', '__mode__.review.md'),
                '---\nname: Review\n---\nUse review mode for implementation audits.\n',
                'utf8',
            );

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
                    expect(content).toContain('<system_instructions_from_demo>');
                    expect(content).toContain('<available_hint_modes>');
                    expect(content).toContain('hint --mode <mode> <path...>');
                    expect(content).toContain('Use review mode for implementation audits.');
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

    describe('list', () => {
        it('lists registered hintbooks with their status', async () => {
            const result = await runCli(['list']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('file://../hintbook');
            expect(result.stdout).toContain('installed');
        });

        it('shows version unknown for hintbooks without package.json', async () => {
            const result = await runCli(['list']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('(version unknown)');
        });

        it('shows detailed path information with --verbose', async () => {
            const result = await runCli([
                'list',
                '--verbose',
            ]);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('file://../hintbook');
            expect(result.stdout).toContain('installed');
            expect(result.stdout).toContain('hintbook');
        });

        it('shows help text for list command', async () => {
            const result = await runCli([
                'list',
                '--help',
            ]);

            expect(result.stdout + result.stderr).toContain('Usage: hint list');
            expect(result.stdout + result.stderr).toContain('--verbose');
            expect(result.stdout + result.stderr).toContain('List hintbooks');
        });

        it('shows message when no hintbooks are registered', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                await FsPromises.writeFile(Path.join(temporaryPath, 'hint.yml'), 'name: empty-project\nbooks: []\n', 'utf8');

                const result = await runCli(['list'], temporaryPath);

                expect(result.exitCode).toBeUndefined();
                expect(result.stdout).toContain('No hintbooks registered');
                expect(result.stdout).toContain('hint add');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('reports not found status for missing hintbooks', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                await FsPromises.writeFile(Path.join(temporaryPath, 'hint.yml'), 'name: temp\nbooks:\n  - file://nonexistent-book\n', 'utf8');

                const result = await runCli(['list'], temporaryPath);

                expect(result.exitCode).toBeUndefined();
                expect(result.stdout).toContain('nonexistent-book');
                expect(result.stdout).toContain('not found');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('fails outside an initialized project', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['list'], temporaryPath);

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('No hint.yml found');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });
    });

    describe('modes', () => {
        it('lists modes from registered hintbooks', async () => {
            const result = await runCli(['modes']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('mode');
            expect(result.stdout).toContain('review');
            expect(result.stdout).toContain('Review');
            expect(result.stdout).toContain('Audit an implementation against its HINT specification.');
            expect(result.stdout).toContain('fix');
        });

        it('shows help text for modes command', async () => {
            const result = await runCli([
                'modes',
                '--help',
            ]);

            expect(result.stdout + result.stderr).toContain('Usage: hint modes');
            expect(result.stdout + result.stderr).toContain('List modes');
        });

        it('fails outside an initialized project', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['modes'], temporaryPath);

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('No hint.yml found');
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
            expect(result.stdout).toContain('Authoring HINT specification files');
            expect(result.stdout).toContain('src/payment.ts');
            expect(result.stdout).toContain('Keyword vocabulary');
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
            expect(result.stdout).toContain('Authoring HINT specification files');
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
        it('prints usage with all commands', async () => {
            const result = await runCli(['help']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('Usage:');

            for (const command of [
                'config',
                'instruct',
                'apply',
                'add',
                'remove',
                'list',
                'modes',
                'author',
                'version',
                'help',
            ]) {
                expect(result.stdout).toContain(command);
            }

            expect(result.stdout).toContain('Examples:');
        });
    });
});
