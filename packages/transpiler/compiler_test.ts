import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HintData } from './parser.js';
import { compileHints } from './compiler.js';
import { loadHintbook } from './hintbook.js';
import { parseHints } from './parser.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = Path.resolve(here, '../../testdata/project');
const instructionsPath = Path.resolve(here, '../../testdata/hintbook/keywords');

const hintbook = await loadHintbook(instructionsPath);

async function compileProject(paths: string[], mode = ''): Promise<string> {
    return compileHints(await parseHints(projectRootPath, paths, false), [hintbook], mode);
}

describe('compiler', () => {
    describe('compileHints', () => {
        it('renders hints through their keyword instructions', async () => {
            const output = await compileProject(['src/payment.ts.hint']);

            expect(output).toContain('<data_structure name="PaymentData" id="payment_data">');
            expect(output).toContain('this entity describes payment data contract');
            expect(output).toContain('<field name="timestamp" id="payment_timestamp">');
            expect(output).toContain('store with millisecond precision');
        });

        it('wraps files and folders into context tags with their paths', async () => {
            const output = await compileProject(['src/payment.ts.hint']);

            expect(output).toContain('<folder_context path=".">');
            expect(output).toContain('<folder_context path="src">');
            expect(output).toContain('<file_context path="src/payment.ts">');
        });

        it('expands includes into the compiled output', async () => {
            const output = await compileProject(['src/payment.ts.hint']);

            expect(output).toContain('shared **markdown** context');
        });

        it('drops hints whose instruction is marked exclude', async () => {
            const output = await compileProject(['src/notes.ts.hint']);

            expect(output).not.toContain('internal notes that must never reach the compiled prompt');
        });

        it('passes unknown keywords through as plain body', async () => {
            const output = await compileProject(['src/notes.ts.hint']);

            expect(output).toContain('custom keyword body passes through unchanged');
            expect(output).not.toContain('customkeyword');
        });

        it('wraps the output with the default mode header and footer', async () => {
            const output = await compileProject(['src/payment.ts.hint']);

            expect(output.startsWith('You are a senior software engineer implementing a project')).toBe(true);
            expect(output).toContain('The specification ends here.');
        });

        it('wraps the output with mode-specific headers', async () => {
            const fix = await compileProject(['src/payment.ts.hint'], 'fix');
            const review = await compileProject(['src/payment.ts.hint'], 'review');

            expect(fix.startsWith('You are a senior software engineer fixing defects')).toBe(true);
            expect(review.startsWith('You are a senior software engineer reviewing an implementation')).toBe(true);
        });

        it('falls back to default mode instructions for keywords missing in the requested mode', async () => {
            const output = await compileProject(['src/payment.ts.hint'], 'fix');

            expect(output).toContain('<data_structure name="PaymentData" id="payment_data">');
        });

        it('compiles without hintbooks as plain passthrough', async () => {
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint'], false);
            const output = await compileHints(hints, [], '');

            expect(output).toContain('this entity describes payment data contract');
            expect(output).not.toContain('<data_structure');
        });

        it('renders the changes section only when the mode defines a __changes__ instruction', async () => {
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint'], false);
            const drift = '- src/payment.ts: reconcile these blocks';

            // fix mode ships __changes__.fix.md in the fixture hintbook; default mode does not
            const fix = await compileHints(hints, [hintbook], 'fix', drift);
            const plain = await compileHints(hints, [hintbook], '', drift);

            expect(fix).toContain('<specification_changes>');
            expect(fix).toContain(drift);
            expect(plain).not.toContain('<specification_changes>');
            expect(plain).not.toContain(drift);
        });

        it('omits the changes section when no drift text is supplied', async () => {
            const hints = await parseHints(projectRootPath, ['src/payment.ts.hint'], false);
            const fix = await compileHints(hints, [hintbook], 'fix');

            expect(fix).not.toContain('<specification_changes>');
        });

        it('compiles empty hints to header and footer only', async () => {
            const output = await compileHints([] as HintData[], [hintbook], '');

            expect(output.startsWith('You are a senior software engineer implementing a project')).toBe(true);
            expect(output).toContain('The specification ends here.');
        });
    });
});
