import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHintbook } from './hintbook.js';
import { lintHintFiles, nearestKeyword } from './lint.js';

const here = Path.dirname(fileURLToPath(import.meta.url));

describe('hint lint', () => {
    test('recognizes case and edit-distance near misses without claiming custom headings', async () => {
        const book = await loadHintbook(Path.resolve(here, '../../testdata/hintbook/keywords'));

        expect(nearestKeyword('Rule', [book])).toBe('rule');
        expect(nearestKeyword('rul', [book])).toBe('rule');
        expect(nearestKeyword('my-custom-heading', [book])).toBeNull();
    });

    test('collects vocabulary, duplicate-id, empty, and broken-include findings per file', async () => {
        const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-lint-'));
        try {
            const book = await loadHintbook(Path.resolve(here, '../../testdata/hintbook/keywords'));
            const paths = ['near.hint', 'custom.hint', 'duplicate.hint', 'empty.hint', 'broken.hint'];
            await FsPromises.writeFile(Path.join(root, 'near.hint'), '# Rule Important\n');
            await FsPromises.writeFile(Path.join(root, 'custom.hint'), '# my-custom-heading Accepted\n');
            await FsPromises.writeFile(Path.join(root, 'duplicate.hint'), '# rule One {#same}\n\n# rule Two {#same}\n');
            await FsPromises.writeFile(Path.join(root, 'empty.hint'), '');
            await FsPromises.writeFile(Path.join(root, 'broken.hint'), '@include missing.md\n');

            const findings = await lintHintFiles(root, paths.map((path) => Path.join(root, path)), [book]);
            expect(findings).toEqual(expect.arrayContaining([
                expect.objectContaining({ kind: 'vocab', hint: 'near.hint', severity: 'finding', suggestion: 'rule' }),
                expect.objectContaining({ kind: 'vocab', hint: 'custom.hint', severity: 'info' }),
                expect.objectContaining({ kind: 'duplicate-id', hint: 'duplicate.hint', severity: 'finding' }),
                expect.objectContaining({ kind: 'empty', hint: 'empty.hint', severity: 'finding' }),
                expect.objectContaining({ kind: 'include', hint: 'broken.hint', severity: 'finding' }),
            ]));
        } finally {
            await FsPromises.rm(root, { recursive: true, force: true });
        }
    });
});
