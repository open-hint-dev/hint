import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = Path.dirname(fileURLToPath(import.meta.url));

it('scopes HINT headings, ids, and includes while leaving fenced examples alone', async () => {
    const grammar = JSON.parse(await FsPromises.readFile(Path.resolve(here, '../../editors/hint.tmLanguage.json'), 'utf8')) as {
        repository: { heading: { match: string }; include: { match: string }; fenced: { begin: string; end: string } };
    };
    const heading = new RegExp(grammar.repository.heading.match);
    const include = new RegExp(grammar.repository.include.match);
    const fenceBegin = new RegExp(grammar.repository.fenced.begin);

    expect(heading.exec('# decision Storage {#storage}')?.[2]).toBe('decision');
    expect(heading.exec('# decision Storage {#storage}')?.[3]).toBe('{#storage}');
    expect(heading.test('# invented Custom')).toBe(false);
    expect(include.exec('@include shared/rules.md')?.[1]).toBe('@include');
    expect(fenceBegin.test('```hint')).toBe(true);

    const lines = ['```hint', '# decision NotSyntax {#fake}', '```'];
    let fenced = false;
    const scoped = lines.filter((line) => {
        if (fenceBegin.test(line)) {
            fenced = !fenced;
            return false;
        }
        return !fenced && heading.test(line);
    });
    expect(scoped).toEqual([]);
});
