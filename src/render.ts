import Path from 'node:path';
import type { HintRecord } from './records.js';
import { isOpenRecord } from './records.js';
import { renderRecord } from './markdown.js';

export interface SourcedRecord extends HintRecord {
  source: string;
}

export function deduplicate(records: SourcedRecord[]): SourcedRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.source}\0${record.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectRecords(
  records: SourcedRecord[],
  mode: 'current' | 'history' | 'open',
): SourcedRecord[] {
  if (mode === 'history') return records;
  if (mode === 'open') return records.filter(isOpenRecord);
  return records.filter(
    (record) => record.kind === 'Thesis' && record.metadata.Status === 'accepted',
  );
}

export function renderCurrent(records: SourcedRecord[], cwd: string): string {
  if (records.length === 0) return 'No active theses.';
  return records
    .map((record) => {
      const rationale = record.sections.Rationale?.trim() ?? '';
      const basis = record.metadata['Based-on'] ?? 'unknown';
      return [
        `## ${record.id}: ${record.title}`,
        record.sections.Guidance?.trim() ?? '',
        '',
        `Rationale: ${rationale}`,
        `Based on: ${basis}`,
        `Source: ${Path.relative(cwd, record.source) || record.source}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function renderExpanded(records: SourcedRecord[], cwd: string): string {
  if (records.length === 0) return 'No matching records.';
  return records
    .map((record) => `Source: ${Path.relative(cwd, record.source) || record.source}\n\n${renderRecord(record).trimEnd()}`)
    .join('\n\n---\n\n');
}

export function jsonEnvelope(
  data: unknown,
  workflow: unknown = {},
  nextAction: string | null = null,
  warnings: string[] = [],
): { data: unknown; workflow: unknown; next_action: string | null; warnings: string[] } {
  return { data, workflow, next_action: nextAction, warnings };
}
