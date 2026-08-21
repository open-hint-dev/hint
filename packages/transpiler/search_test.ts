import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { searchHints } from './search.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = Path.resolve(here, '../../testdata/project');
const knowledgeRootPath = Path.resolve(here, '../../testdata/knowledge-repo');

describe('searchHints', () => {
    it('ranks the hint whose spec matches the query first, with a positive score', async () => {
        const results = await searchHints(projectRootPath, 'payment');

        expect(results[0]?.hint).toBe('src/payment.ts.hint');
        expect(results[0]?.score).toBeGreaterThan(0);
        expect(results[0]?.line).toBeGreaterThan(0);
    });

    it('optionally appends one-hop graph neighbors with a discounted score and via marker', async () => {
        const plain = await searchHints(knowledgeRootPath, 'selects relevant context', { limit: 20 });
        const expanded = await searchHints(knowledgeRootPath, 'selects relevant context', { limit: 20, expand: true });
        expect(plain.some((result) => result.hint === 'wiki/transformers/_.hint')).toBe(false);
        expect(expanded).toEqual(expect.arrayContaining([
            expect.objectContaining({ hint: 'wiki/transformers/_.hint', via: 'wiki/attention' }),
        ]));
    });

    it('finds hints kept in detached `.hint` folder stores', async () => {
        const results = await searchHints(projectRootPath, 'schema');

        expect(results[0]?.hint).toBe('packages.hint/db/schema.ts.hint');
    });

    it('bridges synonyms and acronyms — `database` reaches a hint that only says `db`', async () => {
        const results = await searchHints(projectRootPath, 'database');

        expect(results.map((result) => result.hint)).toContain('packages.hint/db/schema.ts.hint');
    });

    it('tolerates typos through the fuzzy fallback', async () => {
        const results = await searchHints(projectRootPath, 'paymnt');

        expect(results[0]?.hint).toBe('src/payment.ts.hint');
    });

    it('returns nothing for an empty query', async () => {
        expect(await searchHints(projectRootPath, '   ')).toEqual([]);
    });

    it('returns nothing when no spec is relevant, rather than guessing', async () => {
        expect(await searchHints(projectRootPath, 'kubernetes helm rollout')).toEqual([]);
    });

    it('honours the result limit', async () => {
        const results = await searchHints(projectRootPath, 'payment schema', { limit: 1 });

        expect(results).toHaveLength(1);
    });

    it('skips malformed specs instead of throwing (the testdata project contains broken includes)', async () => {
        const results = await searchHints(projectRootPath, 'payment');

        expect(results.length).toBeGreaterThan(0);
    });

    it('indexes Cyrillic, CJK bigrams, and canonically equivalent Unicode', async () => {
        const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-unicode-'));
        try {
            await FsPromises.writeFile(Path.join(root, 'hint.yml'), 'name: unicode\n');
            await FsPromises.writeFile(Path.join(root, 'ru.txt.hint'), '# решение Оплата\n\nПроверка платежей и cafe\u0301.\n');
            await FsPromises.writeFile(Path.join(root, 'zh.txt.hint'), '# 决策 支付\n\n用户支付流程。\n');
            expect((await searchHints(root, 'платежей'))[0]?.hint).toBe('ru.txt.hint');
            expect((await searchHints(root, '支付流程'))[0]?.hint).toBe('zh.txt.hint');
            expect((await searchHints(root, 'café'))[0]?.hint).toBe('ru.txt.hint');
        } finally {
            await FsPromises.rm(root, { recursive: true, force: true });
        }
    });

    it('uses synonym groups supplied as hintbook data', async () => {
        const root = await FsPromises.mkdtemp(Path.join(Os.tmpdir(), 'hint-domain-search-'));
        try {
            await FsPromises.writeFile(Path.join(root, 'cats.hint'), '# claim Felines\n\nFeline cognition.\n');
            const results = await searchHints(root, 'catlike', {
                hintbooks: [{ instructions: [], synonyms: [['catlike', 'feline']] }],
            });
            expect(results[0]?.hint).toBe('cats.hint');
        } finally {
            await FsPromises.rm(root, { recursive: true, force: true });
        }
    });
});
