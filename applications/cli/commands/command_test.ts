/// <reference types="node" />
/// <reference types="vitest/globals" />

import { EventEmitter } from 'node:events';

import { ErrorCode, is } from '@openhint/transpiler';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('@openhint/transpiler', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@openhint/transpiler')>();
    return { ...actual, parse: vi.fn(), compile: vi.fn() };
});

import { spawn } from 'node:child_process';
import { compile, parse } from '@openhint/transpiler';

import { compileFiles, spawnAgent } from './command';

function makeMockProcess() {
    const procEmitter = new EventEmitter();
    const stdinEmitter = new EventEmitter();
    const writeFn = vi.fn(
        (_data: string, _enc: string, cb?: (err?: Error | null) => void) => {
            cb?.(null);
            return true;
        },
    );
    const endFn = vi.fn();
    const stdin = Object.assign(stdinEmitter, { write: writeFn, end: endFn });
    const proc = Object.assign(procEmitter, { stdin });
    return { proc, stdin, writeFn, endFn };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('compileFiles', () => {
    it('builds CompilerInput from parse result and returns compile output', async () => {
        const parseResult = {
            projectRoot: '/repo',
            targetPaths: ['/repo/src/foo.ts.hint'],
            config: { ignore: ['dist/'] },
            blocks: [{ directive: 'entity', name: 'Foo', body: '', sourcePath: '/repo/src/foo.ts.hint', sourceKind: 'file' as const }],
            reads: new Map(),
        };
        vi.mocked(parse).mockResolvedValue(parseResult as any);
        vi.mocked(compile).mockReturnValue('compiled output');

        const result = await compileFiles(['/repo/src/foo.ts.hint']);

        expect(parse).toHaveBeenCalledWith(['/repo/src/foo.ts.hint']);
        expect(compile).toHaveBeenCalledWith({
            projectRoot: '/repo',
            targetPaths: ['/repo/src/foo.ts.hint'],
            ignore: ['dist/'],
            blocks: parseResult.blocks,
            reads: parseResult.reads,
        });
        expect(result).toBe('compiled output');
    });

    it('returns empty string when compile returns empty', async () => {
        vi.mocked(parse).mockResolvedValue({
            projectRoot: '/repo',
            targetPaths: [],
            config: { ignore: [] },
            blocks: [],
            reads: new Map(),
        } as any);
        vi.mocked(compile).mockReturnValue('');

        const result = await compileFiles(['/repo/src/foo.ts.hint']);

        expect(result).toBe('');
    });
});

describe('spawnAgent', () => {
    it('calls spawn with correct binary, args, and stdio', async () => {
        const { proc } = makeMockProcess();
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', ['--flag'], 'hello');
        proc.emit('close', 0, null);
        await promise;

        expect(spawn).toHaveBeenCalledWith('mybinary', ['--flag'], {
            stdio: ['pipe', 'inherit', 'inherit'],
        });
    });

    it('resolves when process exits with code 0', async () => {
        const { proc } = makeMockProcess();
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'hello');
        proc.emit('close', 0, null);

        await expect(promise).resolves.toBeUndefined();
    });

    it('stdin write receives the prompt in UTF-8', async () => {
        const { proc, writeFn } = makeMockProcess();
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'my prompt');
        proc.emit('close', 0, null);
        await promise;

        expect(writeFn).toHaveBeenCalledWith('my prompt', 'utf8', expect.any(Function));
    });

    it('calls stdin.end after successful write', async () => {
        const { proc, endFn } = makeMockProcess();
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'prompt');
        proc.emit('close', 0, null);
        await promise;

        expect(endFn).toHaveBeenCalled();
    });

    it('rejects with ENOENT message when binary is not found', async () => {
        const { proc, writeFn } = makeMockProcess();
        writeFn.mockImplementation(() => true); // don't call callback
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('missing-binary', [], 'prompt');
        const enoentErr = Object.assign(new Error('spawn missing-binary ENOENT'), { code: 'ENOENT' });
        proc.emit('error', enoentErr);

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "Agent binary not found: 'missing-binary'. Make sure it is installed and on PATH.",
        );
    });

    it('rejects with generic spawn error message for other process errors', async () => {
        const { proc, writeFn } = makeMockProcess();
        writeFn.mockImplementation(() => true);
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('flaky-binary', [], 'prompt');
        const spawnErr = Object.assign(new Error('some other error'), { code: 'EACCES' });
        proc.emit('error', spawnErr);

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "Failed to spawn 'flaky-binary': some other error",
        );
    });

    it('rejects with stdin error message when stdin emits an error event', async () => {
        const { proc, stdin, writeFn } = makeMockProcess();
        writeFn.mockImplementation(() => true);
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'prompt');
        stdin.emit('error', new Error('pipe broke'));

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "Failed to write prompt to 'mybinary': pipe broke",
        );
    });

    it('rejects with stdin error message when write callback provides an error', async () => {
        const { proc, writeFn } = makeMockProcess();
        writeFn.mockImplementation((_data: string, _enc: string, cb?: (err?: Error | null) => void) => {
            cb?.(new Error('write failed'));
            return true;
        });
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'prompt');

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "Failed to write prompt to 'mybinary': write failed",
        );
    });

    it('rejects with non-zero exit code message', async () => {
        const { proc } = makeMockProcess();
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'prompt');
        proc.emit('close', 42, null);

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "'mybinary' exited with code 42.",
        );
    });

    it('rejects with signal message when code is null and signal is provided', async () => {
        const { proc, writeFn } = makeMockProcess();
        writeFn.mockImplementation(() => true);
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'prompt');
        proc.emit('close', null, 'SIGTERM');

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "'mybinary' exited due to signal SIGTERM.",
        );
    });

    it('uses "unknown" when both code and signal are null', async () => {
        const { proc, writeFn } = makeMockProcess();
        writeFn.mockImplementation(() => true);
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'prompt');
        proc.emit('close', null, null);

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "'mybinary' exited due to signal unknown.",
        );
    });

    it('settled flag prevents second rejection when error fires after close', async () => {
        const { proc, writeFn } = makeMockProcess();
        writeFn.mockImplementation(() => true);
        vi.mocked(spawn).mockReturnValue(proc as any);

        const promise = spawnAgent('mybinary', [], 'prompt');
        const enoentErr = Object.assign(new Error('not found'), { code: 'ENOENT' });
        proc.emit('error', enoentErr);
        proc.emit('close', 1, null);

        await expect(promise).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.IO_ERROR) &&
            (e as Error).message === "Agent binary not found: 'mybinary'. Make sure it is installed and on PATH.",
        );
    });
});
