export const KINDS = ['Hypothesis', 'Iteration', 'Notice', 'Thesis'] as const;
export type RecordKind = (typeof KINDS)[number];

export interface HintRecord {
  kind: RecordKind;
  id: string;
  title: string;
  metadata: Record<string, string>;
  sections: Record<string, string>;
  source?: string;
  line?: number;
}

export interface ParsedRecord extends HintRecord {
  start: number;
  end: number;
  container: 'Current theses' | 'Investigations' | 'Historical theses';
}

export interface ParsedDocument {
  raw: string;
  lines: string[];
  records: ParsedRecord[];
  headings: Partial<Record<ParsedRecord['container'], { start: number; end: number }>>;
}

export interface Diagnostic {
  file: string;
  line: number;
  message: string;
}

export const ID_PREFIX: Record<RecordKind, string> = {
  Hypothesis: 'H',
  Iteration: 'I',
  Notice: 'N',
  Thesis: 'T',
};

export const STATUSES: Partial<Record<RecordKind, readonly string[]>> = {
  Hypothesis: ['open', 'supported', 'refuted', 'inconclusive', 'abandoned'],
  Iteration: ['open', 'completed', 'blocked', 'abandoned'],
  Thesis: ['proposed', 'accepted', 'superseded', 'withdrawn'],
};

export const RESULTS = [
  'pass',
  'fail',
  'unknown',
  'error',
  'blocked',
  'abandoned',
] as const;

export function recordStatus(record: HintRecord): string | undefined {
  return record.metadata.Status;
}

export function isOpenRecord(record: HintRecord): boolean {
  return (
    (record.kind === 'Hypothesis' && recordStatus(record) === 'open') ||
    (record.kind === 'Iteration' && recordStatus(record) === 'open') ||
    (record.kind === 'Thesis' && recordStatus(record) === 'proposed')
  );
}
