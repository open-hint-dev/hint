import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHintbook, loadHintbooks, resolveHintbookPaths, RUNNING_SYSTEM } from './hintbook.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const repoRootPath = Path.resolve(here, '../..');
const instructionsPath = Path.join(repoRootPath, 'testdata/hintbook/keywords');

describe('hintbook', () => {
    describe('loadHintbook', () => {
        it('loads every instruction from the hintbook folder', async () => {
            const hintbook = await loadHintbook(instructionsPath);

            const names = hintbook.instructions.map((instruction) => instruction.name);

            expect(names).toContain('entity');
            expect(names).toContain('field');
            expect(names).toContain(RUNNING_SYSTEM);
            expect(names).toContain('__header__');
            expect(names).toContain('__footer__');
        });

        it('ignores legacy mode-suffixed instruction files', async () => {
            const hintbookPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-legacy-'));

            await FsPromises.writeFile(Path.join(hintbookPath, 'hintbook.json'), '{"id":"legacy"}');
            await FsPromises.writeFile(Path.join(hintbookPath, '__header__.md'), 'the header');
            // Variants from the removed mode system must not shadow or duplicate the base instruction.
            await FsPromises.writeFile(Path.join(hintbookPath, '__header__.fix.md'), 'the fix header');
            await FsPromises.writeFile(Path.join(hintbookPath, '__mode__.review.md'), 'a review mode');

            const hintbook = await loadHintbook(hintbookPath);
            const headers = hintbook.instructions.filter((instruction) => instruction.name === '__header__');

            expect(headers).toHaveLength(1);
            expect(headers[0]!.content).toBe('the header');
            expect(hintbook.instructions.map((instruction) => instruction.name)).not.toContain('__mode__');
        });

        it('reads exclude metadata from instruction front matter', async () => {
            const hintbook = await loadHintbook(instructionsPath);

            const notes = hintbook.instructions.find((instruction) => instruction.name === 'notes');

            expect(notes?.metadata?.exclude).toBe(true);
        });

        it('reads description and synonyms from instruction front matter', async () => {
            const hintbook = await loadHintbook(instructionsPath);
            const instructions = hintbook.instructions;

            const entity = instructions.find((instruction) => instruction.name === 'entity');
            expect(entity?.metadata?.description).toBe('A data structure or model with a fixed schema.');

            const rule = instructions.find((instruction) => instruction.name === 'rule');
            expect(rule?.metadata?.synonyms).toEqual(['rules']);
            // Keywords without a description front matter key leave it undefined.
            expect(rule?.metadata?.description).toBeUndefined();
        });

        it('normalizes a scalar synonym and rejects non-string values with file context', async () => {
            const hintbookPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-synonyms-'));
            await FsPromises.writeFile(Path.join(hintbookPath, 'hintbook.json'), '{"id":"synonyms"}');
            await FsPromises.writeFile(Path.join(hintbookPath, 'app.md'), '---\nsynonyms: application\n---\nbody');
            expect((await loadHintbook(hintbookPath)).instructions[0]?.metadata?.synonyms).toEqual(['application']);
            await FsPromises.writeFile(Path.join(hintbookPath, 'app.md'), '---\nsynonyms: [application, 2]\n---\nbody');
            await expect(loadHintbook(hintbookPath)).rejects.toThrow(/app\.md/);
        });

        it('names a malformed hintbook manifest', async () => {
            const hintbookPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-manifest-'));
            await FsPromises.writeFile(Path.join(hintbookPath, 'hintbook.json'), '{bad json');
            await expect(loadHintbook(hintbookPath)).rejects.toThrow(/hintbook\.json/);
        });

        it('loads domain synonym groups from the manifest', async () => {
            const hintbookPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-manifest-synonyms-'));
            await FsPromises.writeFile(Path.join(hintbookPath, 'hintbook.json'), '{"synonyms":[["feline","cat"],["ml","machine learning"]]}');

            expect((await loadHintbook(hintbookPath)).synonyms).toEqual([
                ['feline', 'cat'],
                ['ml', 'machine learning'],
            ]);
        });
    });

    describe('resolveHintbookPaths', () => {
        it('finds the folder holding the hintbook file under a file prefixed base', async () => {
            expect(await resolveHintbookPaths(repoRootPath, 'file://testdata/hintbook')).toEqual([instructionsPath]);
        });

        it('treats a plain path as a file base', async () => {
            expect(await resolveHintbookPaths(repoRootPath, 'testdata/hintbook')).toEqual([instructionsPath]);
        });

        it('resolves an npm prefixed book through node_modules', async () => {
            const tempPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-npm-'));

            try {
                const keywordsPath = Path.join(tempPath, 'node_modules/@openhint/hintbook-fixture/keywords');
                await FsPromises.mkdir(keywordsPath, { recursive: true });
                await FsPromises.copyFile(Path.join(instructionsPath, 'hintbook.json'), Path.join(keywordsPath, 'hintbook.json'));

                const resolved = await resolveHintbookPaths(tempPath, 'npm://@openhint/hintbook-fixture');

                expect(resolved).toEqual([keywordsPath]);
            } finally {
                await FsPromises.rm(tempPath, { recursive: true, force: true });
            }
        });

        it('resolves an npm prefixed book from the isolated hintbooks store', async () => {
            const tempPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-npm-'));

            try {
                const keywordsPath = Path.join(tempPath, 'hintbooks/node_modules/@openhint/hintbook-fixture/keywords');
                await FsPromises.mkdir(keywordsPath, { recursive: true });
                await FsPromises.copyFile(Path.join(instructionsPath, 'hintbook.json'), Path.join(keywordsPath, 'hintbook.json'));

                const resolved = await resolveHintbookPaths(tempPath, 'npm://@openhint/hintbook-fixture');

                expect(resolved).toEqual([keywordsPath]);
            } finally {
                await FsPromises.rm(tempPath, { recursive: true, force: true });
            }
        });

        it('finds every hintbook under a shared base folder', async () => {
            const resolved = await resolveHintbookPaths(repoRootPath, 'file://testdata/hintbooks');

            expect(resolved).toEqual([
                Path.join(repoRootPath, 'testdata/hintbooks/alpha'),
                Path.join(repoRootPath, 'testdata/hintbooks/beta'),
            ]);
        });

        it('returns no paths for an unknown book', async () => {
            expect(await resolveHintbookPaths(repoRootPath, 'no/such/book')).toEqual([]);
        });

        it('returns no paths for a folder without a hintbook file', async () => {
            expect(await resolveHintbookPaths(repoRootPath, 'file://testdata/project/src')).toEqual([]);
        });
    });

    describe('loadHintbooks', () => {
        it('loads every configured book', async () => {
            const hintbooks = await loadHintbooks(repoRootPath, ['file://testdata/hintbook']);

            expect(hintbooks).toHaveLength(1);
            expect(hintbooks[0]!.instructions.length).toBeGreaterThan(0);
        });

        it('loads every hintbook discovered under one book entry', async () => {
            const hintbooks = await loadHintbooks(repoRootPath, ['file://testdata/hintbooks']);

            expect(hintbooks.map((hintbook) => hintbook.description)).toEqual([
                'Alpha test hintbook',
                'Beta test hintbook',
            ]);
        });

        it('throws for a missing book', async () => {
            await expect(loadHintbooks(repoRootPath, ['no/such/book'])).rejects.toThrow('Hintbook not found: no/such/book');
        });
    });
});
