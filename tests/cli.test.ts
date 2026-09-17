import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { emptyDocument, insertRecord } from '../src/markdown.js';
import type { HintRecord } from '../src/records.js';

const repository = Path.resolve(import.meta.dirname, '..');
const cli = Path.join(repository, 'dist', 'cli.js');
const temporaryDirectories: string[] = [];

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(
  cwd: string,
  args: string[],
  options: { input?: string } = {},
): Promise<CliResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: 'pipe',
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.end(options.input);
  });
}

async function temporaryProject(): Promise<string> {
  const created = await mkdtemp(Path.join(tmpdir(), 'hint-cli-'));
  const directory = await realpath(created);
  temporaryDirectories.push(directory);
  await mkdir(Path.join(directory, 'src'), { recursive: true });
  await writeFile(Path.join(directory, 'src', 'app.ts'), 'export const answer = 42;\n');
  return directory;
}

const rootKnowledge = `---
hint-format: 1
---
# Current theses

## Thesis T-root: Root guidance
Status: accepted
Based-on: user:decision
Task-outcome: not-applicable

### Guidance
Keep the root behavior deterministic.

### Rationale
The user selected deterministic behavior.

# Investigations

# Historical theses
`;

const companionKnowledge = `---
hint-format: 1
---
# Current theses

## Thesis T-current: Current guidance
Status: accepted
Based-on: user:decision
Task-outcome: not-applicable

### Guidance
Keep the companion behavior observable.

### Rationale
Observable behavior can be checked end to end.

## Thesis T-proposed: Candidate guidance
Status: proposed

### Guidance
Consider a narrower candidate.

### Rationale
The investigation is not finished.

# Investigations

## Hypothesis H-open: A bounded open claim
Status: open

### Claim
The CLI returns a stable result.

### Check
Invoke the CLI in a fresh process.

### Scope
src/app.ts

### Finish conditions
The process exits with the expected output.

## Iteration I-open: Invoke the CLI
Status: open
Hypothesis: H-open

### Action
Run one isolated process.

# Historical theses

## Thesis T-withdrawn: Old candidate
Status: withdrawn

### Guidance
Use the old candidate.

### Rationale
It was withdrawn after review.
`;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function qualityRecords(fileHash: string, options: { missingCriterion?: boolean; attempt?: number } = {}): HintRecord[] {
  const attempt = options.attempt ?? 1;
  return [
    {
      kind: 'Hypothesis', id: 'H-quality-cli', title: 'The change meets its criteria', metadata: { Status: 'open' },
      sections: { Claim: 'The change is correct.', Check: 'Run both test layers.', Scope: 'src/app.ts', 'Finish conditions': 'Both criteria pass.' },
    },
    {
      kind: 'Iteration', id: `I-quality-${attempt}`, title: `Attempt ${attempt}`,
      metadata: { Status: 'completed', Hypothesis: 'H-quality-cli', Attempt: String(attempt) },
      sections: {
        Action: 'Run both test layers.', Goal: 'Verify the change.',
        'Required criteria': '- [ ] C-unit: Unit tests pass\n- [ ] C-integration: Integration tests pass',
        Verification: '- C-unit: run unit tests\n- C-integration: run integration tests',
        'Score rubric': '0 is untested; 10 is fully verified.',
      },
    },
    {
      kind: 'Notice', id: `N-quality-${attempt}`, title: `Result ${attempt}`,
      metadata: { Iteration: `I-quality-${attempt}`, Result: 'pass', Attempt: String(attempt), Score: '10', Scope: 'src/app.ts' },
      sections: {
        Observation: 'The recorded checks passed.',
        Evidence: options.missingCriterion ? '- [x] C-unit: pass' : '- [x] C-unit: pass\n- [x] C-integration: pass',
        'Known shortcomings': 'none', Fingerprints: `- src/app.ts: sha256:${fileHash}`,
      },
    },
  ];
}

function qualityDocument(records: HintRecord[]): string {
  return records.reduce((raw, record) => insertRecord(raw, record), emptyDocument());
}

function hqHypothesis(id: string): string {
  return `## Hypothesis ${id}: The implementation meets its contract
Status: open

### Claim
The implementation meets its contract.

### Check
Run the contract test.

### Scope
src/app.ts

### Finish conditions
The contract criterion has recorded evidence.
`;
}

function hqIteration(id: string, hypothesisId: string, attempt: number): string {
  return `## Iteration ${id}: Run contract attempt ${attempt}
Status: open
Hypothesis: ${hypothesisId}
Attempt: ${attempt}

### Action
Run the contract test.

### Goal
Verify the implementation contract.

### Required criteria
- [ ] C-contract: Contract test passes

### Verification
- C-contract: run the contract test

### Score rubric
0 is untested; 10 is verified with no known gaps.
`;
}

function hqNotice(
  id: string,
  iterationId: string,
  attempt: number,
  result: 'pass' | 'fail' | 'blocked' | 'abandoned',
  fileHash: string,
): string {
  const successful = result === 'pass';
  const evidenceResult = successful ? 'pass' : result === 'fail' ? 'fail' : 'unknown';
  return `## Notice ${id}: Contract attempt ${result}
Iteration: ${iterationId}
Result: ${result}
Attempt: ${attempt}
Score: ${successful ? '10' : '0'}
Scope: src/app.ts

### Observation
The contract attempt ended with ${result}.

### Evidence
- [${successful || result === 'fail' ? 'x' : ' '}] C-contract: ${evidenceResult}

### Known shortcomings
${successful ? 'none' : `The attempt ended with ${result}.`}

### Fingerprints
- src/app.ts: sha256:${fileHash}
`;
}

function hqThesis(id: string, noticeId: string, status: 'accepted' | 'withdrawn' = 'accepted'): string {
  return `## Thesis ${id}: Use the verified implementation
Status: ${status}
Based-on: ${noticeId}
Task-outcome: completed

### Guidance
Use the implementation while its contract evidence remains current.

### Rationale
The contract test passed with current fingerprints.
`;
}

beforeAll(async () => {
  const result = await new Promise<CliResult>((resolve, reject) => {
    const child = spawn('yarn', ['build'], { cwd: repository, stdio: 'pipe' });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => resolve({
      code: code ?? -1,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
  if (result.code !== 0) throw new Error(`CLI build failed:\n${result.stdout}${result.stderr}`);
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('CLI information commands', () => {
  test('prints help for both --help and an empty invocation', async () => {
    const project = await temporaryProject();
    const explicit = await runCli(project, ['--help']);
    const implicit = await runCli(project, []);

    for (const result of [explicit, implicit]) {
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('HINT — path-scoped research memory');
      expect(result.stdout).toContain('hint <path...> [--history | --open] [--json]');
      expect(result.stderr).toBe('');
    }
  });

  test('prints the package version and a compact standalone guide without writing files', async () => {
    const project = await temporaryProject();
    const packageJson = JSON.parse(await readFile(Path.join(repository, 'package.json'), 'utf8')) as { version: string };
    const before = await readdir(project);

    const version = await runCli(project, ['--version']);
    const guide = await runCli(project, ['guide']);

    expect(version).toEqual({ code: 0, stdout: `${packageJson.version}\n`, stderr: '' });
    expect(guide.code).toBe(0);
    expect(guide.stdout).toContain('Hypothesis → Iteration → Notice → Thesis');
    expect(guide.stdout).toContain('If the CLI is unavailable');
    expect(guide.stdout.trim().split(/\s+/).length).toBeLessThanOrEqual(500);
    expect(guide.stderr).toBe('');
    expect(await readdir(project)).toEqual(before);
  });
});

describe('CLI reads', () => {
  test('selects current, open, and historical records and reports their sources', async () => {
    const project = await temporaryProject();
    await writeFile(Path.join(project, '_.hint'), rootKnowledge);
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), companionKnowledge);

    const current = await runCli(project, ['src/app.ts']);
    const open = await runCli(project, ['src/app.ts', '--open']);
    const history = await runCli(project, ['src/app.ts', '--history']);

    expect(current.code).toBe(0);
    expect(current.stdout).toContain('## T-root: Root guidance');
    expect(current.stdout).toContain('## T-current: Current guidance');
    expect(current.stdout).toContain('Source: _.hint');
    expect(current.stdout).toContain('Source: src/app.ts.hint');
    expect(current.stdout).not.toContain('T-proposed');
    expect(current.stdout).not.toContain('H-open');
    expect(current.stderr).toBe('');

    expect(open.code).toBe(0);
    expect(open.stdout).toContain('Thesis T-proposed');
    expect(open.stdout).toContain('Hypothesis H-open');
    expect(open.stdout).toContain('Iteration I-open');
    expect(open.stdout).not.toContain('T-current');

    expect(history.code).toBe(0);
    for (const id of ['T-root', 'T-current', 'T-proposed', 'H-open', 'I-open', 'T-withdrawn']) {
      expect(history.stdout).toContain(id);
    }
  });

  test('deduplicates canonical records when paths overlap or repeat', async () => {
    const project = await temporaryProject();
    await writeFile(Path.join(project, '_.hint'), rootKnowledge);
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), companionKnowledge);

    const result = await runCli(project, ['src/app.ts', './src/app.ts', 'src/app.ts', '--json']);
    const envelope = JSON.parse(result.stdout) as {
      data: { mode: string; records: Array<{ id: string; source: string }> };
      workflow: unknown;
      next_action: unknown;
      warnings: unknown;
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(envelope.data.mode).toBe('current');
    expect(envelope.data.records.map((record) => record.id)).toEqual(['T-root', 'T-current']);
    expect(new Set(envelope.data.records.map((record) => `${record.source}\0${record.id}`)).size).toBe(2);
  });

  test('emits a clean, stable JSON envelope', async () => {
    const project = await temporaryProject();
    await writeFile(Path.join(project, '_.hint'), rootKnowledge);

    const result = await runCli(project, ['src/app.ts', '--json']);
    const envelope = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(Object.keys(envelope)).toEqual(['data', 'workflow', 'next_action', 'warnings']);
    expect(envelope).toMatchObject({
      data: { mode: 'current' },
      workflow: { high_quality_mode: false },
      next_action: null,
      warnings: [],
    });
    expect(result.stdout.trim().endsWith('}')).toBe(true);

    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    const qualityResult = await runCli(project, ['src/app.ts', '--json']);
    const qualityEnvelope = JSON.parse(qualityResult.stdout) as {
      workflow: { high_quality_mode: boolean };
    };
    expect(qualityResult).toMatchObject({ code: 0, stderr: '' });
    expect(qualityEnvelope.workflow.high_quality_mode).toBe(true);
  });
});

describe('CLI writes and workflow guidance', () => {
  test('resolves record links through inherited folder knowledge', async () => {
    const project = await temporaryProject();
    await writeFile(Path.join(project, '_.hint'), `---
hint-format: 1
---
# Current theses

# Investigations

## Hypothesis H-inherited: Folder behavior is inherited
Status: open

### Claim
The child can link research declared at the project root.

### Check
Write a child Iteration linked to this ID.

### Scope
src/app.ts

### Finish conditions
The linked child file validates.

# Historical theses
`);
    const payload = `## Iteration I-child: Check inherited linking
Status: open
Hypothesis: H-inherited

### Action
Validate the child scope with the root record visible.
`;

    const written = await runCli(project, ['iteration', 'src/app.ts', '--stdin'], { input: payload });
    const checked = await runCli(project, ['check', 'src/app.ts']);

    expect(written.code).toBe(0);
    expect(checked).toMatchObject({ code: 0, stderr: '' });
    expect(checked.stdout).toContain('no findings');
  });

  test('prepares every record kind without creating a knowledge file', async () => {
    const project = await temporaryProject();
    const destination = Path.join(project, 'src', 'future.ts.hint');

    for (const [command, heading] of [
      ['hypothesis', '## Hypothesis H-<id>'],
      ['iteration', '## Iteration I-<id>'],
      ['notice', '## Notice N-<id>'],
      ['thesis', '## Thesis T-<id>'],
    ] as const) {
      const result = await runCli(project, [command, 'src/future.ts']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(`Destination: ${destination}`);
      expect(result.stdout).toContain('Revision: missing');
      expect(result.stdout).toContain(heading);
      expect(result.stderr).toBe('');
      await expect(readFile(destination, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  test('writes a linked H–I–N–T cycle through text, stdin, and file payloads', async () => {
    const project = await temporaryProject();
    const target = 'src/app.ts';
    const destination = Path.join(project, `${target}.hint`);

    const hypothesis = await runCli(project, [
      'hypothesis', target, '--text', 'The CLI preserves a linked cycle.', '--id', 'H-cli',
    ]);
    expect(hypothesis.code).toBe(0);
    expect(hypothesis.stdout).toContain('## Hypothesis H-cli');
    expect(hypothesis.stderr).toContain('hint: saved H-cli');
    expect(hypothesis.stderr).toContain('NEXT: Start an Iteration linked to H-cli');

    const repeated = await runCli(project, [
      'hypothesis', target, '--text', 'The CLI preserves a linked cycle.', '--id', 'H-cli', '--json',
    ]);
    expect(repeated.code).toBe(0);
    expect(repeated.stderr).toBe('');
    const repeatedEnvelope = JSON.parse(repeated.stdout) as {
      data: { id: string; status: string; changed: boolean };
      next_action: string;
    };
    expect(repeatedEnvelope.data).toMatchObject({ id: 'H-cli', status: 'open', changed: false });
    expect(repeatedEnvelope.next_action).toContain('Iteration linked to H-cli');

    const iterationPayload = `## Iteration I-cli: Exercise the process boundary
Status: open
Hypothesis: H-cli

### Action
Invoke the built CLI in an isolated process.
`;
    const iteration = await runCli(project, ['iteration', target, '--stdin'], { input: iterationPayload });
    expect(iteration.code).toBe(0);
    expect(iteration.stderr).toContain('NEXT: Perform I-cli, then record a Notice');

    const notice = await runCli(project, [
      'notice', target, '--text', 'The isolated process returned the expected output.',
      '--iteration', 'I-cli', '--id', 'N-cli',
    ]);
    expect(notice.code).toBe(0);
    expect(notice.stderr).toContain('hint: saved N-cli');
    expect(notice.stderr).toContain('NEXT:');

    const thesisPayloadPath = Path.join(project, 'thesis.md');
    await writeFile(thesisPayloadPath, `## Thesis T-cli: Keep process-level checks
Status: accepted
Based-on: N-cli

### Guidance
Exercise CLI contracts through a fresh process.

### Rationale
N-cli observed the actual stdout, stderr, and exit status.

### Revisit when
The executable boundary is removed.
`);
    const thesis = await runCli(project, ['thesis', target, '--file', thesisPayloadPath, '--json']);
    const thesisEnvelope = JSON.parse(thesis.stdout) as {
      data: { id: string; file: string; status: string; changed: boolean; revision: string };
      workflow: { high_quality_mode: boolean };
      next_action: string;
      warnings: string[];
    };
    expect(thesis.code).toBe(0);
    expect(thesis.stderr).toBe('');
    expect(thesisEnvelope.data).toMatchObject({
      id: 'T-cli', file: destination, status: 'accepted', changed: true,
    });
    expect(thesisEnvelope.data.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(thesisEnvelope.workflow).toEqual({ high_quality_mode: false });
    expect(thesisEnvelope.next_action).toContain('Apply this guidance');
    expect(thesisEnvelope.warnings).toEqual([]);

    const stored = await readFile(destination, 'utf8');
    expect(stored).toContain('Status: completed\nHypothesis: H-cli');
    expect(stored).toContain('## Notice N-cli');
    expect(stored).toContain('## Thesis T-cli');

    const read = await runCli(project, [target]);
    expect(read.code).toBe(0);
    expect(read.stdout).toContain('## T-cli: Keep process-level checks');
    expect(read.stdout).not.toContain('H-cli');
  });
});

describe('high-quality CLI review regressions', () => {
  test('rejects completion when evidence omits a required criterion', async () => {
    const project = await temporaryProject();
    const source = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    await writeFile(
      Path.join(project, 'src', 'app.ts.hint'),
      qualityDocument(qualityRecords(hash(source), { missingCriterion: true })),
    );

    const result = await runCli(project, ['check', 'src/app.ts', '--json']);
    const envelope = JSON.parse(result.stdout) as {
      data: { diagnostics: Array<{ message: string }> };
      workflow: { quality: Array<{ completed: boolean }> };
    };
    expect(result.code).toBe(1);
    expect(envelope.data.diagnostics.map(({ message }) => message)).toContain(
      'N-quality-1 has no evidence for required criterion C-integration',
    );
    expect(envelope.workflow.quality[0]?.completed).toBe(false);
  });

  test.each([
    [
      'duplicate required IDs',
      '- [ ] C-unit: Unit tests pass\n- [ ] C-unit: Integration tests pass',
      '- [x] C-unit: pass',
      'repeats required criterion C-unit',
    ],
    [
      'duplicate evidence IDs',
      '- [ ] C-unit: Unit tests pass',
      '- [x] C-unit: pass\n- [x] C-unit: pass',
      'repeats criterion evidence C-unit',
    ],
    [
      'unknown evidence IDs',
      '- [ ] C-unit: Unit tests pass',
      '- [x] C-unit: pass\n- [x] C-undeclared: pass',
      'has evidence for unknown criterion C-undeclared',
    ],
  ])('rejects %s through hint check', async (_label, required, evidence, expected) => {
    const project = await temporaryProject();
    const source = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    const records = qualityRecords(hash(source));
    (records[1] as HintRecord).sections['Required criteria'] = required;
    (records[2] as HintRecord).sections.Evidence = evidence;
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), qualityDocument(records));

    const result = await runCli(project, ['check', 'src/app.ts', '--json']);
    const diagnostics = (JSON.parse(result.stdout) as { data: { diagnostics: Array<{ message: string }> } }).data.diagnostics;
    expect(result.code).toBe(1);
    expect(diagnostics.some(({ message }) => message.includes(expected))).toBe(true);
  });

  test('rejects a completed Thesis when its fingerprint became stale before acceptance', async () => {
    const project = await temporaryProject();
    const source = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), qualityDocument(qualityRecords(hash(source))));
    await writeFile(Path.join(project, 'src', 'app.ts'), 'export const answer = 43;\n');
    const thesis = `## Thesis T-quality-cli: The task is complete
Status: accepted
Based-on: N-quality-1
Task-outcome: completed

### Guidance
Use the verified implementation.

### Rationale
Both required checks passed.
`;

    const result = await runCli(project, ['thesis', 'src/app.ts', '--stdin', '--json'], { input: thesis });
    expect(result.code).toBe(1);
    const rejected = JSON.parse(result.stdout) as { data: { error: string } };
    expect(rejected.data.error).toContain('fingerprint is stale');
    expect(await readFile(Path.join(project, 'src', 'app.ts.hint'), 'utf8')).not.toContain('T-quality-cli');

    const accepted: HintRecord = {
      kind: 'Thesis', id: 'T-quality-cli', title: 'The task is complete',
      metadata: { Status: 'accepted', 'Based-on': 'N-quality-1', 'Task-outcome': 'completed' },
      sections: { Guidance: 'Use the verified implementation.', Rationale: 'Both required checks passed.' },
    };
    await writeFile(
      Path.join(project, 'src', 'app.ts.hint'),
      qualityDocument([...qualityRecords(hash(source)), accepted]),
    );
    const read = await runCli(project, ['src/app.ts', '--json']);
    const readEnvelope = JSON.parse(read.stdout) as { data: { records: Array<{ id: string }> }; warnings: string[] };
    expect(read.code).toBe(0);
    expect(readEnvelope.data.records.map(({ id }) => id)).toContain('T-quality-cli');
    expect(readEnvelope.warnings.some((warning) => warning.includes('not backed by current passing quality evidence'))).toBe(true);

    const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
    const checkEnvelope = JSON.parse(checked.stdout) as { workflow: { quality: Array<{ completed: boolean }> } };
    expect(checked.code).toBe(1);
    expect(checkEnvelope.workflow.quality[0]?.completed).toBe(false);
  });

  test('uses the latest successful fingerprints without invalidating preserved history', async () => {
    const project = await temporaryProject();
    const firstSource = 'export const answer = 41;\n';
    const currentSource = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    const first = qualityRecords(hash(firstSource));
    const second = qualityRecords(hash(currentSource), { attempt: 2 }).slice(1);
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), qualityDocument([...first, ...second]));

    const result = await runCli(project, ['check', 'src/app.ts', '--json']);
    const envelope = JSON.parse(result.stdout) as {
      data: { diagnostics: Array<{ message: string }> };
      workflow: { quality: Array<{ attempts: number; completed: boolean }> };
    };
    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(envelope.data.diagnostics).toEqual([]);
    expect(envelope.workflow.quality[0]).toMatchObject({ attempts: 2, completed: true });
    expect(await readFile(Path.join(project, 'src', 'app.ts.hint'), 'utf8')).toContain(hash(firstSource));
  });

  test('keeps superseded-cycle fingerprints as non-blocking historical evidence', async () => {
    const project = await temporaryProject();
    const oldSource = 'export const answer = 41;\n';
    const currentSource = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');

    const namedCycle = (name: string, fileHash: string): HintRecord[] => {
      const [hypothesis, iteration, notice] = qualityRecords(fileHash);
      return [
        { ...hypothesis as HintRecord, id: `H-${name}` },
        {
          ...iteration as HintRecord,
          id: `I-${name}`,
          metadata: { ...(iteration as HintRecord).metadata, Hypothesis: `H-${name}` },
        },
        {
          ...notice as HintRecord,
          id: `N-${name}`,
          metadata: { ...(notice as HintRecord).metadata, Iteration: `I-${name}` },
        },
      ];
    };
    const oldThesis: HintRecord = {
      kind: 'Thesis', id: 'T-old', title: 'Use the former implementation',
      metadata: {
        Status: 'superseded', 'Based-on': 'N-old', 'Task-outcome': 'completed',
        'Superseded-by': 'T-current',
      },
      sections: { Guidance: 'Use the former implementation.', Rationale: 'The old evidence passed.' },
    };
    const currentThesis: HintRecord = {
      kind: 'Thesis', id: 'T-current', title: 'Use the current implementation',
      metadata: {
        Status: 'accepted', 'Based-on': 'N-current', 'Task-outcome': 'completed',
        Supersedes: 'T-old',
      },
      sections: { Guidance: 'Use the current implementation.', Rationale: 'The current evidence passed.' },
    };
    await writeFile(
      Path.join(project, 'src', 'app.ts.hint'),
      qualityDocument([
        ...namedCycle('old', hash(oldSource)),
        ...namedCycle('current', hash(currentSource)),
        oldThesis,
        currentThesis,
      ]),
    );

    const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
    const envelope = JSON.parse(checked.stdout) as { data: { diagnostics: Array<{ message: string }> } };
    expect(checked).toMatchObject({ code: 0, stderr: '' });
    expect(envelope.data.diagnostics).toEqual([]);

    const history = await runCli(project, ['src/app.ts', '--history']);
    expect(history).toMatchObject({ code: 0 });
    expect(history.stdout).toContain(hash(oldSource));
    expect(history.stdout).toContain('Status: superseded');
  });

  test.each(['withdrawn', 'superseded'] as const)(
    'checks fresh Notice fingerprints after a %s Thesis',
    async (historicalStatus) => {
      const project = await temporaryProject();
      const verifiedSource = 'export const answer = 42;\n';
      await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');

      const [hypothesis, firstIteration, firstNotice] = qualityRecords(hash(verifiedSource));
      const historicalThesis: HintRecord = {
        kind: 'Thesis', id: 'T-historical', title: 'Use the former implementation',
        metadata: {
          Status: historicalStatus,
          'Based-on': 'N-quality-1',
          'Task-outcome': 'completed',
          ...(historicalStatus === 'superseded' ? { 'Superseded-by': 'T-replacement' } : {}),
        },
        sections: { Guidance: 'Use the former implementation.', Rationale: 'The former evidence passed.' },
      };
      const replacement: HintRecord[] = historicalStatus === 'superseded'
        ? [{
            kind: 'Thesis', id: 'T-replacement', title: 'Use replacement guidance',
            metadata: {
              Status: 'accepted', 'Based-on': 'user:replacement',
              'Task-outcome': 'not-applicable', Supersedes: 'T-historical',
            },
            sections: { Guidance: 'Use replacement guidance.', Rationale: 'The user replaced the old guidance.' },
          }]
        : [];
      const freshCycle = qualityRecords(hash(verifiedSource), { attempt: 2 }).slice(1);
      await writeFile(
        Path.join(project, 'src', 'app.ts.hint'),
        qualityDocument([
          hypothesis as HintRecord,
          firstIteration as HintRecord,
          firstNotice as HintRecord,
          historicalThesis,
          ...replacement,
          ...freshCycle,
        ]),
      );
      await writeFile(Path.join(project, 'src', 'app.ts'), 'export const answer = 43;\n');

      const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
      const envelope = JSON.parse(checked.stdout) as { data: { diagnostics: Array<{ message: string }> } };
      expect(checked.code).toBe(1);
      expect(envelope.data.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: 'N-quality-2 fingerprint is stale for src/app.ts' }),
      ]));
    },
  );

  test('stops NEXT after the tenth completed error attempt', async () => {
    const project = await temporaryProject();
    const source = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    const [hypothesis] = qualityRecords(hash(source));
    const records: HintRecord[] = [hypothesis as HintRecord];
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const [, iteration, notice] = qualityRecords(hash(source), { attempt });
      records.push(iteration as HintRecord, {
        ...(notice as HintRecord),
        metadata: { ...(notice as HintRecord).metadata, Result: 'error', Score: '0' },
        sections: {
          ...(notice as HintRecord).sections,
          Observation: `The check process failed differently on attempt ${attempt}.`,
          Evidence: '- [ ] C-unit: unknown\n- [ ] C-integration: unknown',
          'Known shortcomings': 'The verification process did not complete.',
        },
      });
    }
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), qualityDocument(records));

    const last = records.at(-1) as HintRecord;
    const payload = `## Notice ${last.id}: Updated tenth error
Iteration: I-quality-10
Result: error
Attempt: 10
Score: 0
Scope: src/app.ts

### Observation
The tenth check process failed with a distinct error.

### Evidence
- [ ] C-unit: unknown
- [ ] C-integration: unknown

### Known shortcomings
The verification process did not complete.

### Fingerprints
- src/app.ts: sha256:${hash(source)}
`;
    const current = await readFile(Path.join(project, 'src', 'app.ts.hint'), 'utf8');
    const expectedRevision = hash(current);
    const result = await runCli(
      project,
      ['notice', 'src/app.ts', '--stdin', '--expected-revision', expectedRevision, '--json'],
      { input: payload },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      next_action: 'Stop and report that the ten-attempt limit was reached.',
    });
  });

  test('stops NEXT when two completed error attempts stagnate', async () => {
    const project = await temporaryProject();
    const source = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    const [hypothesis] = qualityRecords(hash(source));
    const records: HintRecord[] = [hypothesis as HintRecord];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const [, iterationRecord, noticeRecord] = qualityRecords(hash(source), { attempt });
      records.push(iterationRecord as HintRecord, {
        ...(noticeRecord as HintRecord),
        metadata: { ...(noticeRecord as HintRecord).metadata, Result: 'error', Score: '0' },
        sections: {
          ...(noticeRecord as HintRecord).sections,
          Observation: 'The test process exited before producing results.',
          Evidence: '- [ ] C-unit: unknown\n- [ ] C-integration: unknown',
          'Known shortcomings': 'The checks did not run.',
        },
      });
    }
    const raw = qualityDocument(records);
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), raw);
    const last = records.at(-1) as HintRecord;
    const result = await runCli(
      project,
      ['notice', 'src/app.ts', '--stdin', '--expected-revision', hash(raw), '--json'],
      { input: `## Notice ${last.id}: Result 2\nIteration: I-quality-2\nResult: error\nAttempt: 2\nScore: 0\nScope: src/app.ts\n\n### Observation\nThe test process exited before producing results.\n\n### Evidence\n- [ ] C-unit: unknown\n- [ ] C-integration: unknown\n\n### Known shortcomings\nThe checks did not run.\n\n### Fingerprints\n- src/app.ts: sha256:${hash(source)}\n` },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      next_action: 'Stop and report stagnation; repeated unchanged attempts are not success.',
    });
  });

  test.each([
    ['blocked', 'blocked', 'Stop and report the blocker; do not call the task complete.'],
    ['abandoned', 'abandoned', 'Stop and report that the quality cycle was abandoned.'],
  ] as const)('keeps NEXT terminal for an explicitly %s quality cycle', async (_label, status, expected) => {
    const project = await temporaryProject();
    const source = 'export const answer = 42;\n';
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    const records = qualityRecords(hash(source));
    const iterationRecord = records[1] as HintRecord;
    const noticeRecord = records[2] as HintRecord;
    iterationRecord.metadata.Status = status;
    noticeRecord.metadata.Result = status;
    noticeRecord.metadata.Score = '0';
    noticeRecord.sections.Evidence = '- [ ] C-unit: unknown\n- [ ] C-integration: unknown';
    noticeRecord.sections['Known shortcomings'] = 'The cycle ended without successful verification.';
    const raw = qualityDocument(records);
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), raw);

    const result = await runCli(
      project,
      ['notice', 'src/app.ts', '--stdin', '--expected-revision', hash(raw), '--json'],
      { input: `## Notice ${noticeRecord.id}: Result 1\nIteration: I-quality-1\nResult: ${status}\nAttempt: 1\nScore: 0\nScope: src/app.ts\n\n### Observation\nThe cycle ended.\n\n### Evidence\n- [ ] C-unit: unknown\n- [ ] C-integration: unknown\n\n### Known shortcomings\nThe cycle ended without successful verification.\n\n### Fingerprints\n- src/app.ts: sha256:${hash(source)}\n` },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ next_action: expected });
  });
});

describe('high-quality CLI transition round trips', () => {
  test('creates Hypothesis, open Iteration, Notice, and completed Thesis through CLI commands', async () => {
    const project = await temporaryProject();
    const fileHash = hash('export const answer = 42;\n');
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');

    const hypothesis = await runCli(project, ['hypothesis', 'src/app.ts', '--stdin', '--json'], {
      input: hqHypothesis('H-roundtrip'),
    });
    const iteration = await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
      input: hqIteration('I-roundtrip-1', 'H-roundtrip', 1),
    });
    const notice = await runCli(project, ['notice', 'src/app.ts', '--stdin', '--json'], {
      input: hqNotice('N-roundtrip-1', 'I-roundtrip-1', 1, 'pass', fileHash),
    });
    const thesis = await runCli(project, ['thesis', 'src/app.ts', '--stdin', '--json'], {
      input: hqThesis('T-roundtrip', 'N-roundtrip-1'),
    });
    const checked = await runCli(project, ['check', 'src/app.ts', '--json']);

    expect([hypothesis.code, iteration.code, notice.code, thesis.code, checked.code]).toEqual([0, 0, 0, 0, 0]);
    const iterationEnvelope = JSON.parse(iteration.stdout) as { data: { status: string }; next_action: string };
    expect(iterationEnvelope.data.status).toBe('open');
    expect(iterationEnvelope.next_action).toContain('Perform I-roundtrip-1');
    const noticeEnvelope = JSON.parse(notice.stdout) as { data: { status: string }; next_action: string };
    expect(noticeEnvelope.data.status).toBe('pass');
    expect(noticeEnvelope.next_action).toContain('Assess H-roundtrip');
    const history = await runCli(project, ['src/app.ts', '--history', '--json']);
    const records = (JSON.parse(history.stdout) as { data: { records: Array<{ id: string; metadata: { Status?: string } }> } }).data.records;
    expect(records.find(({ id }) => id === 'I-roundtrip-1')?.metadata.Status).toBe('completed');
    expect(records.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'H-roundtrip', 'I-roundtrip-1', 'N-roundtrip-1', 'T-roundtrip',
    ]));
  });

  test('records negative evidence after a completed Thesis and then withdraws the stale guidance', async () => {
    const project = await temporaryProject();
    const fileHash = hash('export const answer = 42;\n');
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    for (const [command, input] of [
      ['hypothesis', hqHypothesis('H-revision')],
      ['iteration', hqIteration('I-revision-1', 'H-revision', 1)],
      ['notice', hqNotice('N-revision-1', 'I-revision-1', 1, 'pass', fileHash)],
      ['thesis', hqThesis('T-revision', 'N-revision-1')],
      ['iteration', hqIteration('I-revision-2', 'H-revision', 2)],
    ] as const) {
      expect((await runCli(project, [command, 'src/app.ts', '--stdin', '--json'], { input })).code).toBe(0);
    }

    const failure = await runCli(project, ['notice', 'src/app.ts', '--stdin', '--json'], {
      input: hqNotice('N-revision-2', 'I-revision-2', 2, 'fail', fileHash),
    });
    expect(failure.code).toBe(0);
    const failureEnvelope = JSON.parse(failure.stdout) as { data: { revision: string }; next_action: string };
    expect(failureEnvelope.next_action).toContain('Revisit T-revision');

    const current = await runCli(project, ['src/app.ts', '--json']);
    const currentEnvelope = JSON.parse(current.stdout) as {
      data: { records: Array<{ id: string }> };
      warnings: string[];
    };
    expect(current.code).toBe(0);
    expect(currentEnvelope.data.records.map(({ id }) => id)).toContain('T-revision');
    expect(currentEnvelope.warnings.some((warning) => warning.includes('not backed by current passing quality evidence'))).toBe(true);

    const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
    const checkEnvelope = JSON.parse(checked.stdout) as { data: { diagnostics: Array<{ message: string }> } };
    expect(checked.code).toBe(1);
    expect(checkEnvelope.data.diagnostics.some(({ message }) => message.includes('T-revision'))).toBe(true);

    const withdrawn = await runCli(
      project,
      ['thesis', 'src/app.ts', '--stdin', '--expected-revision', failureEnvelope.data.revision, '--json'],
      { input: hqThesis('T-revision', 'N-revision-1', 'withdrawn') },
    );
    expect(withdrawn.code).toBe(0);
    const history = await runCli(project, ['src/app.ts', '--history', '--json']);
    const historyRecords = (JSON.parse(history.stdout) as {
      data: { records: Array<{ id: string; metadata: { Status?: string } }> };
    }).data.records;
    expect(historyRecords.find(({ id }) => id === 'T-revision')?.metadata.Status).toBe('withdrawn');
    expect(historyRecords.map(({ id }) => id)).toContain('N-revision-2');
  });

  test.each([
    ['blocked', 'blocked', true, false, 'Stop and report the blocker'],
    ['abandoned', 'abandoned', false, true, 'Stop and report that the quality cycle was abandoned'],
  ] as const)(
    'maps a %s Notice to the Iteration and quality terminal state',
    async (_label, result, blocked, abandoned, expectedNext) => {
      const project = await temporaryProject();
      const fileHash = hash('export const answer = 42;\n');
      await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
      expect((await runCli(project, ['hypothesis', 'src/app.ts', '--stdin', '--json'], {
        input: hqHypothesis(`H-${result}`),
      })).code).toBe(0);
      expect((await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
        input: hqIteration(`I-${result}`, `H-${result}`, 1),
      })).code).toBe(0);
      const notice = await runCli(project, ['notice', 'src/app.ts', '--stdin', '--json'], {
        input: hqNotice(`N-${result}`, `I-${result}`, 1, result, fileHash),
      });
      expect(notice.code).toBe(0);
      expect((JSON.parse(notice.stdout) as { next_action: string }).next_action).toContain(expectedNext);

      const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
      const quality = (JSON.parse(checked.stdout) as {
        workflow: { quality: Array<{ attempts: number; blocked: boolean; abandoned: boolean }> };
      }).workflow.quality[0];
      expect(quality).toMatchObject({ attempts: 0, blocked, abandoned });
      const history = await runCli(project, ['src/app.ts', '--history', '--json']);
      const records = (JSON.parse(history.stdout) as {
        data: { records: Array<{ id: string; metadata: { Status?: string } }> };
      }).data.records;
      expect(records.find(({ id }) => id === `I-${result}`)?.metadata.Status).toBe(result);
    },
  );
});

describe('high-quality current completion and budget', () => {
  test('requires a newer open Iteration to finish before accepting completed', async () => {
    const project = await temporaryProject();
    const fileHash = hash('export const answer = 42;\n');
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    for (const [command, input] of [
      ['hypothesis', hqHypothesis('H-pending')],
      ['iteration', hqIteration('I-pending-1', 'H-pending', 1)],
      ['notice', hqNotice('N-pending-1', 'I-pending-1', 1, 'pass', fileHash)],
    ] as const) {
      expect((await runCli(project, [command, 'src/app.ts', '--stdin', '--json'], { input })).code).toBe(0);
    }
    const secondIteration = hqIteration('I-pending-2', 'H-pending', 2)
      .replace('Attempt: 2', 'Attempt: 2\nCriteria-change-reason: Integration coverage was missing')
      .replace(
        '- [ ] C-contract: Contract test passes',
        '- [ ] C-contract: Contract test passes\n- [ ] C-integration: Integration test passes',
      )
      .replace('- C-contract: run the contract test', '- C-contract: run the contract test\n- C-integration: run integration tests');
    expect((await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
      input: secondIteration,
    })).code).toBe(0);

    const premature = await runCli(project, ['thesis', 'src/app.ts', '--stdin', '--json'], {
      input: hqThesis('T-pending', 'N-pending-1'),
    });
    expect(premature.code).toBe(1);
    expect((JSON.parse(premature.stdout) as { data: { error: string } }).data.error).toContain(
      'current passing quality evidence',
    );
    const pendingCheck = await runCli(project, ['check', 'src/app.ts', '--json']);
    const pendingQuality = (JSON.parse(pendingCheck.stdout) as {
      workflow: { quality: Array<{ attempts: number; completed: boolean }> };
    }).workflow.quality[0];
    expect(pendingQuality).toMatchObject({ attempts: 1, completed: false });

    const secondNotice = hqNotice('N-pending-2', 'I-pending-2', 2, 'pass', fileHash).replace(
      '- [x] C-contract: pass',
      '- [x] C-contract: pass\n- [x] C-integration: pass',
    );
    expect((await runCli(project, ['notice', 'src/app.ts', '--stdin', '--json'], {
      input: secondNotice,
    })).code).toBe(0);
    const accepted = await runCli(project, ['thesis', 'src/app.ts', '--stdin', '--json'], {
      input: hqThesis('T-pending', 'N-pending-2'),
    });
    expect(accepted.code).toBe(0);
    const finalCheck = await runCli(project, ['check', 'src/app.ts', '--json']);
    const finalQuality = (JSON.parse(finalCheck.stdout) as {
      workflow: { quality: Array<{ attempts: number; completed: boolean }> };
    }).workflow.quality[0];
    expect(finalCheck.code).toBe(0);
    expect(finalQuality).toMatchObject({ attempts: 2, completed: true });
  });

  test('allows a new Iteration after a blocked result', async () => {
    const project = await temporaryProject();
    const fileHash = hash('export const answer = 42;\n');
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    for (const [command, input] of [
      ['hypothesis', hqHypothesis('H-retry')],
      ['iteration', hqIteration('I-retry-1', 'H-retry', 1)],
      ['notice', hqNotice('N-retry-1', 'I-retry-1', 1, 'blocked', fileHash)],
    ] as const) {
      expect((await runCli(project, [command, 'src/app.ts', '--stdin', '--json'], { input })).code).toBe(0);
    }
    const retry = await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
      input: hqIteration('I-retry-2', 'H-retry', 2),
    });
    expect(retry.code).toBe(0);
    const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
    const quality = (JSON.parse(checked.stdout) as {
      workflow: { quality: Array<{ attempts: number; completed: boolean; blocked: boolean }> };
    }).workflow.quality[0];
    expect(quality).toMatchObject({ attempts: 0, completed: false, blocked: false });
  });

  test('does not reduce the budget for several blocked and abandoned Iterations', async () => {
    const project = await temporaryProject();
    const fileHash = hash('export const answer = 42;\n');
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    expect((await runCli(project, ['hypothesis', 'src/app.ts', '--stdin', '--json'], {
      input: hqHypothesis('H-nonconsuming'),
    })).code).toBe(0);
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      const result = sequence % 2 === 0 ? 'abandoned' : 'blocked';
      expect((await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
        input: hqIteration(`I-nonconsuming-${sequence}`, 'H-nonconsuming', sequence),
      })).code).toBe(0);
      expect((await runCli(project, ['notice', 'src/app.ts', '--stdin', '--json'], {
        input: hqNotice(`N-nonconsuming-${sequence}`, `I-nonconsuming-${sequence}`, sequence, result, fileHash),
      })).code).toBe(0);
    }
    const next = await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
      input: hqIteration('I-nonconsuming-11', 'H-nonconsuming', 11),
    });
    expect(next.code).toBe(0);
    const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
    const quality = (JSON.parse(checked.stdout) as {
      workflow: { quality: Array<{ attempts: number; completed: boolean; limitReached: boolean }> };
    }).workflow.quality[0];
    expect(quality).toMatchObject({ attempts: 0, completed: false, limitReached: false });
  });

  test('rejects an eleventh budget-consuming Iteration after ten completed failures', async () => {
    const project = await temporaryProject();
    const fileHash = hash('export const answer = 42;\n');
    await writeFile(Path.join(project, '.hintrc'), 'high-quality-mode: true\n');
    expect((await runCli(project, ['hypothesis', 'src/app.ts', '--stdin', '--json'], {
      input: hqHypothesis('H-budget'),
    })).code).toBe(0);
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect((await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
        input: hqIteration(`I-budget-${attempt}`, 'H-budget', attempt),
      })).code).toBe(0);
      const failedNotice = hqNotice(`N-budget-${attempt}`, `I-budget-${attempt}`, attempt, 'fail', fileHash)
        .replace('The contract attempt ended with fail.', `The contract attempt ${attempt} ended with fail.`);
      expect((await runCli(project, ['notice', 'src/app.ts', '--stdin', '--json'], {
        input: failedNotice,
      })).code).toBe(0);
    }
    const checked = await runCli(project, ['check', 'src/app.ts', '--json']);
    const quality = (JSON.parse(checked.stdout) as {
      workflow: { quality: Array<{ attempts: number; completed: boolean; limitReached: boolean }> };
    }).workflow.quality[0];
    expect(checked.code).toBe(1);
    expect(quality).toMatchObject({ attempts: 10, completed: false, limitReached: true });
    const eleventh = await runCli(project, ['iteration', 'src/app.ts', '--stdin', '--json'], {
      input: hqIteration('I-budget-11', 'H-budget', 11),
    });
    expect(eleventh.code).toBe(1);
    expect((JSON.parse(eleventh.stdout) as { data: { error: string } }).data.error).toContain(
      'ten-attempt limit',
    );
  });
});

describe('CLI exit taxonomy', () => {
  test('uses exit 2 for usage and resolution errors', async () => {
    const project = await temporaryProject();

    const missing = await runCli(project, ['missing.ts']);
    expect(missing.code).toBe(2);
    expect(missing.stdout).toBe('');
    expect(missing.stderr).toContain('hint: unresolved path: missing.ts');

    const unknown = await runCli(project, ['search']);
    expect(unknown.code).toBe(2);
    expect(unknown.stdout).toBe('');
    expect(unknown.stderr).toContain('hint: unknown command search');
    expect(unknown.stderr).toContain('Usage:');

    const emptyCheck = await runCli(project, ['check', 'src/app.ts']);
    expect(emptyCheck.code).toBe(2);
    expect(emptyCheck.stderr).toContain('check found no HINT files');
  });

  test('uses exit 1 for invalid knowledge and keeps JSON stdout parseable', async () => {
    const project = await temporaryProject();
    await writeFile(Path.join(project, 'src', 'app.ts.hint'), 'not a HINT document\n');

    const text = await runCli(project, ['src/app.ts']);
    expect(text.code).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain('expected front matter with hint-format: 1');

    const json = await runCli(project, ['src/app.ts', '--json']);
    const envelope = JSON.parse(json.stdout) as {
      data: { error: string };
      workflow: Record<string, never>;
      next_action: null;
      warnings: string[];
    };
    expect(json.code).toBe(1);
    expect(envelope.data.error).toContain('expected front matter with hint-format: 1');
    expect(envelope.workflow).toEqual({});
    expect(envelope.next_action).toBeNull();
    expect(envelope.warnings).toEqual([]);
    expect(json.stderr).toContain('hint:');
  });
});
