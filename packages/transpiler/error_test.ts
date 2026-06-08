/// <reference types="node" />
/// <reference types="vitest/globals" />

import { create, ErrorCode, fire, is, log, serialize, wrap } from './error';

describe('error', () => {
    it('creates a native error with structured context', () => {
        const before = Date.now();
        const cause = new Error('source');
        const error = create(ErrorCode.IO_ERROR, 'read failed', {
            cause,
            meta: {
                path: '/tmp/input.hint',
            },
        });

        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({
            cause,
            code: ErrorCode.IO_ERROR,
            message: 'read failed',
            meta: {
                path: '/tmp/input.hint',
            },
        });
        expect(error.stack).toContain('read failed');
        expect(error.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('returns an existing app error and merges catch context', () => {
        const error = create(ErrorCode.PARSE_ERROR, 'invalid input', {
            meta: {
                line: 4,
                token: 'old',
            },
        });

        const wrapped = wrap(error, ErrorCode.UNKNOWN_ERROR, {
            file: 'input.hint',
            token: 'new',
        });

        expect(wrapped).toBe(error);
        expect(wrapped.meta).toEqual({
            file: 'input.hint',
            line: 4,
            token: 'new',
        });
        expect(wrapped.code).toBe(ErrorCode.PARSE_ERROR);
    });

    it('wraps any caught value with a useful message', () => {
        const raw = {
            toString: () => 'dependency failed',
        };
        const error = wrap(raw, ErrorCode.REFERENCE_ERROR, {
            name: 'User',
        });

        expect(error.message).toBe('dependency failed');
        expect(error.cause).toBe(raw);
        expect(error.meta).toEqual({
            name: 'User',
        });
    });

    it('checks app errors and optional codes', () => {
        const error = create(ErrorCode.PARSE_ERROR, 'invalid input');

        expect(is(error)).toBe(true);
        expect(is(error, ErrorCode.PARSE_ERROR)).toBe(true);
        expect(is(error, ErrorCode.IO_ERROR)).toBe(false);
        expect(is(new Error('plain'))).toBe(false);
        expect(is({ code: ErrorCode.PARSE_ERROR })).toBe(false);
    });

    it('serializes the cause as a string', () => {
        const error = create(ErrorCode.IO_ERROR, 'read failed', {
            cause: new Error('permission denied'),
            meta: {
                path: '/tmp/input.hint',
            },
        });

        expect(serialize(error)).toEqual({
            cause: 'Error: permission denied',
            code: ErrorCode.IO_ERROR,
            message: 'read failed',
            meta: {
                path: '/tmp/input.hint',
            },
            stack: error.stack,
            timestamp: error.timestamp,
        });
    });

    it('logs one serialized line at the requested level', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const error = create(ErrorCode.UNKNOWN_ERROR, 'unexpected');

        log(error, 'debug');

        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toMatch(/^\[.+] \[DEBUG] \{"code":"UNKNOWN_ERROR","message":"unexpected",/);
    });

    it('creates and throws an app error', () => {
        expect(() =>
            fire(ErrorCode.PARSE_ERROR, 'invalid input', {
                meta: {
                    line: 7,
                },
            }),
        ).toThrow(
            expect.objectContaining({
                code: ErrorCode.PARSE_ERROR,
                meta: {
                    line: 7,
                },
            }),
        );
    });
});
