import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { searchHints } from './search.js';

const here = Path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = Path.resolve(here, '../../testdata/project');

describe('searchHints', () => {
    it('ranks the hint whose spec matches the query first, with a positive score', async () => {
        const results = await searchHints(projectRootPath, 'payment');

        expect(results[0]?.hint).toBe('src/payment.ts.hint');
        expect(results[0]?.score).toBeGreaterThan(0);
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
});
