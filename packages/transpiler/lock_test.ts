import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import {
    booksMatch,
    hashFileHints,
    hashHint,
    loadLock,
    type LockData,
    pruneFreshHints,
    saveLock,
    selectFreshTargets,
} from './lock.js';
import type { HintData } from './parser.js';

function block(keyword: string, name = '', body = '', children: HintData[] = [], level = 1): HintData {
    return { level, keyword, id: '', name, body, children };
}

function file(name: string, body = '', children: HintData[] = []): HintData {
    return { level: 0, keyword: RUNNING_FILE, id: '', name, body, children };
}

function folder(name: string, children: HintData[] = []): HintData {
    return { level: 0, keyword: RUNNING_FOLDER, id: '', name, body: '', children };
}

// root `_.hint` carries a baseline block, then a `src` folder with two files.
function sampleTree(): HintData[] {
    return [
        folder('.', [
            block('lang', 'TypeScript', 'Node.js baseline.'),
            folder('src', [
                file('src/a.ts', 'Implements A.'),
                file('src/b.ts', 'Implements B.'),
            ]),
        ]),
    ];
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-lock-'));

    try {
        await run(dir);
    } finally {
        await FsPromises.rm(dir, { recursive: true, force: true });
    }
}

describe('lock', () => {
    describe('hashHint', () => {
        it('is deterministic for structurally identical blocks', () => {
            expect(hashHint(block('func', 'login', 'body'))).toBe(hashHint(block('func', 'login', 'body')));
        });

        it('changes when the body changes', () => {
            expect(hashHint(block('func', 'login', 'a'))).not.toBe(hashHint(block('func', 'login', 'b')));
        });

        it('changes when a child changes', () => {
            const base = block('func', 'login', '', [block('arg', 'inputs', 'x')]);
            const changed = block('func', 'login', '', [block('arg', 'inputs', 'y')]);

            expect(hashHint(base)).not.toBe(hashHint(changed));
        });
    });

    describe('hashFileHints', () => {
        it('produces one effective hash per file target', () => {
            const hashes = hashFileHints(sampleTree());

            expect(hashes.map((h) => h.name)).toEqual([
                'src/a.ts',
                'src/b.ts',
            ]);
        });

        it('reflects an ancestor change in every file beneath it', () => {
            const before = hashFileHints(sampleTree());

            const tree = sampleTree();
            (tree[0]!.children[0] as HintData).body = 'Changed baseline rule.';
            const after = hashFileHints(tree);

            expect(after[0]!.hash).not.toBe(before[0]!.hash);
            expect(after[1]!.hash).not.toBe(before[1]!.hash);
        });

        it('isolates a file-only change to that file', () => {
            const before = hashFileHints(sampleTree());

            const tree = sampleTree();
            ((tree[0]!.children[1] as HintData).children[0] as HintData).body = 'Implements A differently.';
            const after = hashFileHints(tree);

            expect(after[0]!.hash).not.toBe(before[0]!.hash);
            expect(after[1]!.hash).toBe(before[1]!.hash);
        });
    });

    describe('pruneFreshHints', () => {
        it('keeps only stale files with their ancestor context', () => {
            const pruned = pruneFreshHints(sampleTree(), new Set([
                'src/a.ts',
            ]));

            const src = pruned[0]!.children.find((c) => c.keyword === RUNNING_FOLDER)!;
            const files = src.children.filter((c) => c.keyword === RUNNING_FILE).map((c) => c.name);

            expect(files).toEqual([
                'src/a.ts',
            ]);
            // root baseline block is retained because a stale file lives beneath it
            expect(pruned[0]!.children.some((c) => c.keyword === 'lang')).toBe(true);
        });

        it('drops the whole tree when nothing is stale', () => {
            expect(pruneFreshHints(sampleTree(), new Set())).toEqual([]);
        });
    });

    describe('booksMatch', () => {
        it('matches identical fingerprints and rejects differing ones', () => {
            expect(booksMatch({ a: '1' }, { a: '1' })).toBe(true);
            expect(booksMatch({ a: '1' }, { a: '2' })).toBe(false);
            expect(booksMatch({ a: '1' }, { a: '1', b: '1' })).toBe(false);
        });
    });

    describe('saveLock / loadLock', () => {
        it('round-trips a lock file', async () => {
            await withTempDir(async (dir) => {
                const lock: LockData = {
                    version: 1,
                    books: { 'npm://book': '1.0.0' },
                    files: { 'src/b.ts': { hash: 'h2' }, 'src/a.ts': { hash: 'h1' } },
                };

                await saveLock(dir, lock);
                const loaded = await loadLock(dir);

                expect(loaded).toEqual(lock);
            });
        });

        it('returns null when no lock exists', async () => {
            await withTempDir(async (dir) => {
                expect(await loadLock(dir)).toBeNull();
            });
        });
    });

    describe('selectFreshTargets', () => {
        it('marks a target fresh only when the hash matches and the file exists', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'code', 'utf8');

                const fileHashes = [
                    { name: 'a.ts', hash: 'h1' }, // matches lock + file on disk -> fresh
                    { name: 'b.ts', hash: 'h2' }, // matches lock but no file on disk -> stale
                    { name: 'c.ts', hash: 'hX' }, // hash differs from lock -> stale
                ];

                const lock: LockData = {
                    version: 1,
                    books: {},
                    files: { 'a.ts': { hash: 'h1' }, 'b.ts': { hash: 'h2' }, 'c.ts': { hash: 'h3' } },
                };

                const fresh = await selectFreshTargets(dir, fileHashes, lock, {});

                expect([...fresh]).toEqual([
                    'a.ts',
                ]);
            });
        });

        it('marks everything stale when the books fingerprint differs', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'code', 'utf8');

                const fresh = await selectFreshTargets(
                    dir,
                    [{ name: 'a.ts', hash: 'h1' }],
                    { version: 1, books: { book: '1.0.0' }, files: { 'a.ts': { hash: 'h1' } } },
                    { book: '2.0.0' },
                );

                expect(fresh.size).toBe(0);
            });
        });
    });
});
