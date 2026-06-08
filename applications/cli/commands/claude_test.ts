/// <reference types="vitest/globals" />

import { ErrorCode, create, is } from '@openhint/transpiler';

vi.mock('./command.js', () => ({
    compileFiles: vi.fn(),
    spawnAgent: vi.fn(),
}));

import { compileFiles, spawnAgent } from './command.js';

import { executeClaude } from './claude';

afterEach(() => {
    vi.clearAllMocks();
});

describe('executeClaude', () => {
    it('calls compileFiles with the supplied filePaths', async () => {
        vi.mocked(compileFiles).mockResolvedValue('');

        await executeClaude(['a.hint', 'b.hint']);

        expect(compileFiles).toHaveBeenCalledWith(['a.hint', 'b.hint']);
    });

    it('does not call spawnAgent when compileFiles returns an empty string', async () => {
        vi.mocked(compileFiles).mockResolvedValue('');

        await executeClaude(['a.hint']);

        expect(spawnAgent).not.toHaveBeenCalled();
    });

    it('calls spawnAgent with claude --print and the compiled prompt', async () => {
        vi.mocked(compileFiles).mockResolvedValue('compiled prompt');
        vi.mocked(spawnAgent).mockResolvedValue(undefined);

        await executeClaude(['a.hint']);

        expect(spawnAgent).toHaveBeenCalledWith('claude', ['--print'], 'compiled prompt');
    });

    it('propagates errors thrown by compileFiles', async () => {
        const err = create(ErrorCode.PARSE_ERROR, 'bad parse');
        vi.mocked(compileFiles).mockRejectedValue(err);

        await expect(executeClaude(['a.hint'])).rejects.toSatisfy((e: unknown) => is(e, ErrorCode.PARSE_ERROR));
    });

    it('propagates errors thrown by spawnAgent', async () => {
        vi.mocked(compileFiles).mockResolvedValue('prompt');
        const err = create(ErrorCode.IO_ERROR, 'spawn failed');
        vi.mocked(spawnAgent).mockRejectedValue(err);

        await expect(executeClaude(['a.hint'])).rejects.toSatisfy((e: unknown) => is(e, ErrorCode.IO_ERROR));
    });
});
