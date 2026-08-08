import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import { type HintbookData, RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import type { HintData } from './parser.js';
import { collectSurfaces, countSurfaceKeywords, formatVerification, mentionsSurface, verifyTargets } from './verify.js';

function block(keyword: string, name = '', children: HintData[] = []): HintData {
    return { level: 1, keyword, id: '', name, body: '', children };
}

function file(name: string, children: HintData[] = []): HintData {
    return { level: 0, keyword: RUNNING_FILE, id: '', name, body: '', children };
}

function folder(name: string, children: HintData[] = []): HintData {
    return { level: 0, keyword: RUNNING_FOLDER, id: '', name, body: '', children };
}

// A hintbook whose `func` and `error` keywords are output surfaces, but `bad` is not.
function surfaceBook(): HintbookData {
    const instruction = (name: string, surface: boolean) => ({ name, content: '', metadata: { surface } });

    return {
        instructions: [
            instruction('func', true),
            instruction('error', true),
            instruction('bad', false),
        ],
    };
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-verify-'));

    try {
        await run(dir);
    } finally {
        await FsPromises.rm(dir, { recursive: true, force: true });
    }
}

describe('verify', () => {
    describe('mentionsSurface', () => {
        it('matches a declared name as a whole word', () => {
            expect(mentionsSurface('export function executeLogin() {}', 'executeLogin')).toBe(true);
            expect(mentionsSurface('const x = 1;', 'executeLogin')).toBe(false);
        });

        it('does not match a name embedded in a longer identifier', () => {
            expect(mentionsSurface('class LoginController {}', 'Login')).toBe(false);
        });

        it('is case-sensitive', () => {
            expect(mentionsSurface('executelogin', 'executeLogin')).toBe(false);
        });

        it('falls back to substring for names carrying punctuation', () => {
            expect(mentionsSurface('see Acme Corp. details', 'Acme Corp.')).toBe(true);
        });
    });

    describe('collectSurfaces', () => {
        it('collects only surface-flagged, named blocks', () => {
            const node = file('src/a.ts', [
                block('func', 'executeLogin'),
                block('error', 'InvalidCredentials'),
                block('bad', 'UserExistenceLeak'), // not a surface
                block('func', ''), // surface keyword but no name — unverifiable, skipped
            ]);

            expect(collectSurfaces(node, [surfaceBook()])).toEqual([
                { keyword: 'func', name: 'executeLogin' },
                { keyword: 'error', name: 'InvalidCredentials' },
            ]);
        });

        it('descends into nested blocks', () => {
            const node = file('src/a.ts', [block('func', 'outer', [block('error', 'InnerError')])]);

            expect(collectSurfaces(node, [surfaceBook()])).toEqual([
                { keyword: 'func', name: 'outer' },
                { keyword: 'error', name: 'InnerError' },
            ]);
        });
    });

    describe('countSurfaceKeywords', () => {
        it('counts surface-flagged keywords across books', () => {
            expect(countSurfaceKeywords([surfaceBook()])).toBe(2);
        });

        it('is zero when no keyword is flagged', () => {
            const plain: HintbookData = { instructions: [{ name: 'func', content: '' }] };

            expect(countSurfaceKeywords([plain])).toBe(0);
        });
    });

    describe('verifyTargets', () => {
        const hints = () => [folder('.', [file('src/a.ts', [block('func', 'executeLogin'), block('error', 'InvalidCredentials')])])];

        it('reports ok when every surface is present in the output', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.mkdir(Path.join(dir, 'src'));
                await FsPromises.writeFile(Path.join(dir, 'src/a.ts'), 'function executeLogin() { throw new InvalidCredentials(); }', 'utf8');

                const results = await verifyTargets(dir, hints(), [surfaceBook()]);

                expect(results).toEqual([{ name: 'src/a.ts', status: 'ok', checked: 2, missing: [] }]);
            });
        });

        it('reports the surfaces missing from the output', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.mkdir(Path.join(dir, 'src'));
                await FsPromises.writeFile(Path.join(dir, 'src/a.ts'), 'function executeLogin() {}', 'utf8');

                const results = await verifyTargets(dir, hints(), [surfaceBook()]);

                expect(results[0]!.status).toBe('missing-surfaces');
                expect(results[0]!.missing).toEqual([{ keyword: 'error', name: 'InvalidCredentials' }]);
            });
        });

        it('reports missing-output when the target does not exist', async () => {
            await withTempDir(async (dir) => {
                const results = await verifyTargets(dir, hints(), [surfaceBook()]);

                expect(results[0]!.status).toBe('missing-output');
            });
        });

        it('verifies vacuously when the file declares no surfaces', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'anything', 'utf8');
                const tree = [folder('.', [file('a.ts', [block('bad', 'Leak')])])];

                const results = await verifyTargets(dir, tree, [surfaceBook()]);

                expect(results).toEqual([{ name: 'a.ts', status: 'ok', checked: 0, missing: [] }]);
            });
        });
    });

    describe('formatVerification', () => {
        it('renders failures and omits ok files', () => {
            const text = formatVerification([
                { name: 'a.ts', status: 'ok', checked: 1, missing: [] },
                { name: 'b.ts', status: 'missing-output', checked: 0, missing: [] },
                { name: 'c.ts', status: 'missing-surfaces', checked: 2, missing: [{ keyword: 'func', name: 'doThing' }] },
            ]);

            expect(text).not.toContain('a.ts');
            expect(text).toContain('b.ts: output not found on disk');
            expect(text).toContain('c.ts: 1 declared surface(s) missing');
            expect(text).toContain('func doThing');
        });

        it('returns an empty string when everything verified', () => {
            expect(formatVerification([{ name: 'a.ts', status: 'ok', checked: 1, missing: [] }])).toBe('');
        });
    });
});
