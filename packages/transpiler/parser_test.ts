/// <reference types="node" />
/// <reference types="vitest/globals" />

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { ErrorCode, is } from './error';
import { createIgnoreMatcher, extractReads, loadProjectConfig, parse, tokenize } from './parser';

describe('parser', () => {
    const roots: string[] = [];

    afterEach(async () => {
        await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    });

    async function project(config = ''): Promise<string> {
        const root = await mkdtemp(resolve(tmpdir(), 'hint-parser-'));
        roots.push(root);
        await writeFile(resolve(root, 'hint.yml'), config);
        return root;
    }

    it('loads the supported project configuration', async () => {
        const root = await project('ignore:\n  - \'testdata/\'\n  - "**/*.generated.hint"\n');

        await expect(loadProjectConfig(root)).resolves.toEqual({
            ignore: [
                'testdata/',
                '**/*.generated.hint',
            ],
        });
    });

    it('rejects unsupported project configuration', async () => {
        const root = await project('unknown: true\n');

        await expect(loadProjectConfig(root)).rejects.toSatisfy((error: unknown) => is(error, ErrorCode.PARSE_ERROR));
    });

    it('applies ordered gitignore rules without affecting outside paths', () => {
        const matcher = createIgnoreMatcher('/repo', [
            '**/*.generated.hint',
            '!src/keep.generated.hint',
            '/build/',
        ]);

        expect(matcher.matches('/repo/src/drop.generated.hint')).toBe(true);
        expect(matcher.matches('/repo/src/keep.generated.hint')).toBe(false);
        expect(matcher.matches('/repo/build/output.hint')).toBe(true);
        expect(matcher.matches('/repo/nested/build/output.hint')).toBe(false);
        expect(matcher.matches('/outside/drop.generated.hint')).toBe(false);

        const blockedParent = createIgnoreMatcher('/repo', [
            'private/',
            '!private/keep.hint',
        ]);
        expect(blockedParent.matches('/repo/private/keep.hint')).toBe(true);
    });

    it('filters ignored matches from structural reads', async () => {
        const root = await project();
        await mkdir(resolve(root, 'src'), { recursive: true });
        await writeFile(resolve(root, 'src/keep.ts'), '');
        await writeFile(resolve(root, 'src/drop.ts'), '');
        const matcher = createIgnoreMatcher(root, ['src/drop.ts']);

        const result = extractReads('# read {src/*.ts} as [Sources]\n\nArchitecture sources.', root, matcher);

        expect(result.reads).toEqual([
            {
                name: 'Sources',
                glob: 'src/keep.ts',
                description: 'Architecture sources.',
            },
        ]);
        expect(result.content).toContain('# read {src/keep.ts} as [Sources]');
    });

    it('normalizes aliases, test targets, and strips notes', () => {
        const blocks = tokenize(
            '# language\n\nTypeScript\n# model User\n\n- id: string\n# test for createUser\n\n- works\n# notes\n\nprivate',
            '/repo/user.ts.hint',
            'file',
        );

        expect(blocks.map(({ directive, name }) => ({ directive, name }))).toEqual([
            { directive: 'lang', name: undefined },
            { directive: 'entity', name: 'User' },
            { directive: 'test', name: 'createUser' },
        ]);
    });

    it('assembles the cascade once and skips ignored includes and reads', async () => {
        const root = await project('ignore:\n  - src/ignored.hint\n  - src/private.ts\n');
        await mkdir(resolve(root, 'src'), { recursive: true });
        await writeFile(resolve(root, '_.hint'), '# lang\n\nTypeScript');
        await writeFile(resolve(root, 'src/_.hint'), '# rule\n\n- Local rule.');
        await writeFile(resolve(root, 'src/user.hint'), '# entity Shared\n\n- id: string');
        await writeFile(resolve(root, 'src/ignored.hint'), '# bad\n\n- hidden');
        await writeFile(resolve(root, 'src/private.ts'), '');
        await writeFile(
            resolve(root, 'src/user.ts.hint'),
            '@include ./ignored.hint\n# read {src/private.ts} as [Private]\n\nHidden.\n# module user\n\nUses {Shared}.',
        );

        const result = await parse([resolve(root, 'src/user.ts')]);

        expect(result.targetPaths).toEqual([resolve(root, 'src/user.ts.hint')]);
        expect(result.files.map((file) => file.sourceKind)).toEqual([
            'baseline',
            'baseline',
            'direct',
            'file',
        ]);
        expect(result.blocks.map((block) => block.directive)).toEqual([
            'lang',
            'rule',
            'entity',
            'module',
        ]);
        expect(result.reads.size).toBe(0);
    });
});
