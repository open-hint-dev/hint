/// <reference types="vitest/globals" />

import { ErrorCode, create, is } from '@openhint/transpiler';

vi.mock('./command.js', () => ({
    compileFiles: vi.fn(),
}));

import { compileFiles } from './command.js';

import { executeDefault } from './default';

afterEach(() => {
    vi.clearAllMocks();
});

describe('executeDefault', () => {
    it('calls compileFiles with the supplied filePaths', async () => {
        vi.mocked(compileFiles).mockResolvedValue('output');

        await executeDefault(['a.hint']);

        expect(compileFiles).toHaveBeenCalledWith(['a.hint']);
    });

    it('returns the compiled output directly', async () => {
        vi.mocked(compileFiles).mockResolvedValue('compiled result');

        const result = await executeDefault(['a.hint']);

        expect(result).toBe('compiled result');
    });

    it('returns an empty string when compileFiles returns empty', async () => {
        vi.mocked(compileFiles).mockResolvedValue('');

        const result = await executeDefault(['a.hint']);

        expect(result).toBe('');
    });

    it('propagates errors thrown by compileFiles', async () => {
        const err = create(ErrorCode.IO_ERROR, 'read failed');
        vi.mocked(compileFiles).mockRejectedValue(err);

        await expect(executeDefault(['a.hint'])).rejects.toSatisfy((e: unknown) => is(e, ErrorCode.IO_ERROR));
    });
});
