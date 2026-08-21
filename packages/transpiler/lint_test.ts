import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHintbook } from './hintbook.js';
import { lintHintFiles, nearestKeyword } from './lint.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const knowledgeRoot = Path.resolve(here, '../../testdata/knowledge-repo');

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

    test('reports exactly the seeded cross-file graph defects as advisory notes', async () => {
        const book = await loadHintbook(Path.resolve(here, '../../testdata/hintbook/keywords'));
        const paths = [
            '_.hint',
            'raw/paper-a.md.hint',
            'wiki/attention/_.hint',
            'wiki/language-models/_.hint',
            'wiki/orphan.hint',
            'wiki/transformers/_.hint',
        ].map((path) => Path.join(knowledgeRoot, path));
        const findings = (await lintHintFiles(knowledgeRoot, paths, [book], { graph: true })).filter((finding) =>
            ['dead-ref', 'orphan', 'duplicate-id', 'duplicate-name', 'near-name'].includes(finding.kind),
        );

        expect(findings.map(({ kind, severity, hint }) => ({ kind, severity, hint }))).toEqual([
            { kind: 'dead-ref', severity: 'info', hint: 'wiki/attention/_.hint' },
            { kind: 'orphan', severity: 'info', hint: 'wiki/orphan.hint' },
            { kind: 'duplicate-id', severity: 'info', hint: 'wiki/transformers/_.hint' },
        ]);
    });

    test('reconciles overrides, supersedes, conflicts, and relation cycles', async () => {
        const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-relations-'));
        try {
            const book = await loadHintbook(Path.resolve(here, '../../testdata/hintbook/keywords'));
            await FsPromises.mkdir(Path.join(root, 'legacy'));
            await FsPromises.writeFile(Path.join(root, '_.hint'), '# rule Typing {#base}\n\nStrict.\n# rule Removed {#removed}\n');
            await FsPromises.writeFile(Path.join(root, 'legacy/_.hint'), '# rule Typing {#legacy overrides=base}\n\nException.\n# rule Bad {#bad overrides=missing}\n# rule Tombstone {#tomb supersedes=removed}\n# rule A {#a overrides=b}\n# rule B {#b overrides=a}\n');
            const findings = await lintHintFiles(root, [Path.join(root, 'legacy/_.hint')], [book]);
            expect(findings).toEqual(expect.arrayContaining([
                expect.objectContaining({ kind: 'relation', detail: expect.stringContaining('was not found') }),
                expect.objectContaining({ kind: 'relation', detail: expect.stringContaining('still exists') }),
                expect.objectContaining({ kind: 'relation', detail: expect.stringContaining('relation cycle') }),
            ]));
            expect(findings.some((finding) => finding.kind === 'conflict' && finding.detail.includes('Typing'))).toBe(false);
        } finally {
            await FsPromises.rm(root, { recursive: true, force: true });
        }
    });

    test('advises on a near-copy elsewhere but ignores short shared wording', async () => {
        const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-similar-'));
        try {
            const book = await loadHintbook(Path.resolve(here, '../../testdata/hintbook/keywords'));
            await FsPromises.writeFile(Path.join(root, 'first.hint'), '# rule Durable authentication\n\nEvery service account token must rotate automatically before expiry and preserve the previous audit identifier.\n');
            await FsPromises.writeFile(Path.join(root, 'second.hint'), '# rule Durable authentication copy\n\nEvery service account token must rotate automatically before expiry and preserve the previous audit identifier for tracing.\n');
            await FsPromises.writeFile(Path.join(root, 'short.hint'), '# rule Tokens\n\nRotate tokens.\n');
            const findings = await lintHintFiles(root, [Path.join(root, 'second.hint'), Path.join(root, 'short.hint')], [book]);
            expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'similar', hint: 'second.hint', severity: 'info' })]));
            expect(findings.some((finding) => finding.kind === 'similar' && finding.hint === 'short.hint')).toBe(false);
        } finally {
            await FsPromises.rm(root, { recursive: true, force: true });
        }
    });
});
