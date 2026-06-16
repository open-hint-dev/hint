import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { INSTRUCTION_MODE_DEFAULT, loadHintbook, loadHintbooks, resolveHintbookPaths, RUNNING_SYSTEM } from './hintbook.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const repoRootPath = Path.resolve(here, '../..');
const instructionsPath = Path.join(repoRootPath, 'testdata/hintbook/keywords');

describe('hintbook', () => {
    describe('loadHintbook', () => {
        it('loads instructions into the default mode', async () => {
            const hintbook = await loadHintbook(instructionsPath);

            const names = hintbook.modes[INSTRUCTION_MODE_DEFAULT]!.instructions.map((instruction) => instruction.name);

            expect(names).toContain('entity');
            expect(names).toContain('field');
            expect(names).toContain(RUNNING_SYSTEM);
            expect(names).toContain('__header__');
            expect(names).toContain('__footer__');
        });

        it('loads mode-specific instructions from the file name suffix', async () => {
            const hintbook = await loadHintbook(instructionsPath);

            for (const mode of ['fix', 'review']) {
                const names = hintbook.modes[mode]!.instructions.map((instruction) => instruction.name);

                expect(names).toContain('__header__');
                expect(names).toContain('__footer__');
            }
        });

        it('reads exclude metadata from instruction front matter', async () => {
            const hintbook = await loadHintbook(instructionsPath);

            const notes = hintbook.modes[INSTRUCTION_MODE_DEFAULT]!.instructions.find((instruction) => instruction.name === 'notes');

            expect(notes?.metadata?.exclude).toBe(true);
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
            expect(hintbooks[0]!.modes[INSTRUCTION_MODE_DEFAULT]!.instructions.length).toBeGreaterThan(0);
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
