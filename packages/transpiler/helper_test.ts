import * as Path from 'node:path';

import { interpolate, isGlobPattern, isInsideProject, toPortablePath } from './helper.js';

describe('helper', () => {
    describe('interpolate', () => {
        it('replaces every occurrence of each placeholder', () => {
            expect(interpolate('{name}: {body} ({name})', { name: 'X', body: 'b' })).toBe('X: b (X)');
        });

        it('leaves unknown placeholders untouched', () => {
            expect(interpolate('{name} {unknown}', { name: 'X' })).toBe('X {unknown}');
        });

        it('returns empty template as is', () => {
            expect(interpolate('', { name: 'X' })).toBe('');
        });
    });

    describe('isGlobPattern', () => {
        it('detects glob characters', () => {
            expect(isGlobPattern('src/*.hint')).toBe(true);
            expect(isGlobPattern('src/**/file.hint')).toBe(true);
            expect(isGlobPattern('file?.hint')).toBe(true);
            expect(isGlobPattern('{a,b}.hint')).toBe(true);
        });

        it('rejects plain paths', () => {
            expect(isGlobPattern('src/payment.ts.hint')).toBe(false);
        });
    });

    it('rejects sibling-prefix escapes and normalizes Windows keys', () => {
        expect(isInsideProject('/tmp/repo', '/tmp/repo-extra/a.ts')).toBe(false);
        expect(isInsideProject('/tmp/repo', '/tmp/repo/src/a.ts')).toBe(true);
        expect(toPortablePath(Path.win32.join('src', 'auth', 'token.ts'))).toBe('src/auth/token.ts');
    });
});
