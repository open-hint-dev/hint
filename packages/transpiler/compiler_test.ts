/// <reference types="node" />
/// <reference types="vitest/globals" />

import type { CompilerInput } from './compiler';
import { compile, filterIgnored } from './compiler';
import { ErrorCode, is } from './error';
import { parse } from './parser';

function input(overrides: Partial<CompilerInput> = {}): CompilerInput {
    return {
        projectRoot: '/repo',
        targetPaths: ['/repo/src/user.ts.hint'],
        ignore: [],
        blocks: [
            {
                directive: 'lang',
                name: undefined,
                body: 'TypeScript',
                sourcePath: '/repo/_.hint',
                sourceKind: 'baseline',
            },
            {
                directive: 'entity',
                name: 'User',
                body: '- id: string',
                sourcePath: '/repo/src/user.ts.hint',
                sourceKind: 'file',
            },
        ],
        reads: new Map(),
        ...overrides,
    };
}

describe('compiler', () => {
    it('filters ignored targets, blocks, and read paths', () => {
        const filtered = filterIgnored(
            input({
                ignore: ['private/'],
                targetPaths: [
                    '/repo/private/secret.ts.hint',
                    '/repo/src/user.ts.hint',
                ],
                blocks: [
                    {
                        directive: 'entity',
                        name: 'Secret',
                        body: '- value: string',
                        sourcePath: '/repo/private/secret.ts.hint',
                        sourceKind: 'file',
                    },
                ],
                reads: new Map([
                    [
                        'Private',
                        { name: 'Private', glob: 'private/source.ts', description: 'Private.' },
                    ],
                ]),
            }),
        );

        expect(filtered.targetPaths).toEqual(['src/user.ts.hint']);
        expect(filtered.blocks).toEqual([]);
        expect(filtered.reads.size).toBe(0);
    });

    it('renders repository context, source markers, and directive templates', async () => {
        const output = await compile(input());

        expect(output).toContain('<repository_context root=".">');
        expect(output).toContain('<target path="src/user.ts" specification="src/user.ts.hint" source="S2" />');
        expect(output).toContain('<source id="S1" path="_.hint" kind="baseline" />');
        expect(output).toContain('<source id="S2" path="src/user.ts.hint" kind="file" />');
        expect(output).toContain('<source_ref ids="S1" />\n\n## [ENVIRONMENT RUNTIME & LANGUAGE]');
        expect(output).toContain('<source_ref ids="S2" />\n\n### DATA STRUCT: User');
        expect(output).not.toContain('/repo/');
    });

    it('merges rule sources and preserves provenance order', async () => {
        const output = await compile(
            input({
                blocks: [
                    {
                        directive: 'rule',
                        name: undefined,
                        body: '- Root rule.',
                        sourcePath: '/repo/_.hint',
                        sourceKind: 'baseline',
                    },
                    {
                        directive: 'rule',
                        name: undefined,
                        body: '- File rule.',
                        sourcePath: '/repo/src/user.ts.hint',
                        sourceKind: 'file',
                    },
                ],
            }),
        );

        expect(output).toContain('<source_ref ids="S1,S2" />');
        expect(output).toContain('- Root rule.\n\n- File rule.');
    });

    it('renders structured function blocks', async () => {
        const output = await compile(
            input({
                blocks: [
                    {
                        directive: 'entity',
                        name: 'User',
                        body: '- id: string',
                        sourcePath: '/repo/src/user.ts.hint',
                        sourceKind: 'file',
                    },
                    {
                        directive: 'function',
                        name: 'loadUser',
                        body: '## arg user: {User}\nThe user.\n\n## return {User}\nThe loaded user.\n\n## flow\n\n1. Return the user.',
                        sourcePath: '/repo/src/user.ts.hint',
                        sourceKind: 'file',
                    },
                ],
            }),
        );

        expect(output).toContain('- **`user: User`** — The user.');
        expect(output).toContain('`User` — The loaded user.');
        expect(output).not.toContain('#### Errors');
    });

    it('fails references removed by compiler ignore filtering', async () => {
        const compilation = compile(
            input({
                ignore: ['private/'],
                blocks: [
                    {
                        directive: 'read',
                        name: 'Private',
                        body: 'Private dependency.',
                        sourcePath: '/repo/private/context.hint',
                        sourceKind: 'baseline',
                    },
                    {
                        directive: 'module',
                        name: 'user',
                        body: 'Uses {Private}.',
                        sourcePath: '/repo/src/user.ts.hint',
                        sourceKind: 'file',
                    },
                ],
                reads: new Map([
                    [
                        'Private',
                        { name: 'Private', glob: 'private/source.ts', description: 'Private.' },
                    ],
                ]),
            }),
        );

        await expect(compilation).rejects.toSatisfy((error: unknown) => is(error, ErrorCode.REFERENCE_ERROR));
    });

    it('returns empty output for fully ignored input', async () => {
        await expect(
            compile(
                input({
                    ignore: ['src/'],
                    targetPaths: ['/repo/src/user.ts.hint'],
                    blocks: [
                        {
                            directive: 'entity',
                            name: 'User',
                            body: '- id: string',
                            sourcePath: '/repo/src/user.ts.hint',
                            sourceKind: 'file',
                        },
                    ],
                }),
            ),
        ).resolves.toBe('');
    });

    it('compiles a repository specification through the full parser pipeline', async () => {
        const parsed = await parse(['packages/transpiler/error.ts']);
        const output = await compile({
            projectRoot: parsed.projectRoot,
            targetPaths: parsed.targetPaths,
            ignore: parsed.config.ignore,
            blocks: parsed.blocks,
            reads: parsed.reads,
        });

        expect(output).toContain('<target path="packages/transpiler/error.ts" specification="packages/transpiler/error.ts.hint"');
        expect(output).toContain('### FUNCTION CONTRACT: create');
        expect(output).not.toContain(process.cwd());
    });
});
