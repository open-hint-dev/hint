import { execFile } from 'node:child_process';
import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { promisify } from 'node:util';

import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import type { StatusReport } from './status.js';
import { isUnderScope, parsePorcelain, readGitSnapshot, toGitPath } from './git.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import { collectScopeNodes } from './parser.js';
import { collectContractScopes, formatStaleness, measureStaleness } from './staleness.js';
import { countFindings, countPending, formatStatus } from './status.js';

const execFileAsync = promisify(execFile);
const nested: string[] = [];

afterAll(async () => {
    for (const root of nested) {
        await FsPromises.rm(root, { recursive: true, force: true });
    }
});

it('keeps both sides of a NUL-delimited rename without mangling the source', () => {
    expect([...parsePorcelain('R  new/path.ts\0old/path.ts\0 M normal.ts\0', '')]).toEqual(['new/path.ts', 'old/path.ts', 'normal.ts']);
});

function block(keyword: string, name: string, children: HintData[] = []): HintData {
    return { level: 1, keyword, id: '', name, body: '', children };
}

function scope(keyword: string, name: string, children: HintData[] = []): HintData {
    return { level: 0, keyword, id: '', name, body: '', children };
}

const hintbooks: HintbookData[] = [
    {
        instructions: [
            { name: 'func', content: '{name}', metadata: { surface: true } },
            { name: 'decision', content: '{name}' },
        ],
    },
];

describe('isUnderScope', () => {
    it('treats the repository root as containing everything', () => {
        expect(isUnderScope('src/a.ts', '.')).toBe(true);
    });

    it('matches the scope itself and its descendants', () => {
        expect(isUnderScope('src/auth', 'src/auth')).toBe(true);
        expect(isUnderScope('src/auth/token.ts', 'src/auth')).toBe(true);
    });

    // `src/authentication` is not inside `src/auth`, and a bare prefix test would say it is.
    it('does not match a sibling sharing a name prefix', () => {
        expect(isUnderScope('src/authentication/token.ts', 'src/auth')).toBe(false);
    });
});

describe('toGitPath', () => {
    it('leaves an already forward-slashed path alone', () => {
        expect(toGitPath('src/auth/_.hint')).toBe('src/auth/_.hint');
    });
});

describe('collectScopeNodes', () => {
    it('returns folder scopes as well as file scopes', () => {
        const tree = [
            scope(RUNNING_FOLDER, '.', [
                block('decision', 'Root rule'),
                scope(RUNNING_FOLDER, 'src', [scope(RUNNING_FILE, 'src/login.ts')]),
            ]),
        ];

        expect(collectScopeNodes(tree).map((node) => [node.kind, node.name])).toEqual([
            ['folder', '.'],
            ['folder', 'src'],
            ['file', 'src/login.ts'],
        ]);
    });
});

describe('collectContractScopes', () => {
    it('marks a scope a contract only when it declares a surface keyword', () => {
        const tree = [
            scope(RUNNING_FOLDER, '.', [
                block('decision', 'Money is integer minor units'),
                scope(RUNNING_FILE, 'src/login.ts', [block('func', 'executeLogin')]),
            ]),
        ];

        const contracts = collectContractScopes(tree, hintbooks);

        expect(contracts.get('.')).toBe(false);
        expect(contracts.get('src/login.ts')).toBe(true);
    });

    // A folder's own blocks decide its kind; a contract nested in a child file is that child's business.
    it('does not inherit a child file’s surfaces up to its folder', () => {
        const tree = [scope(RUNNING_FOLDER, 'src', [scope(RUNNING_FILE, 'src/login.ts', [block('func', 'executeLogin')])])];

        expect(collectContractScopes(tree, hintbooks).get('src')).toBe(false);
    });
});

describe('formatStaleness', () => {
    it('names a single-file scope directly rather than as a ratio', () => {
        expect(
            formatStaleness({ hintPath: 'src/login.ts.hint', target: 'src/login.ts', changed: 1, total: 1, contract: true, stale: true }),
        ).toBe('src/login.ts changed since src/login.ts.hint was last updated, and it declares surfaces the code must contain');
    });

    it('reports a folder scope as a share of its files', () => {
        expect(formatStaleness({ hintPath: 'src/_.hint', target: 'src', changed: 7, total: 10, contract: false, stale: true })).toBe(
            '7 of 10 files under src changed since src/_.hint was last updated, and it records knowledge',
        );
    });
});

describe('status report', () => {
    const report: StatusReport = {
        scanned: 3,
        git: true,
        locked: false,
        entries: [
            { kind: 'orphan', hint: 'src/gone.ts.hint', target: 'src/gone.ts', detail: 'target was removed from the repository' },
            { kind: 'pending', hint: 'src/planned.ts.hint', target: 'src/planned.ts', detail: 'target has not been written yet' },
        ],
    };

    it('counts pending separately from findings', () => {
        expect(countFindings(report)).toBe(1);
        expect(countPending(report)).toBe(1);
    });

    it('keeps pending rows out of the table so real tails stay visible', () => {
        const table = formatStatus(report);

        expect(table).toContain('orphan');
        expect(table).not.toContain('pending');
    });

    it('renders nothing at all when there is nothing to report', () => {
        expect(formatStatus({ ...report, entries: [] })).toBe('');
    });
});

// `git status --porcelain` reports from the *git* root, unlike every other read here, so a HINT
// project sitting inside a larger repository needs the prefix stripped or nothing ever matches.
describe('readGitSnapshot in a nested project', () => {
    it('reports dirty paths relative to the project root, not the git root', async () => {
        const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-nested-'));

        nested.push(root);

        const project = Path.join(root, 'packages', 'app');

        await FsPromises.mkdir(Path.join(project, 'src'), { recursive: true });
        await FsPromises.writeFile(Path.join(project, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');

        await execFileAsync('git', ['init', '-q'], { cwd: root });
        await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
        await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
        await execFileAsync('git', ['add', '-A'], { cwd: root });
        await execFileAsync('git', ['commit', '-q', '-m', 'init'], { cwd: root });

        await FsPromises.writeFile(Path.join(project, 'src', 'a.ts'), 'export const a = 2;\n', 'utf8');

        const snapshot = await readGitSnapshot(project);

        expect(snapshot).not.toBeNull();
        expect(snapshot!.trackedFiles).toEqual(['src/a.ts']);
        expect([...snapshot!.dirty]).toEqual(['src/a.ts']);
    });

    it('returns null when asked about no paths at all', async () => {
        expect(await readGitSnapshot(process.cwd(), [])).toBeNull();
    });

    it('returns null outside a git repository', async () => {
        const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-nogit-'));

        nested.push(root);

        expect(await readGitSnapshot(root)).toBeNull();
    });
});

// The three ways `measureStaleness` has nothing honest to say. Each returns null rather than a
// reading, because an unmeasurable scope must never be reported as a fresh one.
describe('measureStaleness declines to guess', () => {
    const scope = { hintPath: 'src/_.hint', target: 'src', contract: false };

    it('says nothing while the hint file itself is being edited', async () => {
        const snapshot = { trackedFiles: ['src/a.ts'], dirty: new Set(['src/_.hint']) };

        expect(await measureStaleness(process.cwd(), snapshot, scope)).toBeNull();
    });

    it('says nothing when the scope has no tracked files to measure against', async () => {
        const snapshot = { trackedFiles: [], dirty: new Set<string>() };

        expect(await measureStaleness(process.cwd(), snapshot, scope)).toBeNull();
    });

    it('says nothing for a hint that has never been committed', async () => {
        const snapshot = { trackedFiles: ['src/a.ts'], dirty: new Set<string>() };

        expect(await measureStaleness(process.cwd(), snapshot, { ...scope, hintPath: 'src/never-committed-anywhere.hint' })).toBeNull();
    });
});
