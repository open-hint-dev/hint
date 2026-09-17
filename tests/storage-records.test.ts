import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyDocument, parseDocument } from '../src/markdown.js';
import type { HintRecord } from '../src/records.js';
import { readOptional, revision, updateFile } from '../src/storage.js';
import { mutateDocument } from '../src/workflow.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(Path.join(tmpdir(), 'hint-storage-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function hypothesis(id = 'H-cache'): HintRecord {
  return {
    kind: 'Hypothesis',
    id,
    title: 'Cache invalidation is incomplete',
    metadata: { Status: 'open' },
    sections: {
      Claim: 'A changed dependency leaves the cache valid.',
      Check: 'Change one dependency and inspect the cache key.',
      Scope: 'Cache key generation.',
      'Finish conditions': 'The dependency either changes the key or does not.',
    },
  };
}

function iteration(id = 'I-cache', hypothesisId = 'H-cache'): HintRecord {
  return {
    kind: 'Iteration',
    id,
    title: 'Exercise cache invalidation',
    metadata: { Status: 'open', Hypothesis: hypothesisId },
    sections: { Action: 'Change the dependency and compare cache keys.' },
  };
}

function notice(id = 'N-cache', iterationId = 'I-cache'): HintRecord {
  return {
    kind: 'Notice',
    id,
    title: 'The cache key changed',
    metadata: { Iteration: iterationId, Result: 'pass' },
    sections: {
      Observation: 'The cache key changed with the dependency.',
      Evidence: '`cache.test.ts` passed with distinct keys.',
    },
  };
}

function thesis(id: string, guidance: string, metadata: Record<string, string> = {}): HintRecord {
  return {
    kind: 'Thesis',
    id,
    title: guidance,
    metadata: { Status: 'accepted', 'Based-on': 'user:storage contract', ...metadata },
    sections: {
      Guidance: guidance,
      Rationale: 'The storage contract requires this behavior.',
      'Revisit when': 'The persistence model changes.',
    },
  };
}

function mutate(raw: string | undefined, record: HintRecord, extra: { expectedRevision?: string; supersedes?: string } = {}) {
  return mutateDocument(raw, record, { highQuality: false, ...extra });
}

describe('storage revisions and writes', () => {
  it('hashes exact bytes and reports missing optional files', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'scope.hint');

    expect(revision('alpha')).toBe('8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8');
    expect(revision('alpha\n')).not.toBe(revision('alpha'));
    expect(revision(Buffer.from('alpha'))).toBe(revision('alpha'));
    await expect(readOptional(path)).resolves.toBeUndefined();
  });

  it('creates parent directories and returns the persisted revision', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'nested', 'scope.hint');

    const result = await updateFile(path, 'missing', () => ({ raw: 'first\n', value: 17 }));

    expect(result).toMatchObject({ value: 17, raw: 'first\n', changed: true, revision: revision('first\n') });
    await expect(readFile(path, 'utf8')).resolves.toBe('first\n');
  });

  it('does not rewrite an idempotent update', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'scope.hint');
    await writeFile(path, 'same\n');

    const result = await updateFile(path, revision('same\n'), (raw) => ({ raw: raw ?? '', value: 'unchanged' }));

    expect(result).toEqual({ value: 'unchanged', raw: 'same\n', revision: revision('same\n'), changed: false });
    expect(await readdir(directory)).toEqual(['scope.hint']);
  });

  it('rejects a stale revision without invoking the transform or changing bytes', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'scope.hint');
    await writeFile(path, 'current\n');
    let transformed = false;

    await expect(
      updateFile(path, revision('stale\n'), () => {
        transformed = true;
        return { raw: 'lost\n', value: undefined };
      }),
    ).rejects.toThrow(/revision conflict.*expected.*found/);

    expect(transformed).toBe(false);
    await expect(readFile(path, 'utf8')).resolves.toBe('current\n');
    expect(await readdir(directory)).toEqual(['scope.hint']);
  });

  it('leaves the prior file intact and cleans the lock and temporary files when a transform fails', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'scope.hint');
    await writeFile(path, 'durable\n');

    await expect(
      updateFile(path, undefined, () => {
        throw new Error('interrupted mutation');
      }),
    ).rejects.toThrow('interrupted mutation');

    await expect(readFile(path, 'utf8')).resolves.toBe('durable\n');
    expect(await readdir(directory)).toEqual(['scope.hint']);
  });

  it('serializes concurrent writers and rereads after acquiring the lock', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'scope.hint');
    await writeFile(path, emptyDocument());

    const first = updateFile(path, undefined, async (raw) => {
      await new Promise((resolve) => setTimeout(resolve, 75));
      const mutation = mutate(raw, hypothesis('H-first'));
      return { raw: mutation.raw, value: mutation.record.id };
    });
    const second = updateFile(path, undefined, (raw) => {
      const mutation = mutate(raw, hypothesis('H-second'));
      return { raw: mutation.raw, value: mutation.record.id };
    });
    const results = await Promise.all([first, second]);

    const persisted = parseDocument(await readFile(path, 'utf8'));
    expect(persisted.records.map((record) => record.id).sort()).toEqual(['H-first', 'H-second']);
    expect(results.every((result) => result.changed)).toBe(true);
    expect(await readdir(directory)).toEqual(['scope.hint']);
  });

  it('waits for an existing lock rather than deleting it as stale', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'scope.hint');
    const lockPath = `${path}.write-lock`;
    await writeFile(path, 'before\n');
    await writeFile(lockPath, 'owner');
    const release = setTimeout(() => void rm(lockPath, { force: true }), 80);

    try {
      const result = await updateFile(path, undefined, (raw) => ({ raw: `${raw ?? ''}after\n`, value: undefined }));
      expect(result.changed).toBe(true);
    } finally {
      clearTimeout(release);
    }

    await expect(readFile(path, 'utf8')).resolves.toBe('before\nafter\n');
    expect(await readdir(directory)).toEqual(['scope.hint']);
  });
});

describe('record state and history', () => {
  it('writes linked records, completes the observed iteration, and keeps the hypothesis open', () => {
    let raw = mutate(undefined, hypothesis()).raw;
    raw = mutate(raw, iteration()).raw;
    const result = mutate(raw, notice());
    const records = parseDocument(result.raw).records;

    expect(records.find((record) => record.id === 'I-cache')?.metadata.Status).toBe('completed');
    expect(records.find((record) => record.id === 'H-cache')?.metadata.Status).toBe('open');
    expect(records.find((record) => record.id === 'N-cache')?.metadata.Result).toBe('pass');
    expect(result.next).toContain('Assess H-cache');
  });

  it('does not duplicate a byte-equivalent retry with the same ID', () => {
    const first = mutate(undefined, hypothesis());
    const second = mutate(first.raw, hypothesis());

    expect(second.raw).toBe(first.raw);
    expect(parseDocument(second.raw).records.filter((record) => record.id === 'H-cache')).toHaveLength(1);
  });

  it('accepts an identical retry after a record reached a terminal status', () => {
    const open = mutate(undefined, hypothesis());
    const supportedRecord = hypothesis();
    supportedRecord.metadata.Status = 'supported';
    const supported = mutate(open.raw, supportedRecord);

    const retried = mutate(supported.raw, supportedRecord);

    expect(retried.raw).toBe(supported.raw);
    expect(parseDocument(retried.raw).records).toHaveLength(1);
  });

  it('requires a revision guard for same-status editorial changes', () => {
    const first = mutate(undefined, hypothesis());
    const edited = hypothesis();
    edited.sections.Claim = 'An edited claim.';

    expect(() => mutate(first.raw, edited)).toThrow(/requires --expected-revision/);
    expect(() => mutate(first.raw, edited, { expectedRevision: revision(first.raw) })).not.toThrow();
  });

  it('keeps Notices immutable without a revision guard and permits a guarded editorial correction', () => {
    let raw = mutate(undefined, hypothesis()).raw;
    raw = mutate(raw, iteration()).raw;
    raw = mutate(raw, notice()).raw;
    const corrected = notice();
    corrected.sections.Evidence = '`cache.test.ts` passed twice with distinct keys.';

    expect(() => mutate(raw, corrected)).toThrow(/updating Notice N-cache requires --expected-revision/);
    const result = mutate(raw, corrected, { expectedRevision: revision(raw) });
    expect(parseDocument(result.raw).records.find((record) => record.id === 'N-cache')?.sections.Evidence).toContain(
      'passed twice',
    );
  });

  it('rejects reopening terminal records and invalid status jumps', () => {
    const open = mutate(undefined, hypothesis());
    const supportedRecord = hypothesis();
    supportedRecord.metadata.Status = 'supported';
    const supported = mutate(open.raw, supportedRecord);

    expect(() => mutate(supported.raw, hypothesis(), { expectedRevision: revision(supported.raw) })).toThrow(
      /invalid Hypothesis transition|terminal/,
    );

    const accepted = mutate(undefined, thesis('T-current', 'Keep writes atomic.'));
    const proposed = thesis('T-current', 'Keep writes atomic.');
    proposed.metadata.Status = 'proposed';
    expect(() => mutate(accepted.raw, proposed, { expectedRevision: revision(accepted.raw) })).toThrow(
      /invalid Thesis transition|terminal/,
    );
  });

  it('supersedes a thesis atomically and preserves its complete historical body', () => {
    const old = thesis('T-old', 'Use the original write strategy.');
    old.metadata.Owner = 'storage-team';
    old.sections['Operational note'] = 'Preserve this manually-authored detail.';
    const original = mutate(undefined, old);
    const replacement = thesis('T-new', 'Use atomic rename.', { Supersedes: 'T-old' });

    const result = mutate(original.raw, replacement, { supersedes: 'T-old' });
    const parsed = parseDocument(result.raw);
    const current = parsed.records.find((record) => record.id === 'T-new');
    const historical = parsed.records.find((record) => record.id === 'T-old');

    expect(current).toMatchObject({ container: 'Current theses', metadata: { Status: 'accepted', Supersedes: 'T-old' } });
    expect(historical).toMatchObject({
      container: 'Historical theses',
      metadata: { Status: 'superseded', 'Superseded-by': 'T-new', Owner: 'storage-team' },
      sections: { Guidance: 'Use the original write strategy.', 'Operational note': 'Preserve this manually-authored detail.' },
    });
    expect((result.raw.match(/## Thesis T-old:/g) ?? [])).toHaveLength(1);
  });

  it('moves a withdrawn current thesis into history without losing its body', () => {
    const original = mutate(undefined, thesis('T-withdrawn', 'Use the current strategy.'));
    const withdrawn = thesis('T-withdrawn', 'Use the current strategy.');
    withdrawn.metadata.Status = 'withdrawn';

    const result = mutate(original.raw, withdrawn, { expectedRevision: revision(original.raw) });
    const record = parseDocument(result.raw).records.find((item) => item.id === 'T-withdrawn');

    expect(record).toMatchObject({ container: 'Historical theses', metadata: { Status: 'withdrawn' } });
    expect(record?.sections.Guidance).toBe('Use the current strategy.');
  });

  it('makes retrying an already-applied replacement idempotent', () => {
    const first = mutate(undefined, thesis('T-old', 'Original.'));
    const replacement = thesis('T-new', 'Replacement.', { Supersedes: 'T-old' });
    const replaced = mutate(first.raw, replacement, { supersedes: 'T-old' });

    const retried = mutate(replaced.raw, replacement, { supersedes: 'T-old' });

    expect(retried.raw).toBe(replaced.raw);
    expect((retried.raw.match(/## Thesis T-new:/g) ?? [])).toHaveLength(1);
    expect((retried.raw.match(/## Thesis T-old:/g) ?? [])).toHaveLength(1);
  });

  it('rejects a second replacement and a missing or non-accepted predecessor', () => {
    const first = mutate(undefined, thesis('T-old', 'Original.'));
    const second = mutate(first.raw, thesis('T-new', 'Replacement.', { Supersedes: 'T-old' }), {
      supersedes: 'T-old',
    });

    expect(() =>
      mutate(second.raw, thesis('T-another', 'Another.', { Supersedes: 'T-old' }), { supersedes: 'T-old' }),
    ).toThrow(/is not accepted/);
    expect(() =>
      mutate(first.raw, thesis('T-missing-replacement', 'Missing.', { Supersedes: 'T-missing' }), {
        supersedes: 'T-missing',
      }),
    ).toThrow(/not found in the same file/);
  });

  it('preserves unrelated free Markdown around managed records', () => {
    const raw = `${emptyDocument()}\n# Operator notes\n\nKeep **this** prose and its spacing.\n`;

    const result = mutate(raw, hypothesis());

    expect(result.raw).toContain('# Operator notes\n\nKeep **this** prose and its spacing.\n');
    expect(parseDocument(result.raw).records.map((record) => record.id)).toEqual(['H-cache']);
  });

  it('does not publish a partially mutated document when replacement validation fails', async () => {
    const directory = await temporaryDirectory();
    const path = Path.join(directory, 'scope.hint');
    const original = mutate(undefined, thesis('T-old', 'Original.')).raw;
    await writeFile(path, original);
    const invalidReplacement = thesis('T-new', 'Replacement.', { Supersedes: 'T-old' });
    invalidReplacement.metadata.Status = 'proposed';

    await expect(
      updateFile(path, revision(original), (raw) => {
        const result = mutate(raw, invalidReplacement, { supersedes: 'T-old' });
        return { raw: result.raw, value: result.record };
      }),
    ).rejects.toThrow(/only an accepted Thesis can supersede/);

    await expect(readFile(path, 'utf8')).resolves.toBe(original);
    expect(await readdir(directory)).toEqual(['scope.hint']);
  });
});
