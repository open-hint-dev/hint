import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import { resolveClosure, resolveClosurePaths } from './closure.js';
import { normalizeHintPaths } from './resolve.js';

async function withProject(files: Record<string, string>, run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-closure-'));

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

function hintPaths(dir: string, paths: string[]): string[] {
    return paths.map((path) => (Path.isAbsolute(path) ? Path.relative(dir, path) : path)).sort();
}

describe('closure', () => {
    it('pulls in the companion hint of a referenced file', async () => {
        await withProject(
            {
                'src/a.ts.hint': '# read src/b.ts\n\nReuse b.',
                'src/b.ts.hint': 'Spec for b.',
                'src/b.ts': 'export const b = 1;',
            },
            async (dir) => {
                const paths = await resolveClosurePaths(dir, await normalizeHintPaths(dir, [
                    'src/a.ts.hint',
                ]));

                expect(hintPaths(dir, paths)).toEqual([
                    'src/a.ts.hint',
                    'src/b.ts.hint',
                ]);
            },
        );
    });

    it('follows references transitively', async () => {
        await withProject(
            {
                'a.ts.hint': '# read b.ts\n\nchain',
                'b.ts.hint': '# read c.ts\n\nchain',
                'c.ts.hint': 'leaf',
            },
            async (dir) => {
                const paths = await resolveClosurePaths(dir, await normalizeHintPaths(dir, [
                    'a.ts.hint',
                ]));

                expect(hintPaths(dir, paths)).toEqual([
                    'a.ts.hint',
                    'b.ts.hint',
                    'c.ts.hint',
                ]);
            },
        );
    });

    it('limits breadth-first closure depth, reports the trimmed tail, and resolves folder topics', async () => {
        await withProject(
            {
                'wiki/a/_.hint': '# read wiki/b',
                'wiki/b/_.hint': '# read wiki/c',
                'wiki/c/_.hint': 'leaf',
            },
            async (dir) => {
                const closure = await resolveClosure(dir, await normalizeHintPaths(dir, ['wiki/a']), { depth: 1 });
                expect(hintPaths(dir, closure.paths)).toEqual(['wiki/a/_.hint', 'wiki/b/_.hint']);
                expect(closure.trimmed).toEqual(['wiki/c']);
            },
        );
    });

    it('terminates on a reference cycle', async () => {
        await withProject(
            {
                'a.ts.hint': '# read b.ts',
                'b.ts.hint': '# read a.ts',
            },
            async (dir) => {
                const paths = await resolveClosurePaths(dir, await normalizeHintPaths(dir, [
                    'a.ts.hint',
                ]));

                // The cycle terminates; a file may appear in both relative and absolute form,
                // which findHints later dedups after normalization.
                expect([...new Set(hintPaths(dir, paths))]).toEqual([
                    'a.ts.hint',
                    'b.ts.hint',
                ]);
            },
        );
    });

    it('ignores block names that do not resolve to a file', async () => {
        await withProject(
            {
                'a.ts.hint': '# func executeLogin\n\n# entity Credentials',
            },
            async (dir) => {
                const paths = await resolveClosurePaths(dir, await normalizeHintPaths(dir, [
                    'a.ts.hint',
                ]));

                expect(hintPaths(dir, paths)).toEqual([
                    'a.ts.hint',
                ]);
            },
        );
    });

    it('does not add a reference that has no companion hint', async () => {
        await withProject(
            {
                'a.ts.hint': '# read src/b.ts',
                'src/b.ts': 'export const b = 1;',
            },
            async (dir) => {
                const paths = await resolveClosurePaths(dir, await normalizeHintPaths(dir, [
                    'a.ts.hint',
                ]));

                expect(hintPaths(dir, paths)).toEqual([
                    'a.ts.hint',
                ]);
            },
        );
    });

    it('resolves a reference relative to the referencing file when not found at the root', async () => {
        await withProject(
            {
                'src/a.ts.hint': '# read b.ts',
                'src/b.ts.hint': 'sibling of a',
            },
            async (dir) => {
                const paths = await resolveClosurePaths(dir, await normalizeHintPaths(dir, [
                    'src/a.ts.hint',
                ]));

                expect(hintPaths(dir, paths)).toEqual([
                    'src/a.ts.hint',
                    'src/b.ts.hint',
                ]);
            },
        );
    });

    it('ignores a reference that escapes the project root', async () => {
        await withProject(
            {
                'a.ts.hint': '# read ../outside.ts',
            },
            async (dir) => {
                const paths = await resolveClosurePaths(dir, await normalizeHintPaths(dir, [
                    'a.ts.hint',
                ]));

                expect(hintPaths(dir, paths)).toEqual([
                    'a.ts.hint',
                ]);
            },
        );
    });
});
