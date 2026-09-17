import { describe, expect, it } from 'vitest';
import {
  canonicalRecord,
  emptyDocument,
  insertRecord,
  parseDocument,
  parseRecordFragment,
  removeRecord,
  renderRecord,
  replaceRecord,
  validateDocument,
} from '../src/markdown.js';
import type { HintRecord } from '../src/records.js';

const document = (body: string): string => `---
hint-format: 1
---
# Current theses

${body.trim()}

# Investigations

# Historical theses
`;

const acceptedThesis: HintRecord = {
  kind: 'Thesis',
  id: 'T-request-id',
  title: 'Match completion by request identity',
  metadata: { Status: 'accepted', 'Based-on': 'user:explicit decision' },
  sections: {
    Guidance: 'Match a response to the waiting request **ID**.',
    Rationale: 'Concurrent requests can share a route.',
  },
};

describe('HINT Markdown parsing', () => {
  it('creates and parses the minimal version 1 document', () => {
    const raw = emptyDocument();

    expect(raw).toBe(
      '---\nhint-format: 1\n---\n# Current theses\n\n# Investigations\n\n# Historical theses\n',
    );
    expect(parseDocument(raw, 'empty.hint')).toMatchObject({ records: [] });
    expect(validateDocument(parseDocument(raw), 'empty.hint', false)).toEqual([]);
  });

  it('preserves Unicode and inline Markdown in titles, metadata, and prose', () => {
    const raw = document(`
## Thesis T-unicode: Сопоставлять запросы по идентификатору — 東京
Status: accepted
Based-on: user:решение владельца
Reviewer note: naïve / café

### Guidance
Использовать **request ID**, а не _route_; см. [описание](./архитектура.md).

### Rationale
Два запроса могут иметь один маршрут: \`/поиск\`.

### Пользовательский раздел
Сохраняется без потери символов: 中文, emoji 🧭.
`);

    const [record] = parseDocument(raw).records;
    expect(record).toMatchObject({
      id: 'T-unicode',
      title: 'Сопоставлять запросы по идентификатору — 東京',
      metadata: {
        Status: 'accepted',
        'Based-on': 'user:решение владельца',
        'Reviewer note': 'naïve / café',
      },
      sections: {
        Guidance: 'Использовать **request ID**, а не _route_; см. [описание](./архитектура.md).',
        Rationale: 'Два запроса могут иметь один маршрут: `/поиск`.',
        'Пользовательский раздел': 'Сохраняется без потери символов: 中文, emoji 🧭.',
      },
    });
  });

  it('does not interpret headings inside backtick or tilde fences', () => {
    const raw = document(`
## Thesis T-fences: Keep examples as prose
Status: accepted
Based-on: decision:documented fixture

### Guidance
The following are examples, not records:

\`\`\`markdown
## Thesis T-fake: Not a record
Status: nonsense
### Rationale
# Historical theses
\`\`\`

~~~~text
## Hypothesis H-also-fake: Still not a record
# Investigations
~~~~

### Rationale
Fenced Markdown is prose.
`);

    const parsed = parseDocument(raw);
    expect(parsed.records.map(({ id }) => id)).toEqual(['T-fences']);
    expect(parsed.records[0]?.sections.Guidance).toContain('T-fake');
    expect(parsed.records[0]?.sections.Guidance).toContain('H-also-fake');
    expect(parsed.records[0]?.sections.Rationale).toBe('Fenced Markdown is prose.');
  });

  it('normalizes CRLF without changing record content', () => {
    const raw = document(renderRecord(acceptedThesis)).replaceAll('\n', '\r\n');
    const parsed = parseDocument(raw);

    expect(parsed.raw).not.toContain('\r');
    expect(parsed.records[0]?.sections.Guidance).toBe(acceptedThesis.sections.Guidance);
  });

  it('ignores records under unknown level-one sections', () => {
    const raw = `${emptyDocument()}# Notes

## Thesis T-note: This is ordinary project documentation
Status: accepted

### Guidance
It must not become active guidance.
`;

    expect(parseDocument(raw).records).toEqual([]);
  });

  it('parses exactly one complete standalone record fragment', () => {
    expect(parseRecordFragment(renderRecord(acceptedThesis))).toEqual(acceptedThesis);
    expect(() => parseRecordFragment('ordinary prose')).toThrow(
      'payload must contain exactly one complete ## record',
    );
    expect(() =>
      parseRecordFragment(`${renderRecord(acceptedThesis)}\n${renderRecord({ ...acceptedThesis, id: 'T-two' })}`),
    ).toThrow('payload must contain exactly one complete ## record');
  });
});

describe('front matter and grammar diagnostics', () => {
  it.each([
    ['missing front matter', '# Current theses\n'],
    ['unknown version', '---\nhint-format: 2\n---\n# Current theses\n'],
    ['extra front matter', '---\nhint-format: 1\nowner: team\n---\n# Current theses\n'],
    ['UTF-8 BOM before front matter', `\uFEFF---\nhint-format: 1\n---\n# Current theses\n`],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseDocument(raw, 'broken.hint')).toThrow(
      'broken.hint:1: expected front matter with hint-format: 1',
    );
  });

  it('reports duplicate managed headings, metadata, and sections with line context', () => {
    expect(() => parseDocument(`${emptyDocument()}# Investigations\n`, 'duplicate.hint')).toThrow(
      /duplicate\.hint:\d+: duplicate # Investigations/,
    );

    expect(() =>
      parseDocument(
        document(`
## Thesis T-duplicate-meta: Duplicate metadata
Status: accepted
Status: proposed
Based-on: user:test

### Guidance
Keep one value.

### Rationale
Ambiguous metadata is invalid.
`),
        'duplicate-meta.hint',
      ),
    ).toThrow(/duplicate-meta\.hint:\d+: duplicate metadata Status/);

    expect(() =>
      parseDocument(
        document(`
## Thesis T-duplicate-section: Duplicate section
Status: accepted
Based-on: user:test

### Guidance
First.

### Guidance
Second.

### Rationale
Duplicates are ambiguous.
`),
        'duplicate-section.hint',
      ),
    ).toThrow(/duplicate-section\.hint:\d+: duplicate section Guidance/);
  });

  it.each([
    '## Thesis T-: Empty ID suffix',
    '## Thesis T-наставление: Non-ASCII ID',
    '## Thesis T-has space: Space in ID',
    '## Thesis T-no-colon Missing separator',
    '## thesis T-lowercase-kind: Wrong kind case',
  ])('rejects a malformed record heading instead of silently treating it as prose: %s', (heading) => {
    expect(() =>
      parseDocument(
        document(`${heading}
Status: accepted
Based-on: user:test

### Guidance
Guidance.

### Rationale
Rationale.
`),
        'grammar.hint',
      ),
    ).toThrow(/grammar\.hint:\d+: (?:invalid|malformed) record heading/);
  });
});

describe('record validation', () => {
  const diagnosticsFor = (body: string, highQuality = false): string[] => {
    const parsed = parseDocument(document(body));
    return validateDocument(parsed, 'validation.hint', highQuality).map(({ message }) => message);
  };

  it.each([
    ['Hypothesis', 'H-status', 'unknown'],
    ['Iteration', 'I-status', 'supported'],
    ['Thesis', 'T-status', 'open'],
  ])('rejects an invalid %s status', (kind, id, status) => {
    expect(
      diagnosticsFor(`
## ${kind} ${id}: Invalid status
Status: ${status}
`),
    ).toContain(`${id} has invalid Status`);
  });

  it('rejects Notice Status and invalid Result', () => {
    const diagnostics = diagnosticsFor(`
## Notice N-result: Invalid result
Status: completed
Iteration: I-missing
Result: success

### Observation
Something happened.

### Evidence
An observation was recorded.
`);

    expect(diagnostics).toContain('N-result must not have Status');
    expect(diagnostics).toContain('N-result has invalid Result');
  });

  it('reports IDs whose prefix does not match their record kind and duplicate IDs', () => {
    const diagnostics = diagnosticsFor(`
## Thesis H-shared: Wrong prefix
Status: proposed

### Guidance
One.

### Rationale
One.

## Hypothesis H-shared: Duplicate ID
Status: open

### Claim
Claim.

### Check
Check.

### Scope
Scope.

### Finish conditions
Finish.
`);

    expect(diagnostics).toContain('Thesis has wrong ID prefix');
    expect(diagnostics).toContain('duplicate ID H-shared');
  });

  it('reports missing and wrong-kind record references', () => {
    const raw = `---
hint-format: 1
---
# Current theses

## Thesis T-base: Existing thesis
Status: proposed

### Guidance
Guidance.

### Rationale
Rationale.

# Investigations

## Iteration I-wrong-kind: Wrong link kind
Status: open
Hypothesis: T-base

### Action
Act.

## Notice N-missing: Missing iteration
Iteration: I-does-not-exist
Result: unknown

### Observation
Observed.

### Evidence
Evidence.

# Historical theses
`;
    const diagnostics = validateDocument(parseDocument(raw), 'refs.hint', false).map(
      ({ message }) => message,
    );

    expect(diagnostics).toContain('I-wrong-kind Hypothesis must reference Hypothesis');
    expect(diagnostics).toContain('N-missing has missing Iteration I-does-not-exist');
  });

  it('reports dangling Based-on and supersession references', () => {
    const diagnostics = diagnosticsFor(`
## Thesis T-dangling: Dangling links
Status: accepted
Based-on: N-missing
Supersedes: T-missing

### Guidance
Guidance.

### Rationale
Rationale.
`);

    expect(diagnostics).toContain('T-dangling has missing Supersedes T-missing');
    expect(diagnostics).toContain('T-dangling has missing Based-on N-missing');
  });

  it('reports unknown metadata and sections while retaining their content', () => {
    const raw = document(`
## Thesis T-extension: User-authored extension
Status: accepted
Based-on: user:test
Owner: platform

### Guidance
Keep it.

### Rationale
It matters.

### Local notes
Do not discard this manual note.
`);
    const parsed = parseDocument(raw);
    const diagnostics = validateDocument(parsed, 'extensions.hint', false).map(
      ({ message }) => message,
    );

    expect(parsed.records[0]?.metadata.Owner).toBe('platform');
    expect(parsed.records[0]?.sections['Local notes']).toBe('Do not discard this manual note.');
    expect(diagnostics).toContain('T-extension has unknown metadata Owner');
    expect(diagnostics).toContain('T-extension has unknown section Local notes');
  });

  it('requires all record-specific fields and enforces thesis placement', () => {
    const raw = `---
hint-format: 1
---
# Current theses

## Thesis T-old: Historical status in current section
Status: superseded

# Investigations

## Hypothesis H-empty: Missing sections
Status: open

## Iteration I-ambiguous: Both linked and inline
Status: open
Hypothesis: H-empty

### Claim
Claim.

### Check
Check.

# Historical theses

## Thesis T-current: Current status in history
Status: proposed
`;
    const diagnostics = validateDocument(parseDocument(raw), 'required.hint', false).map(
      ({ message }) => message,
    );

    expect(diagnostics).toContain('H-empty requires ### Claim');
    expect(diagnostics).toContain('H-empty requires ### Finish conditions');
    expect(diagnostics).toContain('I-ambiguous requires ### Action');
    expect(diagnostics).toContain('I-ambiguous needs either Hypothesis or inline Claim and Check');
    expect(diagnostics).toContain('T-old is in the wrong thesis section');
    expect(diagnostics).toContain('T-current is in the wrong thesis section');
  });

  it('canonicalizes metadata and section order without changing Markdown bodies', () => {
    const record: HintRecord = {
      ...acceptedThesis,
      metadata: { Zebra: 'last', Status: 'accepted', 'Based-on': 'user:test', Alpha: 'first' },
      sections: { Rationale: 'Why.\n\n- one\n- two', Guidance: '**Do** this.' },
    };

    expect(canonicalRecord(record)).toBe(`## Thesis T-request-id: Match completion by request identity
Alpha: first
Based-on: user:test
Status: accepted
Zebra: last

### Guidance
**Do** this.

### Rationale
Why.

- one
- two
`);
  });
});

describe('manual-edit preservation', () => {
  it('keeps unknown top-level sections and surrounding prose when inserting a record', () => {
    const raw = `---
hint-format: 1
---
# Project notes

This manually edited introduction stays byte-for-byte.

# Current theses

# Investigations

<!-- investigation footer -->

# Historical theses

# Appendix

Free-form appendix.
`;
    const hypothesis: HintRecord = {
      kind: 'Hypothesis',
      id: 'H-new',
      title: 'A new hypothesis',
      metadata: { Status: 'open' },
      sections: {
        Claim: 'Claim.',
        Check: 'Check.',
        Scope: 'Scope.',
        'Finish conditions': 'Finish.',
      },
    };

    const updated = insertRecord(raw, hypothesis);
    expect(updated).toContain('# Project notes\n\nThis manually edited introduction stays byte-for-byte.');
    expect(updated).toContain('<!-- investigation footer -->');
    expect(updated).toContain('# Appendix\n\nFree-form appendix.');
    expect(parseDocument(updated).records.map(({ id }) => id)).toEqual(['H-new']);
  });

  it('replaces only the selected record and preserves unknown metadata and sections supplied by a manual edit', () => {
    const raw = document(`
## Thesis T-first: Before edit
Status: accepted
Based-on: user:test
Owner: platform

### Guidance
Old guidance.

### Rationale
Stable rationale.

### Local notes
Keep this note.

## Thesis T-second: Unrelated record
Status: proposed

### Guidance
Do not touch.

### Rationale
It is unrelated.
`);
    const parsed = parseDocument(raw);
    const first = parsed.records[0];
    if (!first) throw new Error('fixture did not produce T-first');

    const updated = replaceRecord(raw, first, {
      ...first,
      title: 'After edit',
      sections: { ...first.sections, Guidance: 'New guidance.' },
    });
    const records = parseDocument(updated).records;

    expect(records[0]).toMatchObject({
      id: 'T-first',
      title: 'After edit',
      metadata: { Owner: 'platform' },
      sections: { Guidance: 'New guidance.', 'Local notes': 'Keep this note.' },
    });
    expect(records[1]).toMatchObject({
      id: 'T-second',
      title: 'Unrelated record',
      sections: { Guidance: 'Do not touch.' },
    });
  });

  it('removes only the requested record and leaves later records and manual sections intact', () => {
    const raw = `${document(`
## Thesis T-remove: Remove me
Status: proposed

### Guidance
Temporary.

### Rationale
Temporary.

## Thesis T-keep: Keep me
Status: proposed

### Guidance
Persistent.

### Rationale
Persistent.
`)}# Manual appendix

Hand-authored content.
`;
    const removed = removeRecord(raw, 'T-remove');

    expect(removed.record.id).toBe('T-remove');
    expect(parseDocument(removed.raw).records.map(({ id }) => id)).toEqual(['T-keep']);
    expect(removed.raw).toContain('# Manual appendix\n\nHand-authored content.');
  });
});
