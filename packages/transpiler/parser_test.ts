import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HintData } from './parser.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import { findHints, parseHints } from './parser.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = Path.resolve(here, '../../testdata/project');

function inProject(path: string): string {
    return Path.join(projectRootPath, path);
}

describe('parser', () => {
    describe('findHints', () => {
        it('builds the hint file tree with folder hints as nodes', async () => {
            const hints = await findHints(projectRootPath, [
                '_.hint',
                'src/_.hint',
                'src/payment.ts.hint',
                'src/notes.ts.hint',
            ]);

            expect(hints).toEqual([
                {
                    path: inProject('_.hint'),
                    children: [
                        {
                            path: inProject('src/_.hint'),
                            children: [
                                { path: inProject('src/notes.ts.hint'), children: [] },
                                { path: inProject('src/payment.ts.hint'), children: [] },
                            ],
                        },
                    ],
                },
            ]);
        });

        it('synthesizes missing folder hints up to the project root', async () => {
            const hints = await findHints(projectRootPath, ['deep/nested/feature.ts.hint']);

            expect(hints).toEqual([
                {
                    path: inProject('_.hint'),
                    children: [
                        {
                            path: inProject('deep/_.hint'),
                            children: [
                                {
                                    path: inProject('deep/nested/_.hint'),
                                    children: [{ path: inProject('deep/nested/feature.ts.hint'), children: [] }],
                                },
                            ],
                        },
                    ],
                },
            ]);
        });

        it('normalizes a folder path to its folder hint', async () => {
            const hints = await findHints(projectRootPath, ['src']);

            expect(hints).toEqual([
                {
                    path: inProject('_.hint'),
                    children: [{ path: inProject('src/_.hint'), children: [] }],
                },
            ]);
        });

        it('normalizes a source file path to its companion hint', async () => {
            const hints = await findHints(projectRootPath, ['src/payment.ts']);

            expect(hints[0]!.children[0]!.children).toEqual([{ path: inProject('src/payment.ts.hint'), children: [] }]);
        });

        it('keeps hints for files that do not exist yet', async () => {
            const hints = await findHints(projectRootPath, ['src/upcoming.ts']);

            expect(hints[0]!.children[0]!.children).toEqual([{ path: inProject('src/upcoming.ts.hint'), children: [] }]);
        });

        it('expands glob patterns', async () => {
            const hints = await findHints(projectRootPath, ['src/*.hint']);

            const paths = hints[0]!.children[0]!.children.map((hint) => hint.path);

            expect(hints[0]!.children[0]!.path).toBe(inProject('src/_.hint'));
            expect(paths).toEqual([
                inProject('src/notes.ts.hint'),
                inProject('src/payment.ts.hint'),
            ]);
        });

        it('deduplicates repeated paths', async () => {
            const hints = await findHints(projectRootPath, [
                'src/payment.ts.hint',
                'src/payment.ts',
                'src/*.hint',
            ]);

            const paths = hints[0]!.children[0]!.children.map((hint) => hint.path);

            expect(paths.filter((path) => path === inProject('src/payment.ts.hint'))).toHaveLength(1);
        });

        it('ignores paths outside of the project root', async () => {
            expect(await findHints(projectRootPath, ['../outside.hint'])).toEqual([]);
        });
    });

    describe('parseHints', () => {
        it('wraps files and folders into running hints', async () => {
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint'], false);

            const root = hints[0]!;
            expect(root.keyword).toBe(RUNNING_FOLDER);
            expect(root.name).toBe('.');
            expect(root.body).toBe('This is the testdata project baseline context.');

            const src = root.children.find((hint) => hint.keyword === RUNNING_FOLDER)!;
            expect(src.name).toBe('src');
            expect(src.body).toBe('Shared context for source files.');

            const file = src.children.find((hint) => hint.keyword === RUNNING_FILE)!;
            expect(file.name).toBe('src/payment.ts');
            expect(file.body).toBe('Payment module specification.');
        });

        it('parses headings into nested hints with keyword, name, and id', async () => {
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint'], false);

            const file = hints[0]!.children.find((hint) => hint.keyword === RUNNING_FOLDER)!.children[0]!;
            const [
                entity,
                action,
            ] = file.children as [HintData, HintData];

            expect(entity).toMatchObject({
                level: 1,
                keyword: 'entity',
                name: 'PaymentData',
                id: 'payment_data',
                body: 'this entity describes payment data contract',
            });

            const [
                timestamp,
                amount,
            ] = entity.children as [HintData, HintData];

            expect(timestamp).toMatchObject({
                level: 2,
                keyword: 'field',
                name: 'timestamp',
                id: 'payment_timestamp',
                body: 'unix epoch milliseconds',
            });

            expect(timestamp.children[0]).toMatchObject({
                level: 3,
                keyword: 'rule',
                name: 'precision',
                id: '',
                body: 'store with millisecond precision',
            });

            expect(amount).toMatchObject({
                level: 2,
                keyword: 'field',
                name: 'amount',
                body: 'decimal string, two fraction digits',
            });

            expect(action.keyword).toBe('action');
            expect(action.id).toBe('validate_payment');
        });

        it('expands include directives into the body', async () => {
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint'], false);

            const file = hints[0]!.children.find((hint) => hint.keyword === RUNNING_FOLDER)!.children[0]!;
            const action = file.children.at(-1)!;

            expect(action.body).toBe('validate the payment fields before persisting\n\nshared **markdown** context');
        });

        it('parses synthesized folder hints with empty bodies', async () => {
            const hints = await parseHints(projectRootPath, ['deep/nested/feature.ts.hint'], false);

            const deep = hints[0]!.children.find((hint) => hint.keyword === RUNNING_FOLDER)!;
            expect(deep.name).toBe('deep');
            expect(deep.body).toBe('');

            const nested = deep.children[0]!;
            expect(nested.name).toBe('deep/nested');
            expect(nested.children[0]!.children[0]!).toMatchObject({
                keyword: 'entity',
                name: 'Feature',
                id: 'feature',
            });
        });

        it('silently skips missing hint files', async () => {
            const hints = await parseHints(projectRootPath, ['missing.ts'], false);

            const root = hints[0]!;
            expect(root.keyword).toBe(RUNNING_FOLDER);
            expect(root.children.some((hint) => hint.keyword === RUNNING_FILE)).toBe(false);
        });

        it('throws on missing hint files in dry run', async () => {
            await expect(parseHints(projectRootPath, ['missing.ts'], true)).rejects.toThrow(`Hint file not found: ${inProject('missing.ts.hint')}`);
        });
    });
});
