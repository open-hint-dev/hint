import { validationError } from './errors.js';
import { criterionDiagnostics, fingerprintStructureDiagnostics } from './quality.js';
import {
  ID_PREFIX,
  KINDS,
  RESULTS,
  STATUSES,
  type Diagnostic,
  type HintRecord,
  type ParsedDocument,
  type ParsedRecord,
  type RecordKind,
} from './records.js';

const CONTAINERS = ['Current theses', 'Investigations', 'Historical theses'] as const;
const recordHeading = /^## (Hypothesis|Iteration|Notice|Thesis) (H|I|N|T)-([A-Za-z0-9][A-Za-z0-9._-]*): (.+)$/;
const metadataLine = /^([A-Za-z][A-Za-z -]*):\s*(.*?)\s*$/;

function structuralLines(lines: string[]): boolean[] {
  const structural = Array.from({ length: lines.length }, () => true);
  let fence: '`' | '~' | undefined;
  let length = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      structural[index] = false;
      if (match && match[1]?.[0] === fence && match[1].length >= length) fence = undefined;
    } else if (match) {
      structural[index] = false;
      fence = match[1]?.[0] as '`' | '~';
      length = match[1]?.length ?? 3;
    }
  }
  return structural;
}

export function emptyDocument(): string {
  return [
    '---',
    'hint-format: 1',
    '---',
    '# Current theses',
    '',
    '# Investigations',
    '',
    '# Historical theses',
    '',
  ].join('\n');
}

export function parseDocument(raw: string, file = '<input>'): ParsedDocument {
  const normalized = raw.replaceAll('\r\n', '\n');
  const lines = normalized.split('\n');
  if (lines[0] !== '---' || lines[1] !== 'hint-format: 1' || lines[2] !== '---') {
    throw validationError(`${file}:1: expected front matter with hint-format: 1`);
  }
  const structural = structuralLines(lines);
  const headings: ParsedDocument['headings'] = {};
  const levelOne: Array<{ name: string; start: number }> = [];
  for (let index = 3; index < lines.length; index += 1) {
    if (!structural[index]) continue;
    const match = /^# ([^#].*)$/.exec(lines[index] ?? '');
    if (match?.[1]) levelOne.push({ name: match[1], start: index });
  }
  for (let index = 0; index < levelOne.length; index += 1) {
    const heading = levelOne[index];
    if (!heading || !CONTAINERS.includes(heading.name as (typeof CONTAINERS)[number])) continue;
    const name = heading.name as (typeof CONTAINERS)[number];
    if (headings[name]) throw validationError(`${file}:${heading.start + 1}: duplicate # ${name}`);
    headings[name] = { start: heading.start, end: levelOne[index + 1]?.start ?? lines.length };
  }

  const starts: Array<{ index: number; match: RegExpExecArray; container: ParsedRecord['container'] }> = [];
  for (const container of CONTAINERS) {
    const range = headings[container];
    if (!range) continue;
    for (let index = range.start + 1; index < range.end; index += 1) {
      if (!structural[index]) continue;
      const line = lines[index] ?? '';
      const match = recordHeading.exec(line);
      if (match) starts.push({ index, match, container });
      else if (/^##\s+(hypothesis|iteration|notice|thesis)\b/i.test(line)) {
        throw validationError(`${file}:${index + 1}: malformed record heading`);
      }
    }
  }
  starts.sort((a, b) => a.index - b.index);
  const records: ParsedRecord[] = [];
  for (let position = 0; position < starts.length; position += 1) {
    const current = starts[position];
    if (!current) continue;
    const containerEnd = headings[current.container]?.end ?? lines.length;
    const next = starts.slice(position + 1).find((candidate) => candidate.container === current.container);
    const end = Math.min(next?.index ?? containerEnd, containerEnd);
    const kind = current.match[1] as RecordKind;
    const id = `${current.match[2] ?? ''}-${current.match[3] ?? ''}`;
    const metadata: Record<string, string> = {};
    const sections: Record<string, string> = {};
    let cursor = current.index + 1;
    while (cursor < end && (lines[cursor] ?? '').trim() === '') cursor += 1;
    while (cursor < end) {
      const match = metadataLine.exec(lines[cursor] ?? '');
      if (!match) break;
      const key = match[1] ?? '';
      if (metadata[key] !== undefined) {
        throw validationError(`${file}:${cursor + 1}: duplicate metadata ${key}`);
      }
      metadata[key] = match[2] ?? '';
      cursor += 1;
    }
    while (cursor < end) {
      if (!structural[cursor]) {
        cursor += 1;
        continue;
      }
      const sectionMatch = /^### ([^#].*)$/.exec(lines[cursor] ?? '');
      if (!sectionMatch?.[1]) {
        cursor += 1;
        continue;
      }
      const name = sectionMatch[1];
      if (sections[name] !== undefined) {
        throw validationError(`${file}:${cursor + 1}: duplicate section ${name}`);
      }
      const bodyStart = cursor + 1;
      cursor = bodyStart;
      while (cursor < end && !(structural[cursor] && /^### [^#]/.test(lines[cursor] ?? ''))) cursor += 1;
      sections[name] = lines.slice(bodyStart, cursor).join('\n').trim();
    }
    records.push({
      kind,
      id,
      title: current.match[4] ?? '',
      metadata,
      sections,
      start: current.index,
      end,
      container: current.container,
      source: file,
      line: current.index + 1,
    });
  }
  return { raw: normalized, lines, records, headings };
}

export function parseRecordFragment(raw: string): HintRecord {
  const wrapped = emptyDocument().replace('# Investigations\n', `# Investigations\n\n${raw.trim()}\n`);
  const parsed = parseDocument(wrapped, '<payload>');
  if (parsed.records.length !== 1) {
    throw validationError('payload must contain exactly one complete ## record');
  }
  const record = parsed.records[0];
  if (!record) throw validationError('payload contains no record');
  return {
    kind: record.kind,
    id: record.id,
    title: record.title,
    metadata: record.metadata,
    sections: record.sections,
  };
}

export function renderRecord(record: HintRecord): string {
  const lines = [`## ${record.kind} ${record.id}: ${record.title}`];
  for (const [key, value] of Object.entries(record.metadata)) lines.push(`${key}: ${value}`);
  for (const [name, body] of Object.entries(record.sections)) {
    lines.push('', `### ${name}`, body.trim());
  }
  return `${lines.join('\n').trim()}\n`;
}

export function canonicalRecord(record: HintRecord): string {
  const metadata = Object.fromEntries(Object.entries(record.metadata).sort(([a], [b]) => a.localeCompare(b)));
  const sections = Object.fromEntries(Object.entries(record.sections).sort(([a], [b]) => a.localeCompare(b)));
  return renderRecord({ ...record, metadata, sections });
}

function required(record: HintRecord, name: string, diagnostics: Diagnostic[], file: string): void {
  if (!record.sections[name]?.trim()) {
    diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} requires ### ${name}` });
  }
}

export function validateDocument(
  document: ParsedDocument,
  file: string,
  highQuality: boolean,
  visibleRecords: HintRecord[] = document.records,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ids = new Map<string, HintRecord>();
  for (const record of document.records) {
    if (ids.has(record.id)) {
      diagnostics.push({ file, line: record.line ?? 1, message: `duplicate ID ${record.id}` });
    }
    ids.set(record.id, record);
    if (`${ID_PREFIX[record.kind]}-` !== record.id.slice(0, 2)) {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.kind} has wrong ID prefix` });
    }
    const allowedMetadata: Record<RecordKind, readonly string[]> = {
      Hypothesis: ['Status', 'Based-on'],
      Iteration: ['Status', 'Hypothesis', 'Attempt', 'Criteria-change-reason'],
      Notice: ['Iteration', 'Result', 'Attempt', 'Score', 'Scope'],
      Thesis: ['Status', 'Based-on', 'Supersedes', 'Superseded-by', 'Task-outcome'],
    };
    const allowedSections: Record<RecordKind, readonly string[]> = {
      Hypothesis: ['Claim', 'Check', 'Scope', 'Finish conditions', 'Conclusion', 'Reason'],
      Iteration: ['Action', 'Claim', 'Check', 'Goal', 'Required criteria', 'Verification', 'Score rubric', 'Reason'],
      Notice: ['Observation', 'Evidence', 'Known shortcomings', 'Fingerprints'],
      Thesis: ['Guidance', 'Rationale', 'Revisit when'],
    };
    for (const name of Object.keys(record.metadata)) {
      if (!allowedMetadata[record.kind].includes(name)) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has unknown metadata ${name}` });
      }
    }
    for (const name of Object.keys(record.sections)) {
      if (!allowedSections[record.kind].includes(name)) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has unknown section ${name}` });
      }
    }
    const allowed = STATUSES[record.kind];
    if (allowed && !allowed.includes(record.metadata.Status ?? '')) {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has invalid Status` });
    }
    if (record.kind === 'Notice') {
      if (record.metadata.Status !== undefined) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} must not have Status` });
      }
      if (!RESULTS.includes(record.metadata.Result as (typeof RESULTS)[number])) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has invalid Result` });
      }
      required(record, 'Observation', diagnostics, file);
      required(record, 'Evidence', diagnostics, file);
    }
    if (record.kind === 'Hypothesis') {
      for (const section of ['Claim', 'Check', 'Scope', 'Finish conditions']) required(record, section, diagnostics, file);
    }
    if (record.kind === 'Iteration') {
      required(record, 'Action', diagnostics, file);
      const linked = Boolean(record.metadata.Hypothesis);
      const inline = Boolean(record.sections.Claim?.trim() && record.sections.Check?.trim());
      if (linked === inline) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} needs either Hypothesis or inline Claim and Check` });
      }
      if (highQuality && inline) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} must link a Hypothesis in high-quality mode` });
      }
      if (highQuality) {
        for (const section of ['Goal', 'Required criteria', 'Verification', 'Score rubric']) required(record, section, diagnostics, file);
        if (!/^[1-9][0-9]*$/.test(record.metadata.Attempt ?? '')) {
          diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} requires a positive Attempt` });
        }
      }
    }
    if (record.kind === 'Thesis') {
      required(record, 'Guidance', diagnostics, file);
      required(record, 'Rationale', diagnostics, file);
      if (record.metadata.Status === 'accepted' && !record.metadata['Based-on']) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} accepted Thesis requires Based-on` });
      }
      if (highQuality && record.metadata.Status === 'accepted') {
        const outcomes = ['completed', 'blocked', 'limit-reached', 'stagnated', 'abandoned', 'unsuccessful', 'not-applicable'];
        if (!outcomes.includes(record.metadata['Task-outcome'] ?? '')) {
          diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} requires a valid Task-outcome in high-quality mode` });
        }
      }
      const historical = ['superseded', 'withdrawn'].includes(record.metadata.Status ?? '');
      if (historical !== (record.container === 'Historical theses')) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} is in the wrong thesis section` });
      }
    }
    if (highQuality && record.kind === 'Notice') {
      required(record, 'Known shortcomings', diagnostics, file);
      required(record, 'Fingerprints', diagnostics, file);
      if (!/^[1-9][0-9]*$/.test(record.metadata.Attempt ?? '')) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} requires a positive Attempt` });
      }
      const score = Number(record.metadata.Score);
      if (!Number.isInteger(score) || score < 0 || score > 10) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} requires Score from 0 through 10` });
      }
      if (!record.metadata.Scope?.trim()) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} requires Scope` });
      }
      const evidenceRows = record.sections.Evidence?.match(/^- \[[ xX]\].+$/gm) ?? [];
      if (record.metadata.Result === 'pass' && evidenceRows.length === 0) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} pass requires criterion checklist evidence` });
      }
      diagnostics.push(...fingerprintStructureDiagnostics(record, file));
    }
  }

  const visibleById = new Map<string, HintRecord[]>();
  for (const record of visibleRecords) {
    const list = visibleById.get(record.id) ?? [];
    if (!list.some((candidate) => candidate.source === record.source && candidate.id === record.id)) list.push(record);
    visibleById.set(record.id, list);
  }
  for (const record of document.records) {
    if (!visibleById.has(record.id)) visibleById.set(record.id, [record]);
  }
  const expect = (source: HintRecord, field: string, kind: RecordKind, localOnly = false): void => {
    const value = source.metadata[field];
    if (!value) return;
    const targets = localOnly ? (ids.get(value) ? [ids.get(value) as HintRecord] : []) : (visibleById.get(value) ?? []);
    if (targets.length === 0) diagnostics.push({ file, line: source.line ?? 1, message: `${source.id} has missing ${field} ${value}` });
    else if (targets.length > 1) diagnostics.push({ file, line: source.line ?? 1, message: `${source.id} has ambiguous ${field} ${value}` });
    else if (targets[0]?.kind !== kind) diagnostics.push({ file, line: source.line ?? 1, message: `${source.id} ${field} must reference ${kind}` });
  };
  for (const record of document.records) {
    expect(record, 'Hypothesis', 'Hypothesis');
    expect(record, 'Iteration', 'Iteration');
    expect(record, 'Supersedes', 'Thesis', true);
    expect(record, 'Superseded-by', 'Thesis', true);
    const basis = record.metadata['Based-on'];
    if (basis && /^[NHTI]-/.test(basis)) {
      const targets = visibleById.get(basis) ?? [];
      if (targets.length === 0) diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has missing Based-on ${basis}` });
      else if (targets.length > 1) diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has ambiguous Based-on ${basis}` });
    }
  }
  for (const record of document.records.filter((item) => item.kind === 'Iteration')) {
    const notices = document.records.filter((item) => item.kind === 'Notice' && item.metadata.Iteration === record.id);
    const notice = notices[0];
    if (record.metadata.Status === 'completed' && notices.length !== 1) {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} completed Iteration requires exactly one Notice` });
    }
    if (notices.length > 1) {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has more than one Notice` });
    }
    if (notice) {
      const expectedStatus = ['blocked', 'abandoned'].includes(notice.metadata.Result ?? '')
        ? notice.metadata.Result
        : 'completed';
      if (record.metadata.Status !== expectedStatus) {
        diagnostics.push({
          file,
          line: notice.line ?? record.line ?? 1,
          message: `${notice.id} Result ${notice.metadata.Result} requires ${record.id} Status ${expectedStatus}`,
        });
      }
    }
    if (highQuality && record.metadata.Hypothesis) {
      const hypothesis = ids.get(record.metadata.Hypothesis);
      if (notice && hypothesis?.sections.Scope && notice.metadata.Scope !== hypothesis.sections.Scope.trim()) {
        diagnostics.push({ file, line: notice.line ?? record.line ?? 1, message: `${notice.id} Scope differs from ${hypothesis.id}` });
      }
      const siblings = document.records.filter(
        (item) => item.kind === 'Iteration' && item.metadata.Hypothesis === record.metadata.Hypothesis,
      );
      const previous = siblings[siblings.indexOf(record) - 1];
      if (
        previous &&
        previous.sections['Required criteria'] !== record.sections['Required criteria'] &&
        !record.metadata['Criteria-change-reason']?.trim()
      ) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} changed criteria without Criteria-change-reason` });
      }
      const latestCompleted = siblings.filter((item) => item.metadata.Status === 'completed').at(-1);
      if (notice) {
        diagnostics.push(...criterionDiagnostics(record, notice, file, {
          requireComplete: record.id === latestCompleted?.id,
        }));
      }
    }
  }
  if (highQuality) {
    for (const hypothesis of document.records.filter((item) => item.kind === 'Hypothesis')) {
      const iterations = document.records.filter(
        (item) => item.kind === 'Iteration' && item.metadata.Hypothesis === hypothesis.id,
      );
      const attempts = iterations.map((item) => Number(item.metadata.Attempt));
      if (new Set(attempts).size !== attempts.length) {
        diagnostics.push({ file, line: hypothesis.line ?? 1, message: `${hypothesis.id} repeats an Attempt number` });
      }
      const open = iterations.filter((item) => item.metadata.Status === 'open');
      if (open.length > 1) {
        diagnostics.push({ file, line: open[1]?.line ?? hypothesis.line ?? 1, message: `${hypothesis.id} has more than one open Iteration` });
      }
      let consumed = 0;
      for (const iteration of iterations) {
        if (consumed >= 10) {
          diagnostics.push({
            file,
            line: iteration.line ?? hypothesis.line ?? 1,
            message: `${hypothesis.id} reached the ten-attempt limit before ${iteration.id}`,
          });
          break;
        }
        if (iteration.metadata.Status === 'completed') consumed += 1;
      }
      if (iterations.filter((item) => item.metadata.Status === 'completed').length > 10) {
        diagnostics.push({ file, line: hypothesis.line ?? 1, message: `${hypothesis.id} exceeds the ten-attempt limit` });
      }
    }
  }
  for (const record of document.records.filter((item) => item.kind === 'Thesis')) {
    const oldId = record.metadata.Supersedes;
    if (!oldId) continue;
    const old = ids.get(oldId);
    if (old?.metadata['Superseded-by'] !== record.id || old.metadata.Status !== 'superseded') {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} replacement link is not reciprocal` });
    }
  }
  return diagnostics;
}

export function insertRecord(raw: string, record: HintRecord): string {
  const document = parseDocument(raw);
  const container: ParsedRecord['container'] =
    record.kind === 'Thesis'
      ? ['superseded', 'withdrawn'].includes(record.metadata.Status ?? '')
        ? 'Historical theses'
        : 'Current theses'
      : 'Investigations';
  const range = document.headings[container];
  if (!range) throw validationError(`missing # ${container} section`);
  const lines = [...document.lines];
  lines.splice(range.end, 0, '', ...renderRecord(record).trimEnd().split('\n'));
  return lines.join('\n').replace(/\n*$/, '\n');
}

export function replaceRecord(raw: string, current: ParsedRecord, replacement: HintRecord): string {
  const document = parseDocument(raw);
  const found = document.records.find((record) => record.id === current.id);
  if (!found) throw validationError(`record ${current.id} disappeared`);
  const lines = [...document.lines];
  const structural = structuralLines(lines);
  const operations: Array<{ start: number; deleteCount: number; lines: string[] }> = [];
  if (found.kind !== replacement.kind || found.id !== replacement.id) {
    throw validationError(`cannot replace ${found.id} with ${replacement.id}`);
  }
  if (found.title !== replacement.title) {
    operations.push({
      start: found.start,
      deleteCount: 1,
      lines: [`## ${replacement.kind} ${replacement.id}: ${replacement.title}`],
    });
  }

  const metadataPositions = new Map<string, number>();
  let metadataCursor = found.start + 1;
  while (metadataCursor < found.end && (lines[metadataCursor] ?? '').trim() === '') metadataCursor += 1;
  while (metadataCursor < found.end) {
    const match = metadataLine.exec(lines[metadataCursor] ?? '');
    if (!match?.[1]) break;
    metadataPositions.set(match[1], metadataCursor);
    metadataCursor += 1;
  }
  const newMetadata: string[] = [];
  for (const [key, value] of Object.entries(replacement.metadata)) {
    const position = metadataPositions.get(key);
    if (position === undefined) newMetadata.push(`${key}: ${value}`);
    else if (found.metadata[key] !== value) operations.push({ start: position, deleteCount: 1, lines: [`${key}: ${value}`] });
  }
  if (newMetadata.length > 0) operations.push({ start: metadataCursor, deleteCount: 0, lines: newMetadata });

  const sectionRanges = new Map<string, { bodyStart: number; end: number }>();
  const sectionStarts: Array<{ name: string; start: number }> = [];
  for (let index = found.start + 1; index < found.end; index += 1) {
    if (!structural[index]) continue;
    const match = /^### ([^#].*)$/.exec(lines[index] ?? '');
    if (match?.[1]) sectionStarts.push({ name: match[1], start: index });
  }
  for (let index = 0; index < sectionStarts.length; index += 1) {
    const section = sectionStarts[index];
    if (!section) continue;
    sectionRanges.set(section.name, { bodyStart: section.start + 1, end: sectionStarts[index + 1]?.start ?? found.end });
  }
  const newSections: Array<{ name: string; body: string }> = [];
  for (const [name, body] of Object.entries(replacement.sections)) {
    const range = sectionRanges.get(name);
    if (!range) {
      newSections.push({ name, body });
      continue;
    }
    if (found.sections[name] !== body.trim()) {
      operations.push({ start: range.bodyStart, deleteCount: range.end - range.bodyStart, lines: [body.trim(), ''] });
    }
  }
  if (newSections.length > 0) {
    operations.push({
      start: found.end,
      deleteCount: 0,
      lines: newSections.flatMap(({ name, body }) => ['', `### ${name}`, body.trim()]),
    });
  }

  for (const operation of operations.sort((left, right) => right.start - left.start)) {
    lines.splice(operation.start, operation.deleteCount, ...operation.lines);
  }
  return lines.join('\n').replace(/\n*$/, '\n');
}

export function moveRecord(raw: string, id: string, container: ParsedRecord['container']): string {
  const document = parseDocument(raw);
  const record = document.records.find((item) => item.id === id);
  if (!record) throw validationError(`record ${id} not found`);
  if (record.container === container) return raw;
  const lines = [...document.lines];
  const block = lines.splice(record.start, record.end - record.start);
  const without = lines.join('\n').replace(/\n*$/, '\n');
  const destination = parseDocument(without).headings[container];
  if (!destination) throw validationError(`missing # ${container} section`);
  const moved = without.split('\n');
  moved.splice(destination.end, 0, '', ...block);
  return moved.join('\n').replace(/\n*$/, '\n');
}

export function removeRecord(raw: string, id: string): { raw: string; record: ParsedRecord } {
  const document = parseDocument(raw);
  const record = document.records.find((item) => item.id === id);
  if (!record) throw validationError(`record ${id} not found`);
  const lines = [...document.lines];
  lines.splice(record.start, record.end - record.start);
  return { raw: lines.join('\n').replace(/\n*$/, '\n'), record };
}

export function assertKind(value: string): RecordKind {
  const kind = KINDS.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
  if (!kind) throw validationError(`unknown record kind ${value}`);
  return kind;
}
