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
            expect(result.stdout).toContain('<instruction>');
        });
    });
});
