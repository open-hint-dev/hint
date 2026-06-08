/// <reference types="node" />
/// <reference types="vitest/globals" />

import { ErrorCode, create } from '@openhint/transpiler';

let exitSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let origArgv: string[];

beforeEach(() => {
    origArgv = process.argv;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.resetModules();
});

afterEach(() => {
    process.argv = origArgv;
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
});

async function runCli(argv: string[]): Promise<void> {
    process.argv = ['node', 'hint', ...argv];
    await import('./index.js');
    await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('parseArgv', () => {
    it('treats the first token as a file path when it is not a known command', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi.fn().mockResolvedValue(''),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['foo.hint']);

        const { executeDefault } = await import('./commands/default.js');
        expect(vi.mocked(executeDefault)).toHaveBeenCalledWith(['foo.hint']);
    });

    it('routes "validate" as command with remaining args as filePaths', async () => {
        vi.doMock('./commands/validate.js', () => ({
            executeValidate: vi.fn().mockResolvedValue(''),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['validate', 'a.hint', 'b.hint']);

        const { executeValidate } = await import('./commands/validate.js');
        expect(vi.mocked(executeValidate)).toHaveBeenCalledWith(['a.hint', 'b.hint']);
    });

    it('routes "claude" as command', async () => {
        vi.doMock('./commands/claude.js', () => ({
            executeClaude: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['claude', 'a.hint']);

        const { executeClaude } = await import('./commands/claude.js');
        expect(vi.mocked(executeClaude)).toHaveBeenCalledWith(['a.hint']);
    });

    it('routes "codex" as command', async () => {
        vi.doMock('./commands/codex.js', () => ({
            executeCodex: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['codex', 'a.hint']);

        const { executeCodex } = await import('./commands/codex.js');
        expect(vi.mocked(executeCodex)).toHaveBeenCalledWith(['a.hint']);
    });

    it('routes "config" as command with no file paths', async () => {
        vi.doMock('./commands/config.js', () => ({
            executeConfig: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));

        await runCli(['config']);

        const { executeConfig } = await import('./commands/config.js');
        expect(vi.mocked(executeConfig)).toHaveBeenCalledWith(undefined);
    });
});

describe('run: usage validation', () => {
    it('prints usage and exits 1 when no args and no command', async () => {
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli([]);

        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('prints usage and exits 1 when config is given more than one path', async () => {
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));

        await runCli(['config', 'path/one', 'path/two']);

        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

describe('run: dispatch and output', () => {
    it('writes result + newline to stdout for non-empty default output', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi.fn().mockResolvedValue('the prompt'),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['a.hint']);

        expect(stdoutSpy).toHaveBeenCalledWith('the prompt\n');
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 0 without writing stdout when default output is empty', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi.fn().mockResolvedValue(''),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['a.hint']);

        expect(stdoutSpy).not.toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('writes result + newline to stdout for non-empty validate output', async () => {
        vi.doMock('./commands/validate.js', () => ({
            executeValidate: vi.fn().mockResolvedValue('validation result'),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['validate', 'a.hint']);

        expect(stdoutSpy).toHaveBeenCalledWith('validation result\n');
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 0 without writing stdout when validate output is empty', async () => {
        vi.doMock('./commands/validate.js', () => ({
            executeValidate: vi.fn().mockResolvedValue(''),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['validate', 'a.hint']);

        expect(stdoutSpy).not.toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 0 after claude command', async () => {
        vi.doMock('./commands/claude.js', () => ({
            executeClaude: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['claude', 'a.hint']);

        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 0 after codex command', async () => {
        vi.doMock('./commands/codex.js', () => ({
            executeCodex: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['codex', 'a.hint']);

        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 0 after config command', async () => {
        vi.doMock('./commands/config.js', () => ({
            executeConfig: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('./commands/default.js', () => ({ executeDefault: vi.fn() }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));

        await runCli(['config']);

        expect(exitSpy).toHaveBeenCalledWith(0);
    });
});

describe('run: error handling', () => {
    it('writes "Reference error: <msg>" and exits 1 for REFERENCE_ERROR', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi.fn().mockRejectedValue(create(ErrorCode.REFERENCE_ERROR, 'missing ref')),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['a.hint']);

        expect(stderrSpy).toHaveBeenCalledWith('Reference error: missing ref\n');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('writes "Parse error: <msg>" and exits 1 for PARSE_ERROR', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi.fn().mockRejectedValue(create(ErrorCode.PARSE_ERROR, 'invalid syntax')),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['a.hint']);

        expect(stderrSpy).toHaveBeenCalledWith('Parse error: invalid syntax\n');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('writes "IO error: <msg>" and exits 1 for IO_ERROR', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi.fn().mockRejectedValue(create(ErrorCode.IO_ERROR, 'file not found')),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['a.hint']);

        expect(stderrSpy).toHaveBeenCalledWith('IO error: file not found\n');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('writes String(error) and exits 1 for UNKNOWN_ERROR and other values', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi
                .fn()
                .mockRejectedValue(create(ErrorCode.UNKNOWN_ERROR, 'unexpected issue')),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['a.hint']);

        expect(stderrSpy).toHaveBeenCalledWith(
            expect.stringMatching(/unexpected issue/),
        );
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('writes String(error) and exits 1 for a plain Error', async () => {
        vi.doMock('./commands/default.js', () => ({
            executeDefault: vi.fn().mockRejectedValue(new Error('plain error')),
        }));
        vi.doMock('./commands/validate.js', () => ({ executeValidate: vi.fn() }));
        vi.doMock('./commands/claude.js', () => ({ executeClaude: vi.fn() }));
        vi.doMock('./commands/codex.js', () => ({ executeCodex: vi.fn() }));
        vi.doMock('./commands/config.js', () => ({ executeConfig: vi.fn() }));

        await runCli(['a.hint']);

        expect(stderrSpy).toHaveBeenCalledWith('Error: plain error\n');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
