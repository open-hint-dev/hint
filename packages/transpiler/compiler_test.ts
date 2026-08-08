import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HintData } from './parser.js';
import { renderContext, renderPrompt } from './compiler.js';
import { loadHintbook, RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import { parseHints } from './parser.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = Path.resolve(here, '../../testdata/project');
const instructionsPath = Path.resolve(here, '../../testdata/hintbook/keywords');

const hintbook = await loadHintbook(instructionsPath);

async function contextFor(paths: string[]): Promise<string> {
    return renderContext(await parseHints(projectRootPath, paths), [hintbook]);
}

// Synthetic hint nodes, so the elision branches can be exercised precisely without carrying a fixture
// for every shape. `keyword: 'data'` maps to the fixture's data_structure template.
const folder = (name: string, children: HintData[], body = ''): HintData => ({ level: 0, keyword: RUNNING_FOLDER, id: '', name, body, children });
const file = (name: string, children: HintData[] = [], body = ''): HintData => ({ level: 0, keyword: RUNNING_FILE, id: '', name, body, children });
const block = (keyword: string, name: string, body: string): HintData => ({ level: 1, keyword, id: '', name, body, children: [] });

describe('compiler', () => {
    describe('renderContext', () => {
        it('renders hints through their keyword instructions', async () => {
            const output = await contextFor(['src/payment.ts.hint']);

            expect(output).toContain('<data_structure name="PaymentData" id="payment_data">');
            expect(output).toContain('this entity describes payment data contract');
            expect(output).toContain('<field name="timestamp" id="payment_timestamp">');
            expect(output).toContain('store with millisecond precision');
        });

        it('wraps files and folders into context tags with their paths', async () => {
            const output = await contextFor(['src/payment.ts.hint']);

            expect(output).toContain('<folder_context path=".">');
            expect(output).toContain('<folder_context path="src">');
            expect(output).toContain('<file_context path="src/payment.ts">');
        });

        it('elides empty folder wrappers, promoting their nested targets', async () => {
            const output = await contextFor(['deep/nested/feature.ts.hint']);

            // deep/ and deep/nested/ have no _.hint of their own — pure nesting, so no wrapper is emitted
            expect(output).not.toContain('<folder_context path="deep">');
            expect(output).not.toContain('<folder_context path="deep/nested">');
            // the file target itself, which carries its full path, is still emitted
            expect(output).toContain('<file_context path="deep/nested/feature.ts">');
        });

        it('keeps folder wrappers that declare their own context', async () => {
            const output = await contextFor(['src/payment.ts.hint']);

            // src/_.hint has body content, so its wrapper carries a directive and must survive
            expect(output).toContain('<folder_context path="src">');
        });

        it('collapses runs of blank lines left by empty wrapper slots', async () => {
            const output = await contextFor(['deep/nested/feature.ts.hint']);

            expect(output).not.toMatch(/\n{3,}/);
        });

        it('drops a file wrapper that has no directives of its own', async () => {
            const output = renderContext([file('src/empty.ts')], [hintbook]);

            expect(output).not.toContain('<file_context path="src/empty.ts">');
        });

        it('keeps a folder whose only directive is a heading block, not preamble body', async () => {
            const tree = folder('pkg', [block('entity', 'Thing', 'the thing contract')]);
            const output = renderContext([tree], [hintbook]);

            expect(output).toContain('<folder_context path="pkg">');
            expect(output).toContain('<data_structure name="Thing"');
        });

        it('elides an empty folder and promotes all of its nested targets', async () => {
            const tree = folder('pkg', [
                file('pkg/a.ts', [block('entity', 'A', 'a contract')]),
                file('pkg/b.ts', [block('entity', 'B', 'b contract')]),
            ]);
            const output = renderContext([tree], [hintbook]);

            expect(output).not.toContain('<folder_context path="pkg">');
            expect(output).toContain('<file_context path="pkg/a.ts">');
            expect(output).toContain('<file_context path="pkg/b.ts">');
        });

        it('collapses a chain of empty folders down to the deepest real target', async () => {
            const tree = folder('a', [folder('a/b', [folder('a/b/c', [file('a/b/c/leaf.ts', [block('entity', 'Leaf', 'leaf contract')])])])]);
            const output = renderContext([tree], [hintbook]);

            expect(output).not.toContain('<folder_context path="a">');
            expect(output).not.toContain('<folder_context path="a/b">');
            expect(output).not.toContain('<folder_context path="a/b/c">');
            expect(output).toContain('<file_context path="a/b/c/leaf.ts">');
            expect(output).toContain('<data_structure name="Leaf"');
        });

        it('expands includes into the compiled output', async () => {
            const output = await contextFor(['src/payment.ts.hint']);

            expect(output).toContain('shared **markdown** context');
        });

        it('drops hints whose instruction is marked exclude', async () => {
            const output = await contextFor(['src/notes.ts.hint']);

            expect(output).not.toContain('internal notes that must never reach the compiled prompt');
        });

        it('passes unknown keywords through as plain body', async () => {
            const output = await contextFor(['src/notes.ts.hint']);

            expect(output).toContain('custom keyword body passes through unchanged');
            expect(output).not.toContain('customkeyword');
        });

        it('emits no persona, glossary, or reporting framing', async () => {
            const output = await contextFor(['src/payment.ts.hint']);

            // The whole point of the default artifact: knowledge only. Framing is `renderPrompt`'s job.
            expect(output).not.toContain('The tag glossary below defines');
            expect(output).not.toContain('You are a senior software engineer');
            expect(output).not.toContain('The specification ends here.');
            expect(output.startsWith('<folder_context path=".">')).toBe(true);
        });

        it('costs in proportion to the knowledge it carries', () => {
            const nothing = renderContext([], [hintbook]);
            const one = renderContext([file('a.ts', [block('entity', 'A', 'a')])], [hintbook]);
            const three = renderContext(
                [
                    file('a.ts', [block('entity', 'A', 'a')]),
                    file('b.ts', [block('entity', 'B', 'b')]),
                    file('c.ts', [block('entity', 'C', 'c')]),
                ],
                [hintbook],
            );

            // No fixed floor: a path nothing applies to returns nothing at all, and output grows with the
            // knowledge rather than around a constant scaffold.
            expect(nothing).toBe('');
            expect(one.length).toBeLessThan(200);
            expect(three.length).toBeGreaterThan(one.length * 2.5);
        });

        it('renders without hintbooks as plain passthrough', async () => {
            const output = renderContext(await parseHints(projectRootPath, ['src/payment.ts.hint']), []);

            expect(output).toContain('this entity describes payment data contract');
            expect(output).not.toContain('<data_structure');
        });

    });

    describe('renderPrompt', () => {
        it('adds the persona header and the reporting footer around the context', async () => {
            const context = await contextFor(['src/payment.ts.hint']);
            const output = renderPrompt(context, [hintbook]);

            expect(output.startsWith('You are a senior software engineer implementing a project')).toBe(true);
            expect(output).toContain(context);
            expect(output).toContain('The specification ends here.');
        });

        it('prepends the tag glossary when standalone', async () => {
            const output = renderPrompt(await contextFor(['src/payment.ts.hint']), [hintbook], { standalone: true });

            expect(output.startsWith('The following prompt uses a structured')).toBe(true);
            expect(output).toContain('The tag glossary below defines');
            expect(output).toContain('You are a senior software engineer implementing a project');
        });

        it('omits the glossary unless standalone is asked for', async () => {
            const output = renderPrompt(await contextFor(['src/payment.ts.hint']), [hintbook]);

            expect(output).not.toContain('The tag glossary below defines');
        });

        it('renders reconciliation guidance only when drift is supplied', async () => {
            const context = await contextFor(['src/payment.ts.hint']);
            const changes = '- src/payment.ts: reconcile these blocks';

            const drifted = renderPrompt(context, [hintbook], { changes });
            const clean = renderPrompt(context, [hintbook]);

            expect(drifted).toContain('<specification_changes>');
            expect(drifted).toContain(changes);
            expect(clean).not.toContain('<specification_changes>');
        });

        it('frames an empty context as header and footer only', () => {
            const output = renderPrompt(renderContext([] as HintData[], [hintbook]), [hintbook]);

            expect(output.startsWith('You are a senior software engineer implementing a project')).toBe(true);
            expect(output).toContain('The specification ends here.');
        });
    });
});
