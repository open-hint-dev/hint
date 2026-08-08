import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import { findNearestFolderHint, hintTargetName, matchedNothing, resolveRequests } from './resolve.js';

async function withProject(files: Record<string, string>, run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await FsPromises.realpath(await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-resolve-')));

    try {
        for (const [
            relativePath,
            content,
        ] of Object.entries(files)) {
            const target = Path.join(dir, relativePath);
            await FsPromises.mkdir(Path.dirname(target), { recursive: true });
            await FsPromises.writeFile(target, content, 'utf8');
        }

        await run(dir);
    } finally {
        await FsPromises.rm(dir, { recursive: true, force: true });
    }
}

const PROJECT = {
    '_.hint': '# rule Root\n\nroot knowledge\n',
    'src/_.hint': '# rule Src\n\nsrc knowledge\n',
    'src/a.ts.hint': '# entity A\n\na knowledge\n',
    'src/a.ts': 'export const a = 1;\n',
    'src/b.ts': 'export const b = 2;\n',
};

describe('resolve', () => {
    describe('resolveRequests', () => {
        it('reports a companion spec as its own knowledge', async () => {
            await withProject(PROJECT, async (dir) => {
                const resolution = await resolveRequests(dir, ['src/a.ts']);

                expect(resolution.requests).toEqual([
                    { request: 'src/a.ts', status: 'spec', hintPath: Path.join(dir, 'src/a.ts.hint'), target: 'src/a.ts', matched: 1 },
                ]);
                expect(matchedNothing(resolution)).toBe(false);
            });
        });

        it('reports a folder as its own knowledge when it has a _.hint', async () => {
            await withProject(PROJECT, async (dir) => {
                const [request] = (await resolveRequests(dir, ['src'])).requests;

                expect(request).toMatchObject({ status: 'spec', target: 'src' });
            });
        });

        // The distinction the old implementation could not make: a real file that simply declares
        // nothing of its own, versus a path that is not in the repository at all.
        it('separates a real path with no spec from a path that does not exist', async () => {
            await withProject(PROJECT, async (dir) => {
                const [existing] = (await resolveRequests(dir, ['src/b.ts'])).requests;
                const [missing] = (await resolveRequests(dir, ['no/such/file.ts'])).requests;

                expect(existing).toMatchObject({ status: 'inherited', target: 'src/b.ts' });
                expect(missing).toMatchObject({ status: 'missing', target: 'no/such/file.ts' });
            });
        });

        it('treats both as matching nothing of their own', async () => {
            await withProject(PROJECT, async (dir) => {
                expect(matchedNothing(await resolveRequests(dir, ['src/b.ts']))).toBe(true);
                expect(matchedNothing(await resolveRequests(dir, ['no/such/file.ts']))).toBe(true);
            });
        });

        it('reports a glob that matched nothing', async () => {
            await withProject(PROJECT, async (dir) => {
                const [empty] = (await resolveRequests(dir, ['nope/**'])).requests;
                const [hit] = (await resolveRequests(dir, ['src/**'])).requests;

                expect(empty).toMatchObject({ status: 'missing', matched: 0 });
                expect(hit).toMatchObject({ status: 'spec' });
                expect(hit!.matched).toBeGreaterThan(0);
            });
        });

        it('reports a path outside the project root as unresolvable', async () => {
            await withProject(PROJECT, async (dir) => {
                const [request] = (await resolveRequests(dir, ['../escape.ts'])).requests;

                expect(request).toMatchObject({ status: 'missing', hintPath: null, target: null });
            });
        });

        it('still hands back the hint paths that carry inherited context', async () => {
            await withProject(PROJECT, async (dir) => {
                // A path with no spec of its own must still resolve its ancestors — that is the knowledge
                // it inherits. Reporting it as unresolved and returning it are not in conflict.
                const resolution = await resolveRequests(dir, ['no/such/file.ts']);

                expect(resolution.hintPaths.length).toBeGreaterThan(0);
            });
        });

        it('works in a repository that has only folder knowledge', async () => {
            await withProject({ '_.hint': '# rule Root\n\nroot\n', 'src/_.hint': '# rule Src\n\nsrc\n', 'src/a.ts': 'x' }, async (dir) => {
                const [folder] = (await resolveRequests(dir, ['src'])).requests;
                const [file] = (await resolveRequests(dir, ['src/a.ts'])).requests;

                expect(folder).toMatchObject({ status: 'spec', target: 'src' });
                expect(file).toMatchObject({ status: 'inherited', target: 'src/a.ts' });
            });
        });
    });

    describe('findNearestFolderHint', () => {
        it('names the closest ancestor that actually declares something', async () => {
            await withProject(PROJECT, async (dir) => {
                expect(await findNearestFolderHint(dir, 'src/b.ts')).toBe(Path.join('src', '_.hint'));
                expect(await findNearestFolderHint(dir, 'other/deep/thing.ts')).toBe('_.hint');
            });
        });

        it('returns null when nothing above the path declares anything', async () => {
            await withProject({ 'src/a.ts': 'x' }, async (dir) => {
                expect(await findNearestFolderHint(dir, 'src/a.ts')).toBeNull();
            });
        });
    });

    describe('hintTargetName', () => {
        it('derives the path a hint file governs', () => {
            expect(hintTargetName('/p', '/p/src/login.ts.hint')).toBe(Path.join('src', 'login.ts'));
            expect(hintTargetName('/p', '/p/src/_.hint')).toBe('src');
            expect(hintTargetName('/p', '/p/_.hint')).toBe('.');
        });

        it('strips the .hint tail of a detached store', () => {
            expect(hintTargetName('/p', '/p/packages.hint/db/schema.ts.hint')).toBe(Path.join('packages', 'db', 'schema.ts'));
            expect(hintTargetName('/p', '/p/os.hint/_.hint')).toBe('os');
        });
    });
});
