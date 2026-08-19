import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import { type HintbookData, RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import {
    collectFileNodes,
    computeDrift,
    diffFileBlocks,
    effectiveFileHashes,
    formatDrift,
    hashFileBlocks,
    hashFileHints,
    hashFileVocab,
    hashHint,
    hashTargetFile,
    hashTargetFiles,
    loadLock,
    type LockData,
    pruneFreshHints,
    saveLock,
    selectFreshTargets,
} from './lock.js';
import type { HintData } from './parser.js';

// A hintbook where `func` renders a fixed template and `entity` another — used to prove a keyword's
// instruction content (not its version) drives lock invalidation.
function bookWith(funcContent: string, entityContent = '<entity>{name}</entity>'): HintbookData {
    return {
        instructions: [
            { name: 'func', content: funcContent },
            { name: 'entity', content: entityContent },
        ],
    };
}

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

    describe('hashFileBlocks', () => {
        it('keys blocks by their keyword/name path and localizes changes', () => {
            const node = file('src/a.ts', '', [
                block('func', 'login', 'body', [block('flow', '', 'steps', [], 2)]),
            ]);

            const before = hashFileBlocks(node);

            expect(Object.keys(before).sort()).toEqual([
                'func login',
                'func login > flow',
            ]);

            // change only the nested flow block; the parent func block hash must stay put
            const changed = file('src/a.ts', '', [
                block('func', 'login', 'body', [block('flow', '', 'different steps', [], 2)]),
            ]);
            const after = hashFileBlocks(changed);

            expect(after['func login']).toBe(before['func login']);
            expect(after['func login > flow']).not.toBe(before['func login > flow']);
        });
    });

    describe('diffFileBlocks', () => {
        it('reports changed, added, and removed blocks', () => {
            const diff = diffFileBlocks(
                { keep: 'h', drift: 'h1', gone: 'h' },
                { keep: 'h', drift: 'h2', fresh: 'h' },
            );

            expect(diff).toEqual({ changed: ['drift'], added: ['fresh'], removed: ['gone'] });
        });
    });

    describe('collectFileNodes', () => {
        it('finds every file target with its node', () => {
            expect(collectFileNodes(sampleTree()).map((f) => f.name)).toEqual([
                'src/a.ts',
                'src/b.ts',
            ]);
        });
    });

    describe('computeDrift', () => {
        it('reports unknown granularity instead of fabricating block additions for old entries', () => {
            const tree = sampleTree();
            const lock = lockFor(tree);
            const entry = lock.files['src/a.ts']!;
            entry.hash = 'old';
            delete entry.blocks;
            expect(computeDrift(tree, lock, []).find((item) => item.name === 'src/a.ts')?.status).toBe('unknown');
        });
        // Locks against empty hintbooks, so effective hashes reduce to spec + a stable (empty-vocab) component.
        function lockFor(tree: HintData[]): LockData {
            const effective = new Map(effectiveFileHashes(tree, []).map((f) => [f.name, f.hash]));
            const files: LockData['files'] = {};

            for (const { name, node } of collectFileNodes(tree)) {
                files[name] = { hash: effective.get(name)!, blocks: hashFileBlocks(node) };
            }

            return { version: 2, files };
        }

        it('marks unchanged files fresh', () => {
            const tree = sampleTree();

            expect(computeDrift(tree, lockFor(tree), []).every((d) => d.status === 'fresh')).toBe(true);
        });

        it('localizes a file change to a block and leaves siblings fresh', () => {
            const tree = sampleTree();
            const lock = lockFor(tree);

            ((tree[0]!.children[1] as HintData).children[0] as HintData).body = 'Implements A differently.';
            const drift = computeDrift(tree, lock, []);

            const a = drift.find((d) => d.name === 'src/a.ts')!;
            expect(a.status).toBe('blocks');
            expect(a.diff!.changed).toEqual([
                '(preamble)',
            ]);
            expect(drift.find((d) => d.name === 'src/b.ts')!.status).toBe('fresh');
        });

        it('flags an ancestor-only change as inherited', () => {
            const tree = sampleTree();
            const lock = lockFor(tree);

            (tree[0]!.children[0] as HintData).body = 'Changed baseline rule.';
            const drift = computeDrift(tree, lock, []);

            expect(drift.every((d) => d.status === 'inherited')).toBe(true);
        });

        it('marks unlocked files new', () => {
            const drift = computeDrift(sampleTree(), { version: 2, files: {} }, []);

            expect(drift.every((d) => d.status === 'new')).toBe(true);
        });

        it('flags a file whose used keyword changed meaning as inherited (vocabulary drift)', () => {
            // Root declares `lang`; give the books a `lang` instruction, lock, then change that instruction.
            const langBook = (content: string): HintbookData => ({ instructions: [{ name: 'lang', content }] });
            const tree = sampleTree();
            const effective = new Map(effectiveFileHashes(tree, [langBook('v1')]).map((f) => [f.name, f.hash]));
            const lock: LockData = { version: 2, files: {} };
            for (const { name, node } of collectFileNodes(tree)) {
                lock.files[name] = { hash: effective.get(name)!, blocks: hashFileBlocks(node) };
            }

            // Same spec, changed keyword meaning -> every file using `lang` drifts, none stays fresh.
            const drift = computeDrift(tree, lock, [langBook('v2')]);
            expect(drift.every((d) => d.status === 'inherited')).toBe(true);
        });

        it('flags output edited underneath an unchanged spec as drifted-output', () => {
            const tree = sampleTree();
            const lock = lockFor(tree);
            lock.files['src/a.ts']!.target = 'locked-output-hash';
            lock.files['src/b.ts']!.target = 'locked-output-hash-b';

            const targetHashes = new Map<string, string | null>([
                ['src/a.ts', 'edited-output-hash'], // differs from lock -> drifted
                ['src/b.ts', 'locked-output-hash-b'], // matches lock -> fresh
            ]);
            const drift = computeDrift(tree, lock, [], targetHashes);

            expect(drift.find((d) => d.name === 'src/a.ts')!.status).toBe('drifted-output');
            expect(drift.find((d) => d.name === 'src/b.ts')!.status).toBe('fresh');
        });

        it('reports fresh when no target hashes are supplied, even if a target was recorded', () => {
            const tree = sampleTree();
            const lock = lockFor(tree);
            lock.files['src/a.ts']!.target = 'locked-output-hash';

            expect(computeDrift(tree, lock, []).every((d) => d.status === 'fresh')).toBe(true);
        });

        it('reports fresh for an entry with no recorded target (older lock)', () => {
            const tree = sampleTree();
            const lock = lockFor(tree); // lockFor records no target

            const targetHashes = new Map<string, string | null>([['src/a.ts', 'any-hash']]);

            expect(computeDrift(tree, lock, [], targetHashes).find((d) => d.name === 'src/a.ts')!.status).toBe('fresh');
        });

        it('does not report drift when the output is missing (null hash)', () => {
            const tree = sampleTree();
            const lock = lockFor(tree);
            lock.files['src/a.ts']!.target = 'locked-output-hash';

            const targetHashes = new Map<string, string | null>([['src/a.ts', null]]);

            expect(computeDrift(tree, lock, [], targetHashes).find((d) => d.name === 'src/a.ts')!.status).toBe('fresh');
        });
    });

    describe('formatDrift', () => {
        it('renders per-file guidance and omits fresh files', () => {
            const text = formatDrift([
                { name: 'a.ts', status: 'fresh' },
                { name: 'b.ts', status: 'new' },
                { name: 'c.ts', status: 'inherited' },
                { name: 'd.ts', status: 'blocks', diff: { changed: ['func x'], added: [], removed: [] } },
                { name: 'e.ts', status: 'drifted-output' },
            ]);

            expect(text).not.toContain('a.ts');
            expect(text).toContain('b.ts: new target');
            expect(text).toContain('c.ts: inherited context or vocabulary changed');
            expect(text).toContain('d.ts: reconcile these blocks');
            expect(text).toContain('changed: func x');
            expect(text).toContain('e.ts: output changed since it was generated');
        });
    });

    describe('hashFileVocab / effectiveFileHashes', () => {
        // Root `_.hint` with a `func` block, then a file that also declares a `func` plus an `entity`.
        const tree = (): HintData[] => [
            folder('.', [
                block('func', 'shared', 'x'),
                folder('src', [
                    file('src/a.ts', '', [block('func', 'doThing', 'body')]),
                    file('src/b.ts', '', [block('entity', 'Thing', 'body')]),
                ]),
            ]),
        ];

        it('changes a file hash when a keyword it uses changes meaning, and leaves others alone', () => {
            const before = new Map(effectiveFileHashes(tree(), [bookWith('<func>v1</func>')]).map((f) => [f.name, f.hash]));
            const after = new Map(effectiveFileHashes(tree(), [bookWith('<func>v2</func>')]).map((f) => [f.name, f.hash]));

            // a.ts uses `func` (own) — and both files inherit the root `func` — so both shift.
            expect(after.get('src/a.ts')).not.toBe(before.get('src/a.ts'));
            expect(after.get('src/b.ts')).not.toBe(before.get('src/b.ts'));
        });

        it('does not change a file hash when an unrelated keyword changes', () => {
            const before = new Map(effectiveFileHashes(tree(), [bookWith('<func>v1</func>', '<entity>v1</entity>')]).map((f) => [f.name, f.hash]));
            const after = new Map(effectiveFileHashes(tree(), [bookWith('<func>v1</func>', '<entity>v2</entity>')]).map((f) => [f.name, f.hash]));

            // b.ts uses `entity` -> shifts; a.ts never uses `entity` -> unchanged.
            expect(after.get('src/b.ts')).not.toBe(before.get('src/b.ts'));
            expect(after.get('src/a.ts')).toBe(before.get('src/a.ts'));
        });

        it('is unaffected by non-rendering metadata (surface/description/synonyms)', () => {
            const plain = bookWith('<func>v1</func>');
            const withMeta: HintbookData = {
                instructions: [
                    { name: 'func', content: '<func>v1</func>', metadata: { surface: true, description: 'x', synonyms: ['fn'] } },
                    { name: 'entity', content: '<entity>{name}</entity>' },
                ],
            };

            expect(hashFileVocab(tree(), [withMeta])).toEqual(hashFileVocab(tree(), [plain]));
        });
    });

    describe('saveLock / loadLock', () => {
        it('rejects future lock versions and migrates backslash keys', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'hint.lock'), 'version: 999\nfiles: {}\n');
                await expect(loadLock(dir)).rejects.toThrow(/newer hint/);
                await FsPromises.writeFile(Path.join(dir, 'hint.lock'), 'version: 2\nfiles:\n  src\\\\a.ts:\n    hash: h\n');
                expect((await loadLock(dir))?.files['src/a.ts']?.hash).toBe('h');
            });
        });
        it('round-trips a lock file', async () => {
            await withTempDir(async (dir) => {
                const lock: LockData = {
                    version: 2,
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

    describe('hashTargetFile / hashTargetFiles', () => {
        it('hashes a file deterministically and returns null when it is missing', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'code', 'utf8');

                const hashA = await hashTargetFile(dir, 'a.ts');

                expect(hashA).toBe(await hashTargetFile(dir, 'a.ts'));
                expect(await hashTargetFile(dir, 'missing.ts')).toBeNull();

                const map = await hashTargetFiles(dir, ['a.ts', 'missing.ts']);
                expect(map.get('a.ts')).toBe(hashA);
                expect(map.get('missing.ts')).toBeNull();
            });
        });

        it('changes when the file content changes', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'code', 'utf8');
                const before = await hashTargetFile(dir, 'a.ts');

                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'edited', 'utf8');
                expect(await hashTargetFile(dir, 'a.ts')).not.toBe(before);
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
                    version: 2,
                    files: { 'a.ts': { hash: 'h1' }, 'b.ts': { hash: 'h2' }, 'c.ts': { hash: 'h3' } },
                };

                const fresh = await selectFreshTargets(dir, fileHashes, lock);

                expect([...fresh]).toEqual([
                    'a.ts',
                ]);
            });
        });

        it('marks a target stale when its recorded output hash no longer matches disk', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'code', 'utf8');
                const target = (await hashTargetFile(dir, 'a.ts'))!;

                const fileHashes = [{ name: 'a.ts', hash: 'h1' }];
                const lock: LockData = { version: 2, files: { 'a.ts': { hash: 'h1', target } } };

                // Unchanged output -> fresh.
                expect([...(await selectFreshTargets(dir, fileHashes, lock))]).toEqual(['a.ts']);

                // Output edited underneath the unchanged spec -> stale.
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'edited', 'utf8');
                expect((await selectFreshTargets(dir, fileHashes, lock)).size).toBe(0);
            });
        });

        it('falls back to existence only for an entry with no recorded output hash', async () => {
            await withTempDir(async (dir) => {
                await FsPromises.writeFile(Path.join(dir, 'a.ts'), 'anything', 'utf8');

                const fresh = await selectFreshTargets(dir, [{ name: 'a.ts', hash: 'h1' }], { version: 2, files: { 'a.ts': { hash: 'h1' } } });

                expect([...fresh]).toEqual(['a.ts']);
            });
        });
    });
});
