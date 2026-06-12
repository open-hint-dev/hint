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
    process.argv = ['node', 'hint', ...args];
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
        it('prints the agent prompt for an initialized project', async () => {
            const result = await runCli(['config']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('AGENTS.md and CLAUDE.md');
            expect(result.stdout).toContain('<hint>');
            expect(result.stdout).toContain('</hint>');
            expect(result.stdout).toContain('<system_instructions_from_hintbook-testdata>');
            expect(result.stdout).toContain('</system_instructions_from_hintbook-testdata>');
        });

        it('creates hint.yml in the current folder and proceeds when none exists', async () => {
            const temporaryPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-cli-test-'));

            try {
                const result = await runCli(['config'], temporaryPath);

                expect(result.exitCode).toBeUndefined();
                expect(result.stderr).toContain('Created hint.yml');
                expect(result.stdout).toContain('<hint>');

                const configContent = await FsPromises.readFile(Path.join(temporaryPath, 'hint.yml'), 'utf8');
                expect(configContent).toContain(`name: ${Path.basename(temporaryPath)}`);
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
                const addResult = await runCli([
                    'add',
                    'file://book',
                ], temporaryPath);

                expect(addResult.exitCode).toBeUndefined();
                expect(addResult.stderr).toContain('Installed file://book');
                expect(addResult.stdout).toContain('<hint>');
                expect(await FsPromises.readFile(Path.join(temporaryPath, 'hint.yml'), 'utf8')).toContain('file://book');

                const removeResult = await runCli([
                    'remove',
                    'book',
                ], temporaryPath);

                expect(removeResult.exitCode).toBeUndefined();
                expect(removeResult.stderr).toContain('Removed file://book');
                expect(removeResult.stdout).toContain('<hint>');
                expect(await FsPromises.readFile(Path.join(temporaryPath, 'hint.yml'), 'utf8')).not.toContain('file://book');
            } finally {
                await FsPromises.rm(temporaryPath, { recursive: true, force: true });
            }
        });

        it('fails to remove an unregistered hintbook', async () => {
            const temporaryPath = await makeProject();

            try {
                const result = await runCli([
                    'remove',
                    'no-such-book',
                ], temporaryPath);

                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('Hintbook not registered');
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
    });

    describe('help', () => {
        it('prints usage with all commands', async () => {
            const result = await runCli(['help']);

            expect(result.exitCode).toBeUndefined();
            expect(result.stdout).toContain('Usage:');

            for (const command of [
                'config',
                'add',
                'remove',
                'version',
                'help',
            ]) {
                expect(result.stdout).toContain(command);
            }

            expect(result.stdout).toContain('Examples:');
        });
    });
});
