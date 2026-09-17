import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deduplicate, jsonEnvelope, renderCurrent, renderExpanded, selectRecords, type SourcedRecord } from '../src/render.js';

const source = Path.join(process.cwd(), 'nested', 'file.ts.hint');

const records: SourcedRecord[] = [
  {
    kind: 'Thesis',
    id: 'T-current',
    title: 'Use request identity',
    metadata: { Status: 'accepted', 'Based-on': 'N-race' },
    sections: { Guidance: 'Match by request identity.', Rationale: 'Concurrent routes collide.' },
    source,
  },
  {
    kind: 'Thesis',
    id: 'T-old',
    title: 'Use route',
    metadata: { Status: 'superseded', 'Superseded-by': 'T-current' },
    sections: { Guidance: 'Match by route.', Rationale: 'Only one request was expected.' },
    source,
  },
  {
    kind: 'Hypothesis',
    id: 'H-race',
    title: 'Routes collide',
    metadata: { Status: 'open' },
    sections: { Claim: 'Two requests collide.', Check: 'Complete in reverse.', Scope: 'waiters', 'Finish conditions': 'Observe result.' },
    source,
  },
  {
    kind: 'Iteration',
    id: 'I-done',
    title: 'Past check',
    metadata: { Status: 'completed', Hypothesis: 'H-race' },
    sections: { Action: 'Run it.' },
    source,
  },
  {
    kind: 'Thesis',
    id: 'T-proposed',
    title: 'Candidate guidance',
    metadata: { Status: 'proposed' },
    sections: { Guidance: 'Candidate.', Rationale: 'Under review.' },
    source,
  },
];

function recordAt(index: number): SourcedRecord {
  const record = records[index];
  if (!record) throw new Error(`missing test record ${index}`);
  return record;
}

describe('read selection and rendering', () => {
  it('selects only accepted current Theses for default reads', () => {
    expect(selectRecords(records, 'current').map((record) => record.id)).toEqual(['T-current']);
  });

  it('selects open Hypotheses, open Iterations, and proposed Theses only', () => {
    expect(selectRecords(records, 'open').map((record) => record.id)).toEqual(['H-race', 'T-proposed']);
  });

  it('keeps every record in history, including superseded guidance', () => {
    expect(selectRecords(records, 'history').map((record) => record.id)).toEqual([
      'T-current',
      'T-old',
      'H-race',
      'I-done',
      'T-proposed',
    ]);
  });

  it('deduplicates only the same canonical source and ID', () => {
    const current = recordAt(0);
    const same = { ...current };
    const otherSource = { ...current, source: Path.join(process.cwd(), 'other', '_.hint') };
    const otherId = { ...current, id: 'T-other' };
    expect(deduplicate([current, same, otherSource, otherId])).toEqual([current, otherSource, otherId]);
  });

  it('renders concise current guidance with rationale, basis, and source but no history', () => {
    const output = renderCurrent(selectRecords(records, 'current'), process.cwd());
    expect(output).toContain('Match by request identity.');
    expect(output).toContain('Rationale: Concurrent routes collide.');
    expect(output).toContain('Based on: N-race');
    expect(output).toContain('Source: nested/file.ts.hint');
    expect(output).not.toContain('Match by route.');
    expect(output).not.toContain('H-race');
  });

  it('returns explicit empty messages rather than treating an empty scope as an error', () => {
    expect(renderCurrent([], process.cwd())).toBe('No active theses.');
    expect(renderExpanded([], process.cwd())).toBe('No matching records.');
  });

  it('renders expanded records with their full metadata and source', () => {
    const output = renderExpanded([recordAt(1)], process.cwd());
    expect(output).toContain('Source: nested/file.ts.hint');
    expect(output).toContain('## Thesis T-old: Use route');
    expect(output).toContain('Status: superseded');
    expect(output).toContain('Superseded-by: T-current');
  });

  it('uses the stable JSON envelope without adding mode-specific top-level keys', () => {
    expect(jsonEnvelope({ records: [] }, { high_quality_mode: false }, 'Record an Iteration.', ['legacy config'])).toEqual({
      data: { records: [] },
      workflow: { high_quality_mode: false },
      next_action: 'Record an Iteration.',
      warnings: ['legacy config'],
    });
  });
});
