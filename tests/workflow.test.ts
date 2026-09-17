import { describe, expect, it } from 'vitest';
import { emptyDocument, parseDocument } from '../src/markdown.js';
import type { HintRecord } from '../src/records.js';
import { revision } from '../src/storage.js';
import { mutateDocument, nextAction, preparation, simpleRecord } from '../src/workflow.js';

const hypothesis = (id = 'H-cache'): HintRecord => ({
  kind: 'Hypothesis',
  id,
  title: 'Cache entries can cross users',
  metadata: { Status: 'open' },
  sections: {
    Claim: 'The cache key omits the user identity.',
    Check: 'Request the same resource as two users.',
    Scope: 'src/cache.ts',
    'Finish conditions': 'The isolated test either reproduces the leak or rules it out.',
  },
});

const iteration = (id = 'I-cache-1', attempt?: number): HintRecord => ({
  kind: 'Iteration',
  id,
  title: 'Run the two-user check',
  metadata: {
    Status: 'open',
    Hypothesis: 'H-cache',
    ...(attempt === undefined ? {} : { Attempt: String(attempt) }),
  },
  sections: {
    Action: 'Run the isolated two-user regression test.',
    ...(attempt === undefined
      ? {}
      : {
          Goal: 'Prevent cross-user cache reads.',
          'Required criteria': '- [ ] The second user cannot read the first user response.',
          Verification: '- isolation: run the two-user regression test',
          'Score rubric': '0 is untested; 10 is verified with no known gaps.',
        }),
  },
});

const notice = (result: 'pass' | 'fail' | 'unknown' = 'pass'): HintRecord => ({
  kind: 'Notice',
  id: 'N-cache-leak',
  title: 'The second user received the first response',
  metadata: { Iteration: 'I-cache-1', Result: result },
  sections: {
    Observation: 'The response was reused across user identities.',
    Evidence: '`cache.test.ts` failed before the key included the user.',
  },
});

const thesis = (id: string, status = 'accepted'): HintRecord => ({
  kind: 'Thesis',
  id,
  title: 'Include identity in cache keys',
  metadata: { Status: status, 'Based-on': 'N-cache-leak' },
  sections: {
    Guidance: 'Include user identity in every private cache key.',
    Rationale: 'The isolated regression demonstrated cross-user reuse.',
  },
});

function add(raw: string | undefined, record: HintRecord, highQuality = false): string {
  return mutateDocument(raw, record, { highQuality }).raw;
}

describe('workflow state machine', () => {
  it('runs a complete H-I-N-T cycle and completes the linked iteration when its Notice is saved', () => {
    let raw: string | undefined;
    raw = add(raw, hypothesis());
    raw = add(raw, iteration());
    const noticeMutation = mutateDocument(raw, notice(), { highQuality: false });
    raw = noticeMutation.raw;

    const afterNotice = parseDocument(raw);
    expect(afterNotice.records.find((record) => record.id === 'I-cache-1')?.metadata.Status).toBe('completed');
    expect(noticeMutation.next).toContain('Assess H-cache');

    raw = add(raw, { ...hypothesis(), metadata: { Status: 'supported' } });
    const thesisMutation = mutateDocument(raw, thesis('T-cache-identity'), { highQuality: false });
    expect(thesisMutation.next).toContain('Apply this guidance');
    expect(parseDocument(thesisMutation.raw).records.map((record) => record.id)).toEqual([
      'T-cache-identity',
      'H-cache',
      'I-cache-1',
      'N-cache-leak',
    ]);
  });

  it('supports several bounded iterations linked to one hypothesis', () => {
    let raw = add(undefined, hypothesis());
    raw = add(raw, iteration('I-cache-1'));
    raw = add(raw, { ...notice('fail'), id: 'N-cache-1' });
    raw = add(raw, { ...iteration('I-cache-2'), metadata: { Status: 'open', Hypothesis: 'H-cache' } });
    raw = add(raw, {
      ...notice('pass'),
      id: 'N-cache-2',
      metadata: { Iteration: 'I-cache-2', Result: 'pass' },
    });

    const records = parseDocument(raw).records;
    expect(records.filter((record) => record.kind === 'Iteration').map((record) => record.metadata.Status)).toEqual([
      'completed',
      'completed',
    ]);
    expect(records.filter((record) => record.kind === 'Notice')).toHaveLength(2);
  });

  it('does not let an unrelated open cycle change NEXT for the selected record', () => {
    const unrelated = hypothesis('H-unrelated');
    const records = [unrelated, hypothesis(), iteration()];
    expect(nextAction(iteration(), records, false)).toContain('Perform I-cache-1');
    expect(nextAction({ ...hypothesis(), metadata: { Status: 'abandoned' } }, records, false)).toContain('abandoned');
  });

  it('rejects reopening terminal records', () => {
    let raw = add(undefined, { ...hypothesis(), metadata: { Status: 'refuted' } });
    expect(() => add(raw, hypothesis())).toThrow(/terminal|invalid .* transition/i);

    raw = add(undefined, hypothesis());
    raw = add(raw, { ...iteration(), metadata: { Status: 'blocked', Hypothesis: 'H-cache' } });
    expect(() => add(raw, iteration())).toThrow(/terminal|invalid .* transition/i);
  });

  it('requires revision intent for semantic edits that retain an ID and status', () => {
    const raw = add(undefined, hypothesis());
    const changed = { ...hypothesis(), sections: { ...hypothesis().sections, Claim: 'A different claim.' } };
    expect(() => mutateDocument(raw, changed, { highQuality: false })).toThrow(/requires --expected-revision/i);
    expect(() => mutateDocument(raw, changed, { highQuality: false, expectedRevision: 'caller-checked' })).not.toThrow();
  });

  it('preserves free Markdown and comments when updating or moving a record', () => {
    const initial = add(undefined, hypothesis()).replace(
      'Status: open\n\n### Claim',
      'Status: open\n\n<!-- manually curated context -->\n\nThis explanation must remain byte-for-byte.\n\n### Claim',
    );
    const changed = {
      ...hypothesis(),
      sections: { ...hypothesis().sections, Claim: 'The cache key excludes the tenant identity.' },
    };
    const edited = mutateDocument(initial, changed, {
      highQuality: false,
      expectedRevision: revision(initial),
    }).raw;
    expect(edited).toContain('<!-- manually curated context -->\n\nThis explanation must remain byte-for-byte.');

    const old = {
      ...thesis('T-manual'),
      metadata: { Status: 'accepted', 'Based-on': 'user:manual decision' },
    };
    let withThesis = add(edited, old).replace(
      'Based-on: user:manual decision\n\n### Guidance\nInclude user identity in every private cache key.',
      'Based-on: user:manual decision\n\n<!-- decision owner: platform -->\n\nManual rationale preface.\n\n### Guidance\nInclude user identity in every private cache key.',
    );
    const replacement: HintRecord = {
      ...thesis('T-manual-new'),
      metadata: { Status: 'accepted', 'Based-on': 'user:new decision', Supersedes: 'T-manual' },
    };
    withThesis = mutateDocument(withThesis, replacement, { highQuality: false }).raw;
    expect(withThesis).toContain('<!-- decision owner: platform -->\n\nManual rationale preface.');
    expect(parseDocument(withThesis).records.find((record) => record.id === 'T-manual')?.container).toBe(
      'Historical theses',
    );
  });

  it('replaces an accepted Thesis atomically and retains the old record in history', () => {
    let raw = add(undefined, hypothesis());
    raw = add(raw, iteration());
    raw = add(raw, notice());
    raw = add(raw, thesis('T-old'));
    const replacement: HintRecord = {
      ...thesis('T-new'),
      title: 'Use scoped identity in cache keys',
      metadata: { Status: 'accepted', 'Based-on': 'N-cache-leak', Supersedes: 'T-old' },
      sections: {
        Guidance: 'Include tenant and user identity in every private cache key.',
        Rationale: 'The newer scope distinguishes tenants as well as users.',
      },
    };

    const result = mutateDocument(raw, replacement, { highQuality: false, supersedes: 'T-old' });
    const document = parseDocument(result.raw);
    const old = document.records.find((record) => record.id === 'T-old');
    const current = document.records.find((record) => record.id === 'T-new');
    expect(current?.container).toBe('Current theses');
    expect(old).toMatchObject({
      container: 'Historical theses',
      metadata: { Status: 'superseded', 'Superseded-by': 'T-new' },
    });
    expect(current?.metadata.Supersedes).toBe('T-old');
  });

  it('edits and withdraws an already superseding Thesis without replaying supersession', () => {
    const standalone = (id: string): HintRecord => ({
      ...thesis(id),
      metadata: { Status: 'accepted', 'Based-on': 'user:explicit cache-key decision' },
    });
    let raw = add(undefined, standalone('T-old'));
    const replacement: HintRecord = {
      ...standalone('T-new'),
      metadata: { ...standalone('T-new').metadata, Supersedes: 'T-old' },
    };
    raw = mutateDocument(raw, replacement, { highQuality: false }).raw;

    const clarified: HintRecord = {
      ...replacement,
      sections: { ...replacement.sections, Rationale: 'The decision was clarified after review.' },
    };
    raw = mutateDocument(raw, clarified, {
      highQuality: false,
      expectedRevision: revision(raw),
    }).raw;
    expect(parseDocument(raw).records.find((record) => record.id === 'T-new')?.sections.Rationale).toContain(
      'clarified',
    );

    const withdrawn: HintRecord = { ...clarified, metadata: { ...clarified.metadata, Status: 'withdrawn' } };
    raw = mutateDocument(raw, withdrawn, {
      highQuality: false,
      expectedRevision: revision(raw),
    }).raw;
    expect(parseDocument(raw).records.find((record) => record.id === 'T-new')).toMatchObject({
      container: 'Historical theses',
      metadata: { Status: 'withdrawn', Supersedes: 'T-old' },
    });
  });

  it('rejects missing, cross-file-equivalent, and already replaced supersession targets', () => {
    const standalone = (id: string): HintRecord => ({
      ...thesis(id),
      metadata: { Status: 'accepted', 'Based-on': 'user:explicit cache-key decision' },
    });
    const raw = add(undefined, standalone('T-current'));
    const replacement = { ...standalone('T-new'), metadata: { ...standalone('T-new').metadata, Supersedes: 'T-elsewhere' } };
    expect(() => mutateDocument(raw, replacement, { highQuality: false })).toThrow(/not found in the same file/);

    const once = mutateDocument(
      raw,
      { ...standalone('T-new'), metadata: { ...standalone('T-new').metadata, Supersedes: 'T-current' } },
      { highQuality: false },
    ).raw;
    expect(() =>
      mutateDocument(
        once,
        { ...standalone('T-newer'), metadata: { ...standalone('T-newer').metadata, Supersedes: 'T-current' } },
        { highQuality: false },
      ),
    ).toThrow(/not accepted/);
  });

  it('prepares non-mutating templates with destination and revision for default and HQ modes', () => {
    const regular = preparation('Iteration', '/tmp/project/file.ts.hint', 'missing', false);
    expect(regular).toContain('Destination: /tmp/project/file.ts.hint');
    expect(regular).toContain('Revision: missing');
    expect(regular).not.toContain('### Score rubric');

    const highQuality = preparation('Iteration', '/tmp/project/file.ts.hint', 'abc123', true);
    expect(highQuality).toContain('Attempt: 1');
    expect(highQuality).toContain('### Required criteria');
    expect(highQuality).toContain('### Verification');
    expect(highQuality).toContain('### Score rubric');
  });

  it('creates minimal text records without inventing a successful outcome', () => {
    const hypothesisRecord = simpleRecord('Hypothesis', 'Unicode: кэш должен быть изолирован', {
      id: 'H-unicode',
      target: 'src/кэш файл.ts',
    });
    expect(hypothesisRecord.metadata.Status).toBe('open');
    expect(hypothesisRecord.sections.Scope).toBe('src/кэш файл.ts');

    const noticeRecord = simpleRecord('Notice', 'Проверка недоступна', {
      id: 'N-unknown',
      iteration: 'I-cache-1',
      target: 'src/cache.ts',
    });
    expect(noticeRecord.metadata.Result).toBe('unknown');
    expect(noticeRecord.sections.Evidence).toMatch(/not supplied/i);
  });

  it('starts from the canonical empty document without hidden records', () => {
    const document = parseDocument(emptyDocument());
    expect(document.records).toEqual([]);
    expect(Object.keys(document.headings)).toEqual(['Current theses', 'Investigations', 'Historical theses']);
  });
});
