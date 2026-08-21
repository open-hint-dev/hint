import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HintData } from './parser.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import { findHints, parseHintFile, parseHints } from './parser.js';

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
        it('parses LF and CRLF files into byte-identical data', async () => {
            const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-line-endings-'));
            try {
                const source = '# rule Portable {#portable}\n\nBody text.\n\n```text\ncode line\n```\n';
                await FsPromises.writeFile(Path.join(root, 'lf.hint'), source);
                await FsPromises.writeFile(Path.join(root, 'crlf.hint'), source.replaceAll('\n', '\r\n'));
                const lf = (await parseHintFile(root, Path.join(root, 'lf.hint')))!;
                const crlf = (await parseHintFile(root, Path.join(root, 'crlf.hint')))!;

                expect(crlf.children[0]!.body).toBe(lf.children[0]!.body);
                expect(crlf.children[0]!.name).toBe(lf.children[0]!.name);
            } finally {
                await FsPromises.rm(root, { recursive: true, force: true });
            }
        });

        it('parses heading attributes and degrades malformed suffixes to ordinary name text', async () => {
            const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-attrs-'));
            try {
                await FsPromises.writeFile(Path.join(root, 'valid.hint'), '# rule Legacy {#legacy overrides=base note="two words"}\n');
                await FsPromises.writeFile(Path.join(root, 'malformed.hint'), '# rule Legacy {#legacy broken}\n');
                const valid = (await parseHintFile(root, Path.join(root, 'valid.hint')))!;
                const malformed = (await parseHintFile(root, Path.join(root, 'malformed.hint')))!;
                expect(valid.children[0]).toMatchObject({ id: 'legacy', name: 'Legacy', attrs: { overrides: 'base', note: 'two words' }, source: 'valid.hint:1' });
                expect(malformed.children[0]).toMatchObject({ id: '', name: 'Legacy {#legacy broken}', attrs: {} });
            } finally {
                await FsPromises.rm(root, { recursive: true, force: true });
            }
        });

        it('reports the include directive as source and the real heading as includedFrom', async () => {
            const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-source-'));
            try {
                await FsPromises.writeFile(Path.join(root, 'fragment.hint'), 'preamble\r\n# rule Included {#included}\r\n');
                await FsPromises.writeFile(Path.join(root, 'main.hint'), 'before\n@include fragment.hint\n');
                const parsed = (await parseHintFile(root, Path.join(root, 'main.hint')))!;
                expect(parsed.children[0]).toMatchObject({ line: 2, source: 'main.hint:2', includedFrom: 'fragment.hint:2' });
            } finally {
                await FsPromises.rm(root, { recursive: true, force: true });
            }
        });
        it('wraps files and folders into running hints', async () => {
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint']);

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
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint']);

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
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint']);

            const file = hints[0]!.children.find((hint) => hint.keyword === RUNNING_FOLDER)!.children[0]!;
            const action = file.children.at(-1)!;

            expect(action.body).toBe('validate the payment fields before persisting\n\nshared **markdown** context');
        });

        describe('@include', () => {
            async function fileHint(hintPath: string): Promise<HintData> {
                const hints = await parseHints(projectRootPath, [hintPath]);

                return hints[0]!.children.find((hint) => hint.keyword === RUNNING_FOLDER)!.children[0]!;
            }

            it('inlines the included file content as-is at the directive position', async () => {
                const file = await fileHint('includes/feature.ts.hint');

                // The unquoted @include in the file body is replaced inline with the snippet content,
                // preserving the surrounding text exactly.
                expect(file.body).toBe('File with reusable includes.\n\nreusable snippet text');
            });

            it('accepts the directive with or without surrounding quotes', async () => {
                // The payment hint uses a quoted include; the feature hint uses unquoted includes.
                // Both resolve and inline their targets.
                const quoted = await fileHint('src/payment.ts.hint');
                const unquoted = await fileHint('includes/feature.ts.hint');

                expect(quoted.children.at(-1)!.body).toContain('shared **markdown** context');
                expect(unquoted.body).toContain('reusable snippet text');
            });

            it('preserves markdown markup from the included file verbatim', async () => {
                const widget = (await fileHint('includes/feature.ts.hint')).children[0]!;

                // The included markdown keeps its emphasis markers — it is inlined, not escaped or rendered.
                expect(widget.body).toBe('a widget\n\nincluded **bold** body');
            });

            it('inlines an included .hint file as parsed hints, including its heading ids', async () => {
                const widget = (await fileHint('includes/feature.ts.hint')).children[0]!;

                // Because the include is expanded before parsing, a heading (with its {#id}) living in the
                // included .hint file becomes a real hint in the tree — proving the include is truly inlined.
                expect(widget).toMatchObject({ keyword: 'entity', name: 'Widget', id: 'widget' });
                expect(widget.children).toHaveLength(1);
                expect(widget.children[0]!).toMatchObject({
                    level: 2,
                    keyword: 'field',
                    name: 'color',
                    id: 'widget_color',
                    body: 'the widget color',
                });
            });

            it('resolves a leading-slash path from the project root and falls back to the root for bare paths', async () => {
                // rooted.ts.hint lives in includes/ but pulls shared/rooted.md two ways:
                // '/shared/rooted.md' (explicit root) and 'shared/rooted.md' (relative miss -> root fallback).
                const file = await fileHint('includes/rooted.ts.hint');

                expect(file.body).toBe('Root resolution check.\n\nrooted content\n\nrooted content');
            });

            it('throws on a missing include target', async () => {
                await expect(parseHints(projectRootPath, ['includes/missing.ts.hint'])).rejects.toThrow(/@include target not found/);
            });

            it('throws on a circular include', async () => {
                await expect(parseHints(projectRootPath, ['includes/cyclic.ts.hint'])).rejects.toThrow(/@include cycle detected/);
            });

            it('does not expand include examples inside fenced code', async () => {
                const file = await fileHint('includes/fenced.ts.hint');
                expect(file.body).toContain('@include this-file-does-not-exist.md');
                expect(file.children[0]).toMatchObject({ keyword: 'entity', name: 'Fenced' });
            });
        });

        it('parses synthesized folder hints with empty bodies', async () => {
            const hints = await parseHints(projectRootPath, ['deep/nested/feature.ts.hint']);

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

        it('strips the .hint tail from detached hint folders when deriving target paths', async () => {
            const hints = await parseHints(projectRootPath, ['packages.hint/db/schema.ts.hint']);

            // The folder hint `packages.hint/_.hint` describes the real `packages` folder, and the
            // file hint `packages.hint/db/schema.ts.hint` describes `packages/db/schema.ts` — the
            // `.hint` tail is dropped from every folder segment, but the file name is kept.
            const packages = hints[0]!.children.find((hint) => hint.keyword === RUNNING_FOLDER)!;
            expect(packages.name).toBe('packages');

            const db = packages.children.find((hint) => hint.keyword === RUNNING_FOLDER)!;
            expect(db.name).toBe('packages/db');

            const schema = db.children.find((hint) => hint.keyword === RUNNING_FILE)!;
            expect(schema.name).toBe('packages/db/schema.ts');
            expect(schema.children[0]!).toMatchObject({ keyword: 'entity', name: 'Schema', id: 'db_schema' });
        });

        // The parser has no opinion about intent: a hint file that is not on disk contributes nothing,
        // and only the inherited context survives. Whether the caller *asked* for something that does
        // not exist is decided and reported in `resolve.ts` — see resolve_test.
        it('skips missing hint files, keeping the inherited context', async () => {
            const hints = await parseHints(projectRootPath, ['missing.ts']);

            const root = hints[0]!;
            expect(root.keyword).toBe(RUNNING_FOLDER);
            expect(root.children.some((hint) => hint.keyword === RUNNING_FILE)).toBe(false);
        });
    });
});
