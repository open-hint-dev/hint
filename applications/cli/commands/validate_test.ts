/// <reference types="vitest/globals" />

import { ErrorCode, create, header, is } from '@openhint/transpiler';

vi.mock('./command.js', () => ({
    compileFiles: vi.fn(),
}));

import { compileFiles } from './command.js';

import { VALIDATION_HEADER, executeValidate } from './validate';

afterEach(() => {
    vi.clearAllMocks();
});

describe('executeValidate', () => {
    it('returns an empty string when compileFiles returns empty', async () => {
        vi.mocked(compileFiles).mockResolvedValue('');

        const result = await executeValidate(['a.hint']);

        expect(result).toBe('');
    });

    it('replaces the transpiler header with VALIDATION_HEADER', async () => {
        const body = '\n\nbody content here';
        vi.mocked(compileFiles).mockResolvedValue(header + body);

        const result = await executeValidate(['a.hint']);

        expect(result.startsWith(VALIDATION_HEADER)).toBe(true);
        expect(result).not.toContain(header);
    });

    it('inserts \\n\\n--- separator between VALIDATION_HEADER and body', async () => {
        const body = '\n\nbody content here';
        vi.mocked(compileFiles).mockResolvedValue(header + body);

        const result = await executeValidate(['a.hint']);

        expect(result).toBe(VALIDATION_HEADER + '\n\n---' + body);
    });

    it('preserves the compiled body after the original header', async () => {
        const body = '\n\n## Module: Foo\n\nSome content.';
        vi.mocked(compileFiles).mockResolvedValue(header + body);

        const result = await executeValidate(['a.hint']);

        expect(result).toContain('## Module: Foo');
        expect(result).toContain('Some content.');
    });

    it('does not include the original implementation directive in the output', async () => {
        const body = '\n\nbody';
        vi.mocked(compileFiles).mockResolvedValue(header + body);

        const result = await executeValidate(['a.hint']);

        expect(result).not.toContain('senior software engineer implementing');
    });

    it('throws UNKNOWN_ERROR when compiled prompt does not start with transpiler header', async () => {
        vi.mocked(compileFiles).mockResolvedValue('unexpected prefix' + header);

        await expect(executeValidate(['a.hint'])).rejects.toSatisfy((e: unknown) =>
            is(e, ErrorCode.UNKNOWN_ERROR) &&
            (e as Error).message === 'Compiled prompt did not start with the transpiler header.',
        );
    });

    it('propagates errors thrown by compileFiles', async () => {
        const err = create(ErrorCode.PARSE_ERROR, 'parse error');
        vi.mocked(compileFiles).mockRejectedValue(err);

        await expect(executeValidate(['a.hint'])).rejects.toSatisfy((e: unknown) => is(e, ErrorCode.PARSE_ERROR));
    });
});
