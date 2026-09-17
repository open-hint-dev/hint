import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateDocument } from '../src/markdown.js';
import { fingerprint, qualityState, validateFingerprints } from '../src/quality.js';
import type { HintRecord } from '../src/records.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(Path.join(tmpdir(), 'hint-quality-'));
  temporaryDirectories.push(directory);
  return directory;
}

function hypothesis(status = 'open', scope = 'src/widget.ts'): HintRecord {
  return {
    kind: 'Hypothesis',
    id: 'H-quality',
    title: 'The implementation meets its criteria',
    metadata: { Status: status },
    sections: {
      Claim: 'The implementation meets every required criterion.',
      Check: 'Run each declared verification method.',
      Scope: scope,
      'Finish conditions': 'Every required criterion has current passing evidence.',
    },
  };
}

function iteration(
  id: string,
  attempt: number,
  status: 'open' | 'completed' | 'blocked' | 'abandoned' = 'completed',
): HintRecord {
  return {
    kind: 'Iteration',
    id,
    title: `Quality attempt ${attempt}`,
    metadata: { Status: status, Hypothesis: 'H-quality', Attempt: String(attempt) },
    sections: {
      Action: 'Implement and verify the bounded change.',
      Goal: 'Meet the requested behavior.',
      'Required criteria': '- [ ] C-focused: focused tests pass',
      Verification: '- C-focused: run the focused test suite',
      'Score rubric': '0 means unusable; 10 means all criteria pass with no known gaps.',
    },
  };
}

function notice(
  id: string,
  iterationId: string,
  attempt: number,
  options: {
    result?: 'pass' | 'fail' | 'unknown' | 'error' | 'blocked' | 'abandoned';
    score?: number;
    evidence?: string;
    observation?: string;
    shortcomings?: string;
    fingerprints?: string;
    scope?: string;
  } = {},
): HintRecord {
  return {
    kind: 'Notice',
    id,
    title: `Result of attempt ${attempt}`,
    metadata: {
      Iteration: iterationId,
      Result: options.result ?? 'pass',
      Attempt: String(attempt),
      Score: String(options.score ?? 8),
      Scope: options.scope ?? 'src/widget.ts',
    },
    sections: {
      Observation: options.observation ?? 'The focused test suite passed.',
      Evidence: options.evidence ?? '- [x] C-focused: pass',
      'Known shortcomings': options.shortcomings ?? 'none',
      Fingerprints:
        options.fingerprints ??
        '- src/widget.ts: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  };
}

function completedAttempt(
  attempt: number,
  options: Parameters<typeof notice>[3] = {},
): [HintRecord, HintRecord] {
  const iterationId = `I-quality-${attempt}`;
  return [iteration(iterationId, attempt), notice(`N-quality-${attempt}`, iterationId, attempt, options)];
}

describe('working-tree fingerprints', () => {
  it('hashes the current bytes, including dirty content not represented by HEAD', async () => {
    const root = await temporaryDirectory();
    const target = Path.join(root, 'tracked.ts');
    await writeFile(target, 'export const value = "committed";\n');
    const before = await fingerprint('tracked.ts', root);

    await writeFile(target, 'export const value = "dirty working tree";\n');
    const dirty = await fingerprint('tracked.ts', root);

    expect(dirty).not.toBe(before);
    const record = notice('N-dirty', 'I-quality-1', 1, {
      fingerprints: `- tracked.ts: sha256:${before}`,
    });
    await expect(validateFingerprints(record, root, 'scope.hint')).resolves.toEqual([
      expect.objectContaining({ message: 'N-dirty fingerprint is stale for tracked.ts' }),
    ]);
  });

  it('accepts a fingerprint of the exact current bytes', async () => {
    const root = await temporaryDirectory();
    await writeFile(Path.join(root, 'checked.ts'), 'dirty but verified\n');
    const current = await fingerprint('checked.ts', root);
    const record = notice('N-current', 'I-quality-1', 1, {
      fingerprints: `- checked.ts: sha256:${current}`,
    });

    await expect(validateFingerprints(record, root, 'scope.hint')).resolves.toEqual([]);
  });

  it('marks missing and out-of-root fingerprint evidence unavailable', async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await writeFile(Path.join(outside, 'outside.ts'), 'outside\n');
    await symlink(Path.join(outside, 'outside.ts'), Path.join(root, 'escape.ts'));
    const record = notice('N-unavailable', 'I-quality-1', 1, {
      fingerprints: [
        '- missing.ts: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '- escape.ts: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ].join('\n'),
    });

    const diagnostics = await validateFingerprints(record, root, 'scope.hint');
    expect(diagnostics.map((item) => item.message)).toEqual([
      'N-unavailable fingerprint is unavailable for missing.ts',
      'N-unavailable fingerprint is unavailable for escape.ts',
    ]);
  });
});

describe('quality completion', () => {
  it('accepts the minimum successful subjective score of 8', () => {
    const records = [hypothesis(), ...completedAttempt(1, { score: 8 })];

    expect(qualityState(records, 'H-quality')).toMatchObject({
      attempts: 1,
      completed: true,
      blocked: false,
      limitReached: false,
      stagnated: false,
      abandoned: false,
    });
  });

  it('does not let score 10 override a failed required criterion', () => {
    const records = [
      hypothesis(),
      ...completedAttempt(1, {
        score: 10,
        evidence: '- [x] C-focused: fail',
      }),
    ];

    expect(qualityState(records, 'H-quality').completed).toBe(false);
  });

  it.each([
    ['unknown Notice result', { result: 'unknown' as const }],
    ['unknown criterion evidence', { evidence: '- [x] C-focused: unknown' }],
    ['unchecked criterion', { evidence: '- [ ] C-focused: pass' }],
    ['known shortcoming', { shortcomings: 'The integration check is still missing.' }],
  ])('does not complete with %s', (_name, options) => {
    const records = [hypothesis(), ...completedAttempt(1, options)];

    expect(qualityState(records, 'H-quality').completed).toBe(false);
  });
});

describe('attempt accounting and stopping conditions', () => {
  it('counts only completed Iterations with a linked Notice as consumed attempts', () => {
    const records = [
      hypothesis(),
      iteration('I-quality-1', 1, 'completed'),
      notice('N-quality-1', 'I-quality-1', 1, { result: 'fail', score: 4 }),
      iteration('I-quality-2', 2, 'blocked'),
      notice('N-quality-2', 'I-quality-2', 2, { result: 'blocked', score: 4 }),
      iteration('I-quality-3', 3, 'abandoned'),
      notice('N-quality-3', 'I-quality-3', 3, { result: 'abandoned', score: 4 }),
    ];

    expect(qualityState(records, 'H-quality').attempts).toBe(1);
  });

  it('consumes a completed attempt even when its check ended in error, without treating the error as evidence', () => {
    const records = [
      hypothesis(),
      iteration('I-quality-1', 1, 'completed'),
      notice('N-quality-1', 'I-quality-1', 1, { result: 'error', score: 0 }),
      ...completedAttempt(2, { result: 'fail', score: 5 }),
    ];

    expect(qualityState(records, 'H-quality')).toMatchObject({ attempts: 2, completed: false });
  });

  it('reaches the limit at exactly ten consumed attempts without converting it to success', () => {
    const attempts = Array.from({ length: 10 }, (_, index) =>
      completedAttempt(index + 1, {
        result: 'fail',
        score: 7,
        observation: `Attempt ${index + 1} still fails.`,
      }),
    ).flat();

    expect(qualityState([hypothesis(), ...attempts], 'H-quality')).toMatchObject({
      attempts: 10,
      completed: false,
      limitReached: true,
    });
  });

  it('detects stagnation after two consecutive consumed attempts add no result, observation, evidence, or fingerprint', () => {
    const first = completedAttempt(1, { result: 'fail', score: 6 });
    const second = completedAttempt(2, { result: 'fail', score: 6 });

    expect(qualityState([hypothesis(), ...first, ...second], 'H-quality').stagnated).toBe(true);
  });

  it('does not report stagnation when the second attempt adds a new observation', () => {
    const first = completedAttempt(1, { result: 'fail', score: 6 });
    const second = completedAttempt(2, {
      result: 'fail',
      score: 6,
      observation: 'The failure moved to a different assertion.',
    });

    expect(qualityState([hypothesis(), ...first, ...second], 'H-quality').stagnated).toBe(false);
  });
});

describe('terminal outcome and scope invariants', () => {
  it('lets a later blocker override an earlier passing attempt', () => {
    const records = [
      hypothesis(),
      ...completedAttempt(1),
      iteration('I-quality-2', 2, 'blocked'),
      notice('N-quality-2', 'I-quality-2', 2, { result: 'blocked', score: 8 }),
    ];

    expect(qualityState(records, 'H-quality')).toMatchObject({ completed: false, blocked: true });
  });

  it('preserves abandonment as a non-success outcome', () => {
    const records = [hypothesis('abandoned'), ...completedAttempt(1)];

    expect(qualityState(records, 'H-quality')).toMatchObject({ completed: false, abandoned: true });
  });

  it('rejects a Notice whose reported scope expands beyond its Hypothesis scope', () => {
    const h = hypothesis('open', 'src/widget.ts');
    const i = iteration('I-quality-1', 1);
    const n = notice('N-quality-1', 'I-quality-1', 1, { scope: 'src/**' });
    const document = {
      raw: '',
      lines: [],
      records: [h, i, n].map((record) => ({
        ...record,
        start: 0,
        end: 0,
        container: 'Investigations' as const,
      })),
      headings: {},
    };

    expect(validateDocument(document, 'scope.hint', true).some(({ message }) => /scope/i.test(message))).toBe(true);
  });

  it('requires an explicit reason when a later attempt changes required criteria', () => {
    const first = iteration('I-quality-1', 1);
    const changed = iteration('I-quality-2', 2);
    changed.sections['Required criteria'] = '- [ ] C-focused: focused tests pass\n- [ ] C-integration: integration tests pass';
    const document = {
      raw: '',
      lines: [],
      records: [hypothesis(), first, changed].map((record) => ({
        ...record,
        start: 0,
        end: 0,
        container: 'Investigations' as const,
      })),
      headings: {},
    };

    expect(
      validateDocument(document, 'criteria.hint', true).some(({ message }) => /criteria.*reason/i.test(message)),
    ).toBe(true);
  });

  it('accepts a declared reason for a criteria change', () => {
    const first = iteration('I-quality-1', 1);
    const changed = iteration('I-quality-2', 2);
    changed.metadata['Criteria-change-reason'] = 'The integration boundary entered the requested scope.';
    changed.sections['Required criteria'] = '- [ ] C-focused: focused tests pass\n- [ ] C-integration: integration tests pass';
    const document = {
      raw: '',
      lines: [],
      records: [hypothesis(), first, changed].map((record) => ({
        ...record,
        start: 0,
        end: 0,
        container: 'Investigations' as const,
      })),
      headings: {},
    };

    expect(
      validateDocument(document, 'criteria.hint', true).filter(({ message }) => /criteria.*reason/i.test(message)),
    ).toEqual([]);
  });

  it('does not make an already accepted completed Thesis block newer negative evidence', () => {
    const [attempt, failedNotice] = completedAttempt(1, { result: 'fail', score: 7 });
    const thesis: HintRecord = {
      kind: 'Thesis',
      id: 'T-quality',
      title: 'The task is complete',
      metadata: { Status: 'accepted', 'Based-on': failedNotice.id, 'Task-outcome': 'completed' },
      sections: {
        Guidance: 'Treat the requested work as complete.',
        Rationale: 'The latest attempt is the declared basis.',
        'Revisit when': 'The evidence changes.',
      },
    };
    const document = {
      raw: '',
      lines: [],
      records: [hypothesis(), attempt, failedNotice, thesis].map((record) => ({
        ...record,
        start: 0,
        end: 0,
        container: record.kind === 'Thesis' ? ('Current theses' as const) : ('Investigations' as const),
      })),
      headings: {},
    };

    expect(validateDocument(document, 'outcome.hint', true)).toEqual([]);
  });

  it('allows an accepted Thesis to preserve an unsuccessful lesson', () => {
    const [attempt, failedNotice] = completedAttempt(1, { result: 'fail', score: 7 });
    const thesis: HintRecord = {
      kind: 'Thesis',
      id: 'T-quality',
      title: 'The approach does not satisfy the criteria',
      metadata: { Status: 'accepted', 'Based-on': failedNotice.id, 'Task-outcome': 'unsuccessful' },
      sections: {
        Guidance: 'Do not repeat this approach without addressing the failed criterion.',
        Rationale: 'The latest attempt failed its declared evidence check.',
        'Revisit when': 'A materially different verification strategy is available.',
      },
    };
    const document = {
      raw: '',
      lines: [],
      records: [hypothesis(), attempt, failedNotice, thesis].map((record) => ({
        ...record,
        start: 0,
        end: 0,
        container: record.kind === 'Thesis' ? ('Current theses' as const) : ('Investigations' as const),
      })),
      headings: {},
    };

    expect(validateDocument(document, 'outcome.hint', true)).toEqual([]);
  });
});
