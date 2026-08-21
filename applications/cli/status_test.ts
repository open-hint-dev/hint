import { execFile } from 'node:child_process';
import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';
import { promisify } from 'node:util';

import { main } from './main.js';

const execFileAsync = promisify(execFile);

type CliResult = {
    stdout: string;
    stderr: string;
    exitCode: number | string | undefined;
};

async function runCli(args: string[], cwd: string): Promise<CliResult> {
    const previousCwd = process.cwd();
    const previousArgv = process.argv;
    const previousExitCode = process.exitCode;

    const stdout: string[] = [];
    const stderr: string[] = [];

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdout.push(String(chunk));
        return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr.push(String(chunk));
        return true;
    });

    process.chdir(cwd);
    process.argv = [
        'node',
        'hint',
        ...args,
    ];
    process.exitCode = undefined;

    try {
        await main();

        return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode: process.exitCode };
    } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();

        process.argv = previousArgv;
        process.exitCode = previousExitCode;
        process.chdir(previousCwd);
    }
}

const roots: string[] = [];

async function write(root: string, path: string, content: string): Promise<void> {
    const filePath = Path.join(root, path);

    await FsPromises.mkdir(Path.dirname(filePath), { recursive: true });
    await FsPromises.writeFile(filePath, content, 'utf8');
}

async function git(root: string, ...args: string[]): Promise<void> {
    await execFileAsync('git', args, { cwd: root });
}

async function commit(root: string, message: string): Promise<void> {
    await git(root, 'add', '-A');
    await git(root, 'commit', '-q', '-m', message);
}

// A throwaway HINT project. `initGit: false` produces the same project outside version control, which
// is what proves the staleness signal degrades to silence instead of to guesses.
async function makeProject(initGit = true): Promise<string> {
    const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-status-'));

    roots.push(root);

    await write(root, 'hint.yml', 'name: temp\nbooks:\n    - file://books\n');
    await write(root, 'books/keywords/hintbook.json', '{"id":"temp"}');
    await write(root, 'books/keywords/__file__.md', '<file_context path="{name}">\n\n{children}\n\n</file_context>');
    await write(root, 'books/keywords/__folder__.md', '<folder_context path="{name}">\n\n{children}\n\n</folder_context>');
    await write(root, 'books/keywords/decision.md', '<decision name="{name}">\n\n{body}\n\n</decision>');
    // The only keyword flagged `surface: true`, so it is the only one that makes a scope a contract.
    await write(root, 'books/keywords/func.md', '---\nsurface: true\n---\n\n<function name="{name}">\n\n{body}\n\n</function>');
    await write(root, 'books/ts/hintbook.json', '{"id":"emit-ts","target":"typescript","match":["*.ts"],"comment":"// {text}"}');
    await write(root, 'books/ts/func.tmpl', '{?{doc}\n}export function {name}() {\n    {hole:body|throw new Error("todo");}\n}');

    if (initGit) {
        await git(root, 'init', '-q');
        await git(root, 'config', 'user.email', 'test@example.com');
        await git(root, 'config', 'user.name', 'Test');
        await git(root, 'config', 'commit.gpgsign', 'false');
    }

    return root;
}

afterAll(async () => {
    for (const root of roots) {
        await FsPromises.rm(root, { recursive: true, force: true });
    }
});

describe('status', () => {
    it('keeps inventorying detached stores, broken includes, cycles, and holes outside git', async () => {
        const root = await makeProject(false);
        await write(root, 'packages/db/value.ts', 'export const value = 1;\n');
        await write(root, 'packages.hint/_.hint', '# decision Detached\n\nKept separately.\n');
        await write(root, 'good.ts.hint', '# func good\n\nImplement it.\n');
        await runCli(['emit', 'good.ts.hint'], root);
        await write(root, 'broken.ts.hint', '@include missing.md\n');
        await write(root, 'cycle.ts.hint', '@include cycle.md\n');
        await write(root, 'cycle.md', '@include cycle.ts.hint\n');

        const result = await runCli(['status', '--json', '--exit-code'], root);
        const report = JSON.parse(result.stdout) as { entries: { kind: string; hint: string }[] };
        expect(report.entries.filter((entry) => entry.kind === 'broken').map((entry) => entry.hint)).toEqual(['broken.ts.hint', 'cycle.ts.hint']);
        expect(report.entries.some((entry) => entry.kind === 'unfilled' && entry.hint === 'good.ts.hint')).toBe(true);
        expect(result.stderr).toContain('not a git repository');
        expect(result.exitCode).toBe(1);
    });

    it('exits 2 when the project has no .hint files at all', async () => {
        const root = await makeProject();

        await commit(root, 'init');

        const result = await runCli(['status'], root);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('no .hint files in this project');
        expect(result.stderr).not.toContain('nothing has come loose');
    });

    it('reports a clean inventory over a non-empty set', async () => {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        const result = await runCli(['status'], root);

        expect(result.exitCode).toBeUndefined();
        expect(result.stderr).toContain('1 hint file(s) inventoried — nothing has come loose');
        expect(result.stdout).toBe('');
    });

    it('includes invalid knowledge relations in the project inventory', async () => {
        const root = await makeProject(false);
        await write(root, 'src/value.ts', 'export const value = 1;\n');
        await write(root, 'src/value.ts.hint', '# decision Local rule {#local overrides=missing}\n\nNarrow exception.\n');

        const result = await runCli(['status', '--json', '--exit-code'], root);
        const report = JSON.parse(result.stdout) as { entries: { kind: string; detail: string }[] };

        expect(report.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: 'lint', detail: expect.stringContaining('overrides target {#missing} was not found') }),
        ]));
        expect(result.exitCode).toBe(1);
    });

    it('queues origin=agent blocks without git and promotes them only under --strict-curation', async () => {
        const root = await makeProject(false);
        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# decision Login {#login origin=agent}\n\nRecorded by an agent.\n');

        const advisory = await runCli(['status', '--json', '--exit-code'], root);
        const report = JSON.parse(advisory.stdout) as { entries: { kind: string; hint: string }[] };
        expect(report.entries).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'unreviewed', hint: 'src/login.ts.hint:1' })]));
        expect(advisory.exitCode).toBeUndefined();
        expect(advisory.stderr).toContain('1 agent-authored block(s) await human review');
        expect((await runCli(['status', '--strict-curation'], root)).exitCode).toBe(1);

        await write(root, 'src/login.ts.hint', '# decision Login {#login}\n\nReviewed.\n');
        expect((await runCli(['status', '--json'], root)).stdout).not.toContain('unreviewed');
    });

    it('uses configured git author globs without guessing unmatched identities', async () => {
        const root = await makeProject();
        await write(root, 'hint.yml', 'name: temp\nbooks:\n    - file://books\ncuration:\n    agent_authors:\n        - "*bot*"\n');
        await write(root, 'src/bot.ts', 'export const a = 1;\n');
        await write(root, 'src/bot.ts.hint', '# decision Automated\n\nRecorded.\n');
        await git(root, 'config', 'user.name', 'Build Bot');
        await git(root, 'config', 'user.email', 'bot@example.com');
        await commit(root, 'bot knowledge');

        const bot = JSON.parse((await runCli(['status', '--json'], root)).stdout) as { entries: { kind: string }[] };
        expect(bot.entries.some((entry) => entry.kind === 'unreviewed')).toBe(true);

        await git(root, 'config', 'user.name', 'Human Reviewer');
        await git(root, 'config', 'user.email', 'human@example.com');
        await write(root, 'src/bot.ts.hint', '# decision Automated\n\nReviewed by a person.\n');
        await commit(root, 'review knowledge');
        const reviewed = JSON.parse((await runCli(['status', '--json'], root)).stdout) as { entries: { kind: string }[] };
        expect(reviewed.entries.some((entry) => entry.kind === 'unreviewed')).toBe(false);
    });

    it('flags a spec whose target was deleted as orphaned', async () => {
        const root = await makeProject();

        await write(root, 'src/legacy.ts', 'export const a = 1;\n');
        await write(root, 'src/legacy.ts.hint', '# decision Kept for the old client\n\nBecause.\n');
        await commit(root, 'init');

        await FsPromises.rm(Path.join(root, 'src/legacy.ts'));
        await commit(root, 'drop the target');

        const result = await runCli(['status'], root);

        expect(result.stdout).toContain('orphan');
        expect(result.stdout).toContain('src/legacy.ts.hint');
        expect(result.stdout).toContain('target was removed from the repository');
        expect(result.stderr).toContain('1 of 1 hint file(s) need attention');
    });

    it('treats a spec written before its target as pending, not as a finding', async () => {
        const root = await makeProject();

        await write(root, 'src/existing.ts', 'export const a = 1;\n');
        await write(root, 'src/planned.ts.hint', '# func plan\n\nNot written yet.\n');
        await commit(root, 'init');

        const result = await runCli([
            'status',
            '--exit-code',
        ], root);

        // Kept out of the table so real tails are not buried, but counted and reachable via --json.
        expect(result.stdout).toBe('');
        expect(result.exitCode).toBeUndefined();
        expect(result.stderr).toContain('1 spec(s) describe a target that is not written yet');
        expect(result.stderr).toContain('nothing has come loose');

        const json = JSON.parse((await runCli(['status', '--json'], root)).stdout);

        expect(json.entries).toEqual([
            { kind: 'pending', hint: 'src/planned.ts.hint', target: 'src/planned.ts', detail: 'target has not been written yet' },
        ]);
    });

    it('flags a contract spec as stale as soon as its target moves', async () => {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        await write(root, 'src/login.ts', 'export const a = 2;\n');
        await commit(root, 'change the code');

        const result = await runCli(['status'], root);

        expect(result.stdout).toContain('stale');
        expect(result.stdout).toContain('src/login.ts.hint');
        expect(result.stdout).toContain('the target changed since this hint was last updated');
    });

    // The whole point of splitting the thresholds: a rationale that survived a refactor is not a defect,
    // and a signal that fires on every refactor is one agents learn to skip.
    it('holds knowledge-only scopes to a looser threshold than contracts', async () => {
        const root = await makeProject();

        for (let index = 0; index < 10; index++) {
            await write(root, `src/mod${index}.ts`, 'export const a = 1;\n');
        }

        await write(root, 'src/_.hint', '# decision Money is integer minor units\n\nBecause decimals drifted.\n');
        await commit(root, 'init');

        await write(root, 'src/mod0.ts', 'export const a = 2;\n');
        await write(root, 'src/mod1.ts', 'export const a = 2;\n');
        await commit(root, 'touch two of ten');

        const quiet = await runCli(['status'], root);

        expect(quiet.stdout).not.toContain('stale');

        for (let index = 2; index < 7; index++) {
            await write(root, `src/mod${index}.ts`, 'export const a = 3;\n');
        }

        await commit(root, 'touch five more');

        const loud = await runCli(['status'], root);

        expect(loud.stdout).toContain('stale');
        expect(loud.stdout).toContain('7 of 10 files under the target changed');
    });

    it('exits 1 with --exit-code when something needs attention', async () => {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        await write(root, 'src/login.ts', 'export const a = 2;\n');
        await commit(root, 'change the code');

        expect((await runCli(['status'], root)).exitCode).toBeUndefined();
        expect(
            (
                await runCli([
                    'status',
                    '--exit-code',
                ], root)
            ).exitCode,
        ).toBe(1);
    });

    it('prints the inventory as JSON', async () => {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        await write(root, 'src/login.ts', 'export const a = 2;\n');
        await commit(root, 'change the code');

        const result = await runCli([
            'status',
            '--json',
        ], root);
        const report = JSON.parse(result.stdout);

        expect(report.scanned).toBe(1);
        expect(report.git).toBe(true);
        expect(report.entries[0].kind).toBe('stale');
        expect(report.entries[0].hint).toBe('src/login.ts.hint');
        expect(report.entries[0].staleness.contract).toBe(true);
    });

    // A shared fragment describes no path. Reporting it as a spec whose target was never written would
    // put a permanent row in every project that factors knowledge out into `@include` files.
    it('leaves @include fragments out of the inventory', async () => {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'shared/conventions.hint', '# decision Money is integer minor units\n\nBecause.\n');
        await write(root, 'src/login.ts.hint', '@include /shared/conventions.hint\n\n# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        const result = await runCli(['status'], root);

        expect(result.stdout).not.toContain('shared/conventions.hint');
        expect(result.stderr).toContain('1 hint file(s) inventoried');
    });

    it('says staleness was not evaluated outside a git repository', async () => {
        const root = await makeProject(false);

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');

        const result = await runCli(['status'], root);

        expect(result.stderr).toContain('not a git repository');
        expect(result.stdout).toBe('');
    });
});

// The inventory answers "what does the spec still ask for that nobody has written?" without a
// bookkeeping file: a fresh render supplies the stubs, the file on disk supplies what was written.
describe('status — holes', () => {
    async function emitted(): Promise<string> {
        const root = await makeProject();

        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n');
        await runCli(['emit', 'src/svc.ts'], root);
        await commit(root, 'init');

        return root;
    }

    it('reports a hole that still holds its emitted stub', async () => {
        const result = await runCli(['status'], await emitted());

        expect(result.stdout).toContain('unfilled');
        expect(result.stdout).toContain('1 hole(s) still hold their emitted stub: func settle:body');
        expect(result.stderr).toContain('1 of 1 hint file(s) need attention');
    });

    it('says nothing about a hole once it is implemented', async () => {
        const root = await emitted();
        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8')).replace('throw new Error("todo");', 'return ledger.settle(invoice);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');
        await commit(root, 'implement');

        expect((await runCli(['status'], root)).stdout).not.toContain('unfilled');
    });

    // The most precise finding available — it names a specific body and a specific spec version.
    it('reports a body written against a spec that has since changed', async () => {
        const root = await emitted();
        const outputPath = Path.join(root, 'src/svc.ts');
        const filled = (await FsPromises.readFile(outputPath, 'utf8')).replace('throw new Error("todo");', 'return ledger.settle(invoice);');

        await FsPromises.writeFile(outputPath, filled, 'utf8');
        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice, and now also emits a receipt.\n');
        await commit(root, 'move the spec');

        const result = await runCli(['status'], root);

        expect(result.stdout).toContain('outdated');
        expect(result.stdout).toContain('written against an older spec: func settle:body');
    });
});

describe('staleness on the read path', () => {
    it('names the stale hint on stderr while still returning the knowledge on stdout', async () => {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        await write(root, 'src/login.ts', 'export const a = 2;\n');
        await commit(root, 'change the code');

        const result = await runCli(['src/login.ts'], root);

        expect(result.stdout).toContain('<function name="executeLogin">');
        expect(result.stderr).toContain('src/login.ts changed since src/login.ts.hint was last updated');
        expect(result.stderr).toContain('declares surfaces the code must contain');
    });

    // The signal is about the hint that would have to be edited, which for an inheriting path is the
    // ancestor folder hint, not the path itself.
    it('names the ancestor folder hint when the path has no spec of its own', async () => {
        const root = await makeProject();

        for (let index = 0; index < 4; index++) {
            await write(root, `src/mod${index}.ts`, 'export const a = 1;\n');
        }

        await write(root, 'src/_.hint', '# decision Money is integer minor units\n\nBecause decimals drifted.\n');
        await commit(root, 'init');

        for (let index = 0; index < 3; index++) {
            await write(root, `src/mod${index}.ts`, 'export const a = 2;\n');
        }

        await commit(root, 'move the code');

        const result = await runCli(['src/mod0.ts'], root);

        expect(result.stderr).toContain('src/_.hint was last updated');
        expect(result.stderr).toContain('records knowledge');
    });

    it('stays silent while the hint file itself has uncommitted changes', async () => {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        await write(root, 'src/login.ts', 'export const a = 2;\n');
        await commit(root, 'change the code');

        expect((await runCli(['src/login.ts'], root)).stderr).toContain('was last updated');

        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in, now with MFA.\n');

        expect((await runCli(['src/login.ts'], root)).stderr).not.toContain('was last updated');
    });

    it('stays silent outside a git repository', async () => {
        const root = await makeProject(false);

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');

        const result = await runCli(['src/login.ts'], root);

        expect(result.stdout).toContain('<function name="executeLogin">');
        expect(result.stderr).toBe('');
    });
});

// Two of the seven inventory rows come from the contract layer, and both had no test at all — the
// lock branch of `inspectProject` was never entered by anything.
describe('status — the lock rows', () => {
    async function locked(): Promise<string> {
        const root = await makeProject();

        await write(root, 'src/login.ts', 'export const a = 1;\n');
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in.\n');
        await commit(root, 'init');

        return root;
    }

    it('reports a companion spec that a locking project never locked', async () => {
        const root = await locked();

        await write(root, 'src/other.ts', 'export const b = 2;\n');
        await write(root, 'src/other.ts.hint', '# func other\n\nDoes something else.\n');
        await runCli(['lock', 'src/login.ts'], root);
        await commit(root, 'lock one of two');

        const result = await runCli(['status'], root);

        expect(result.stdout).toContain('unlocked');
        expect(result.stdout).toContain('src/other.ts.hint');
        expect(result.stdout).toContain('never been locked');
    });

    it('reports a locked target whose spec has moved since', async () => {
        const root = await locked();

        await runCli(['lock', 'src/login.ts'], root);
        await write(root, 'src/login.ts.hint', '# func executeLogin\n\nSigns a user in, and now records the attempt.\n');
        await commit(root, 'move the spec');

        const result = await runCli(['status'], root);

        expect(result.stdout).toContain('drifted');
        expect(result.stdout).toContain('src/login.ts.hint');
    });

    it('says nothing about a lock in a project that has none', async () => {
        const result = await runCli(['status'], await locked());

        expect(result.stdout).not.toContain('unlocked');
        expect(result.stderr).toContain('nothing has come loose');
    });
});
