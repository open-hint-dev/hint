import { randomBytes } from 'node:crypto';
import Path from 'node:path';
import { validationError } from './errors.js';
import {
  canonicalRecord,
  emptyDocument,
  insertRecord,
  moveRecord,
  parseDocument,
  renderRecord,
  replaceRecord,
  validateDocument,
} from './markdown.js';
import type { HintRecord, ParsedRecord, RecordKind } from './records.js';
import { qualityState } from './quality.js';

export function createId(kind: RecordKind): string {
  return `${kind[0]}-${randomBytes(6).toString('hex')}`;
}

const transitions: Partial<Record<RecordKind, Record<string, readonly string[]>>> = {
  Hypothesis: { open: ['open', 'supported', 'refuted', 'inconclusive', 'abandoned'] },
  Iteration: { open: ['open', 'completed', 'blocked', 'abandoned'] },
  Thesis: {
    proposed: ['proposed', 'accepted', 'withdrawn'],
    accepted: ['accepted', 'superseded', 'withdrawn'],
    superseded: ['superseded'],
    withdrawn: ['withdrawn'],
  },
};

function assertTransition(before: ParsedRecord, after: HintRecord, expectedRevision?: string): void {
  if (before.kind !== after.kind) throw validationError(`cannot change kind of ${before.id}`);
  if (before.id !== after.id) throw validationError(`cannot change ID ${before.id}`);
  if (before.kind === 'Notice') {
    if (!expectedRevision && canonicalRecord(before) !== canonicalRecord(after)) {
      throw validationError(`updating Notice ${before.id} requires --expected-revision`);
    }
    return;
  }
  const from = before.metadata.Status ?? '';
  const to = after.metadata.Status ?? '';
  if (!(transitions[before.kind]?.[from] ?? []).includes(to)) {
    throw validationError(`invalid ${before.kind} transition ${from} -> ${to}`);
  }
  if (from === to && canonicalRecord(before) !== canonicalRecord(after) && !expectedRevision) {
    throw validationError(`editing ${before.id} requires --expected-revision`);
  }
}

function mergeRecord(existing: ParsedRecord, payload: HintRecord): HintRecord {
  return {
    kind: existing.kind,
    id: existing.id,
    title: payload.title || existing.title,
    metadata: { ...existing.metadata, ...payload.metadata },
    sections: { ...existing.sections, ...payload.sections },
  };
}

function checkOne(raw: string, highQuality: boolean, visibleRecords: HintRecord[]): void {
  const parsed = parseDocument(raw);
  const diagnostics = validateDocument(parsed, '<updated>', highQuality, [...visibleRecords, ...parsed.records]).filter(
    (item) => !/ has unknown (?:metadata|section) /.test(item.message),
  );
  if (diagnostics.length > 0) throw validationError(diagnostics[0]?.message ?? 'invalid HINT document');
}

export interface MutationOptions {
  expectedRevision?: string;
  highQuality: boolean;
  supersedes?: string;
  visibleRecords?: HintRecord[];
}

export function mutateDocument(
  raw: string | undefined,
  payload: HintRecord,
  options: MutationOptions,
): { raw: string; record: HintRecord; next: string } {
  let updated = raw ?? emptyDocument();
  const document = parseDocument(updated);
  const existing = document.records.find((record) => record.id === payload.id);
  const existingSupersession = existing?.kind === 'Thesis' ? existing.metadata.Supersedes : undefined;
  let record = payload;
  if (existing) {
    record = mergeRecord(existing, payload);
    if (canonicalRecord(existing) === canonicalRecord(record)) {
      return { raw: updated, record, next: nextAction(record, document.records, options.highQuality) };
    }
    assertTransition(existing, record, options.expectedRevision);
    const becomesHistorical =
      record.kind === 'Thesis' && ['superseded', 'withdrawn'].includes(record.metadata.Status ?? '');
    if (becomesHistorical && existing.container !== 'Historical theses') {
      updated = replaceRecord(updated, existing, record);
      updated = moveRecord(updated, existing.id, 'Historical theses');
    } else {
      updated = replaceRecord(updated, existing, record);
    }
  } else {
    updated = insertRecord(updated, record);
  }

  if (record.kind === 'Notice' && record.metadata.Iteration) {
    const parsed = parseDocument(updated);
    const iteration = parsed.records.find((item) => item.id === record.metadata.Iteration);
    if (iteration?.kind === 'Iteration' && iteration.metadata.Status === 'open') {
      const terminalStatus = ['blocked', 'abandoned'].includes(record.metadata.Result ?? '')
        ? record.metadata.Result
        : 'completed';
      const completed: HintRecord = {
        ...iteration,
        metadata: { ...iteration.metadata, Status: terminalStatus ?? 'completed' },
      };
      updated = replaceRecord(updated, iteration, completed);
    }
  }

  const supersedes = options.supersedes ?? record.metadata.Supersedes;
  const priorSuperseded = supersedes
    ? document.records.find((item) => item.id === supersedes && item.kind === 'Thesis')
    : undefined;
  const supersessionAlreadyEstablished = Boolean(
    existing &&
    existingSupersession === supersedes &&
    priorSuperseded?.metadata.Status === 'superseded' &&
    priorSuperseded.metadata['Superseded-by'] === existing.id,
  );
  if (record.kind === 'Thesis' && supersedes && !supersessionAlreadyEstablished) {
    if (record.metadata.Status !== 'accepted') throw validationError('only an accepted Thesis can supersede');
    const current = parseDocument(updated).records.find((item) => item.id === supersedes);
    if (!current || current.kind !== 'Thesis') throw validationError(`Thesis ${supersedes} not found in the same file`);
    if (current.metadata.Status !== 'accepted') throw validationError(`Thesis ${supersedes} is not accepted`);
    const historical: HintRecord = {
      kind: current.kind,
      id: current.id,
      title: current.title,
      metadata: { ...current.metadata, Status: 'superseded', 'Superseded-by': record.id },
      sections: current.sections,
    };
    updated = replaceRecord(updated, current, historical);
    updated = moveRecord(updated, current.id, 'Historical theses');
  }

  checkOne(updated, options.highQuality, options.visibleRecords ?? []);
  const final = parseDocument(updated).records.find((item) => item.id === record.id) ?? record;
  return { raw: updated, record: final, next: nextAction(final, parseDocument(updated).records, options.highQuality) };
}

export function nextAction(record: HintRecord, records: HintRecord[], highQuality: boolean): string {
  if (record.kind === 'Hypothesis') {
    const status = record.metadata.Status;
    if (status === 'open') return `Start an Iteration linked to ${record.id} and run its discriminating check.`;
    if (status === 'abandoned') return 'Stop this cycle and report that it was abandoned.';
    const notices = records.filter((item) => item.kind === 'Notice').map((item) => item.id);
    return notices.length > 0
      ? `Record a durable Thesis based on the relevant Notice, or stop if there is no reusable guidance.`
      : 'Record the evidence that supports this verdict before deriving guidance.';
  }
  if (record.kind === 'Iteration') {
    const status = record.metadata.Status;
    if (status === 'open') return `Perform ${record.id}, then record a Notice with the observed result and evidence.`;
    if (status === 'blocked') return 'Stop and report the blocker; do not call the task complete.';
    if (status === 'abandoned') return 'Stop this iteration and preserve the abandonment reason.';
    return `Record the Notice produced by ${record.id}.`;
  }
  if (record.kind === 'Notice') {
    const iteration = records.find((item) => item.id === record.metadata.Iteration);
    const hypothesis = records.find((item) => item.id === iteration?.metadata.Hypothesis);
    if (highQuality && hypothesis) {
      const state = qualityState(records, hypothesis.id);
      if (state.abandoned) return 'Stop and report that the quality cycle was abandoned.';
      if (state.blocked) return 'Stop and report the blocker; do not call the task complete.';
      if (state.stagnated) return 'Stop and report stagnation; repeated unchanged attempts are not success.';
      if (state.limitReached) return 'Stop and report that the ten-attempt limit was reached.';
      if (state.completed) return `Assess ${hypothesis.id}, record the verdict, then derive a Thesis if the lesson is reusable.`;
      const priorCompletedThesis = records.find((item) => {
        if (
          item.kind !== 'Thesis' ||
          item.metadata.Status !== 'accepted' ||
          item.metadata['Task-outcome'] !== 'completed'
        ) return false;
        const basis = records.find((candidate) => candidate.id === item.metadata['Based-on']);
        const basisIteration = basis?.kind === 'Notice'
          ? records.find((candidate) => candidate.id === basis.metadata.Iteration)
          : undefined;
        return basisIteration?.kind === 'Iteration' && basisIteration.metadata.Hypothesis === hypothesis.id;
      });
      if (priorCompletedThesis) {
        return `Revisit ${priorCompletedThesis.id}; the latest evidence no longer confirms its completed outcome.`;
      }
    }
    if (record.metadata.Result === 'error') return 'Fix the check or create a different Iteration; this Notice is not evidence for a verdict.';
    if (record.metadata.Result === 'pass') return hypothesis ? `Assess ${hypothesis.id} against this evidence.` : 'Form a scoped Hypothesis from this observation, or cite explicit authority for a Thesis.';
    return 'Choose a materially different check or report the blocker; do not call the task complete.';
  }
  const status = record.metadata.Status;
  if (status === 'proposed') return `Accept ${record.id} only after its basis, rationale, and guidance are complete; otherwise withdraw it.`;
  if (status === 'accepted') return 'Apply this guidance to the in-scope task and finish only after that task\'s criteria pass.';
  return `This Thesis is ${status}; use current accepted guidance instead.`;
}

export function preparation(kind: RecordKind, destination: string, currentRevision: string, highQuality: boolean): string {
  const id = `${kind[0]}-<id>`;
  const templates: Record<RecordKind, string> = {
    Hypothesis: `## Hypothesis ${id}: <title>\nStatus: open\n\n### Claim\n<testable claim>\n\n### Check\n<discriminating check>\n\n### Scope\n<bounded scope>\n\n### Finish conditions\n<observable stop condition>`,
    Iteration: `## Iteration ${id}: <title>\nStatus: open\nHypothesis: H-<id>${highQuality ? '\nAttempt: 1' : ''}\n\n### Action\n<one bounded action>${highQuality ? '\n\n### Goal\n<goal>\n\n### Required criteria\n- [ ] C-<id>: <criterion>\n\n### Verification\n- C-<id>: <method>\n\n### Score rubric\n<what 0 and 10 mean>' : ''}`,
    Notice: `## Notice ${id}: <title>\nIteration: I-<id>\nResult: <pass|fail|unknown|error|blocked|abandoned>${highQuality ? '\nAttempt: 1\nScore: <0-10>\nScope: <unchanged scope>' : ''}\n\n### Observation\n<what happened>\n\n### Evidence\n${highQuality ? '- [ ] C-<id>: <pass|fail|unknown> — <command/result>' : '<path, command, and result>'}${highQuality ? '\n\n### Known shortcomings\n<none or material gaps>\n\n### Fingerprints\n- <root-relative-path>: sha256:<working-bytes-hash>' : ''}`,
    Thesis: `## Thesis ${id}: <title>\nStatus: proposed\nBased-on: <N-id|user:decision>${highQuality ? '\nTask-outcome: <completed|blocked|limit-reached|stagnated|abandoned|unsuccessful|not-applicable>' : ''}\n\n### Guidance\n<reusable guidance>\n\n### Rationale\n<why the basis supports it>\n\n### Revisit when\n<condition>`,
  };
  return [`Destination: ${Path.resolve(destination)}`, `Revision: ${currentRevision}`, '', templates[kind]].join('\n');
}

export function simpleRecord(
  kind: RecordKind,
  text: string,
  options: { id?: string; basedOn?: string; iteration?: string; target: string },
): HintRecord {
  const id = options.id ?? createId(kind);
  const title = text.replaceAll(/\s+/g, ' ').slice(0, 72);
  if (kind === 'Hypothesis') {
    return {
      kind,
      id,
      title,
      metadata: { Status: 'open' },
      sections: {
        Claim: text,
        Check: 'Define and run a check that can distinguish this claim from alternatives.',
        Scope: options.target,
        'Finish conditions': 'Record a Notice that supports, refutes, or leaves the claim inconclusive.',
      },
    };
  }
  if (kind === 'Notice') {
    if (!options.iteration) throw validationError('notice --text requires --iteration');
    return {
      kind,
      id,
      title,
      metadata: { Iteration: options.iteration, Result: 'unknown' },
      sections: { Observation: text, Evidence: 'Evidence not supplied; result remains unknown.' },
    };
  }
  if (kind === 'Thesis') {
    if (!options.basedOn) throw validationError('thesis --text requires --based-on');
    return {
      kind,
      id,
      title,
      metadata: { Status: 'proposed', 'Based-on': options.basedOn },
      sections: { Guidance: text, Rationale: `Proposed from ${options.basedOn}; review before acceptance.` },
    };
  }
  throw validationError('iteration requires a complete Markdown payload');
}

export function recordOutput(record: HintRecord): string {
  return renderRecord(record).trimEnd();
}
