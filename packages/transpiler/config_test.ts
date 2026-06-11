import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findConfig, findProjectRoot, loadConfig, saveConfig } from './config.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = Path.resolve(here, '../../testdata/project');

describe('config', () => {
    describe('findConfig', () => {
        it('finds hint.yml in the project root', async () => {
            expect(await findConfig(projectRootPath)).toBe(Path.join(projectRootPath, 'hint.yml'));
        });

        it('returns null when no config exists', async () => {
            const tempPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-config-'));

            try {
                expect(await findConfig(tempPath)).toBeNull();
            } finally {
                await FsPromises.rm(tempPath, { recursive: true, force: true });
            }
        });
    });

    describe('findProjectRoot', () => {
        it('walks up from a nested folder to the project root', async () => {
            expect(await findProjectRoot(Path.join(projectRootPath, 'deep/nested'))).toBe(projectRootPath);
        });

        it('returns null outside of any project', async () => {
            const tempPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-root-'));

            try {
                expect(await findProjectRoot(tempPath)).toBeNull();
            } finally {
                await FsPromises.rm(tempPath, { recursive: true, force: true });
            }
        });
    });

    describe('loadConfig', () => {
        it('parses the project configuration', async () => {
            const config = await loadConfig(projectRootPath);

            expect(config).toEqual({
                name: 'testdata',
                description: 'Sample project covering HINT specification cases',
                books: ['file://../hintbook'],
            });
        });

        it('returns null when no config exists', async () => {
            const tempPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-load-'));

            try {
                expect(await loadConfig(tempPath)).toBeNull();
            } finally {
                await FsPromises.rm(tempPath, { recursive: true, force: true });
            }
        });
    });

    describe('saveConfig', () => {
        it('round-trips the configuration', async () => {
            const tempPath = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-save-'));

            const config = {
                name: 'saved',
                description: 'saved project',
                books: ['some/book'],
            };

            try {
                await saveConfig(tempPath, config);

                expect(await loadConfig(tempPath)).toEqual(config);
            } finally {
                await FsPromises.rm(tempPath, { recursive: true, force: true });
            }
        });
    });
});
