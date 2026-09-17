import { readFile, lstat, readlink, realpath } from 'node:fs/promises';
import Path from 'node:path';
import { createHash } from 'node:crypto';
import type { Diagnostic, HintRecord } from './records.js';

const fingerprintLine = /^- (.+): sha256:([a-f0-9]{64})$/;
const requiredCriterionLine = /^- \[ \] (C-[A-Za-z0-9][A-Za-z0-9._-]*): (.+)$/;
const evidenceCriterionLine = /^- \[([ xX])\] (C-[A-Za-z0-9][A-Za-z0-9._-]*): (pass|fail|unknown)(?:\s+[-—]\s+.+)?$/i;
const legacyRequiredCriterionLine = /^- \[ \] (.+)$/;
const legacyEvidenceCriterionLine = /^- \[([ xX])\] (.+): (pass|fail|unknown)$/i;

function criterionKey(value: string): string {
  return `description:${value.trim().replaceAll(/\s+/g, ' ').toLowerCase()}`;
}

function requiredCriterion(line: string): { key: string; label: string } | undefined {
  const identified = requiredCriterionLine.exec(line);
  if (identified?.[1]) return { key: identified[1], label: identified[1] };
  const legacy = legacyRequiredCriterionLine.exec(line);
  return legacy?.[1] ? { key: criterionKey(legacy[1]), label: legacy[1].trim() } : undefined;
}

function criterionEvidence(
  line: string,
): { key: string; label: string; checked: boolean; result: string } | undefined {
  const identified = evidenceCriterionLine.exec(line);
  if (identified?.[2] && identified[3]) {
    return {
      key: identified[2],
      label: identified[2],
      checked: identified[1]?.toLowerCase() === 'x',
      result: identified[3].toLowerCase(),
    };
  }
  const legacy = legacyEvidenceCriterionLine.exec(line);
  return legacy?.[2] && legacy[3]
    ? {
        key: criterionKey(legacy[2]),
        label: legacy[2].trim(),
        checked: legacy[1]?.toLowerCase() === 'x',
        result: legacy[3].toLowerCase(),
      }
    : undefined;
}

function inside(root: string, candidate: string): boolean {
  const relative = Path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${Path.sep}`) && relative !== '..' && !Path.isAbsolute(relative));
}

export async function fingerprint(path: string, root: string): Promise<string> {
  const absolute = Path.resolve(root, path);
  if (!inside(root, absolute)) throw new Error('path escapes project root');
  const info = await lstat(absolute);
  let bytes: Buffer;
  if (info.isSymbolicLink()) {
    const link = await readlink(absolute);
    const resolved = await realpath(absolute);
    if (!inside(await realpath(root), resolved)) throw new Error('symlink escapes project root');
    bytes = Buffer.concat([Buffer.from(`symlink\0${link}\0`), await readFile(absolute)]);
  } else {
    bytes = await readFile(absolute);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

export async function validateFingerprints(record: HintRecord, root: string, file: string): Promise<Diagnostic[]> {
  const body = record.sections.Fingerprints;
  if (!body) return [];
  const diagnostics = fingerprintStructureDiagnostics(record, file);
  const seen = new Set<string>();
  for (const line of body.split('\n').filter((item) => item.trim())) {
    const match = fingerprintLine.exec(line.trim());
    if (!match?.[1] || !match[2]) continue;
    const relative = match[1].replaceAll('\\', '/');
    if (seen.has(relative)) continue;
    seen.add(relative);
    try {
      const actual = await fingerprint(relative, root);
      if (actual !== match[2]) {
        diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} fingerprint is stale for ${relative}` });
      }
    } catch {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} fingerprint is unavailable for ${relative}` });
    }
  }
  return diagnostics;
}

export function fingerprintStructureDiagnostics(record: HintRecord, file: string): Diagnostic[] {
  const body = record.sections.Fingerprints;
  if (!body) return [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const line of body.split('\n').filter((item) => item.trim())) {
    const match = fingerprintLine.exec(line.trim());
    if (!match?.[1] || !match[2]) {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} has invalid fingerprint row` });
      continue;
    }
    const relative = match[1].replaceAll('\\', '/');
    if (seen.has(relative)) {
      diagnostics.push({ file, line: record.line ?? 1, message: `${record.id} repeats fingerprint path ${relative}` });
      continue;
    }
    seen.add(relative);
  }
  return diagnostics;
}

export function criterionDiagnostics(
  iteration: HintRecord,
  notice: HintRecord,
  file: string,
  options: { requireComplete?: boolean } = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const required = new Map<string, string>();
  for (const line of (iteration.sections['Required criteria'] ?? '').split('\n').filter((item) => item.trim())) {
    const parsed = requiredCriterion(line.trim());
    if (!parsed) {
      diagnostics.push({ file, line: iteration.line ?? 1, message: `${iteration.id} has invalid required criterion row` });
      continue;
    }
    if (required.has(parsed.key)) {
      diagnostics.push({ file, line: iteration.line ?? 1, message: `${iteration.id} repeats required criterion ${parsed.label}` });
    }
    required.set(parsed.key, parsed.label);
  }

  const evidence = new Map<string, { checked: boolean; result: string }>();
  for (const line of (notice.sections.Evidence ?? '').split('\n').filter((item) => item.trim())) {
    const parsed = criterionEvidence(line.trim());
    if (!parsed) {
      diagnostics.push({ file, line: notice.line ?? 1, message: `${notice.id} has invalid criterion evidence row` });
      continue;
    }
    if (evidence.has(parsed.key)) {
      diagnostics.push({ file, line: notice.line ?? 1, message: `${notice.id} repeats criterion evidence ${parsed.label}` });
      continue;
    }
    if (!required.has(parsed.key)) {
      diagnostics.push({ file, line: notice.line ?? 1, message: `${notice.id} has evidence for unknown criterion ${parsed.label}` });
    }
    evidence.set(parsed.key, { checked: parsed.checked, result: parsed.result });
  }
  if (options.requireComplete !== false) {
    for (const [key, label] of required) {
      if (!evidence.has(key)) {
        diagnostics.push({ file, line: notice.line ?? 1, message: `${notice.id} has no evidence for required criterion ${label}` });
      }
    }
  }
  return diagnostics;
}

function criteriaPassed(iteration: HintRecord | undefined, notice: HintRecord | undefined): boolean {
  if (!iteration || !notice) return false;
  if (criterionDiagnostics(iteration, notice, notice.source ?? '<quality>').length > 0) return false;
  const rows = (notice.sections.Evidence ?? '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => criterionEvidence(line.trim()));
  return rows.length > 0 && rows.every((row) => row?.checked && row.result === 'pass');
}

export function latestCompletedNotice(records: HintRecord[], hypothesisId: string): HintRecord | undefined {
  const iterations = records.filter(
    (record) => record.kind === 'Iteration' && record.metadata.Hypothesis === hypothesisId,
  );
  return iterations
    .filter((record) => record.metadata.Status === 'completed')
    .map((iteration) => records.find((record) => record.kind === 'Notice' && record.metadata.Iteration === iteration.id))
    .filter((record): record is HintRecord => Boolean(record))
    .at(-1);
}

export interface QualityState {
  attempts: number;
  completed: boolean;
  blocked: boolean;
  limitReached: boolean;
  stagnated: boolean;
  abandoned: boolean;
}

export function qualityState(
  records: HintRecord[],
  hypothesisId: string,
  options: { currentEvidenceValid?: boolean } = {},
): QualityState {
  const iterations = records.filter(
    (record) => record.kind === 'Iteration' && record.metadata.Hypothesis === hypothesisId,
  );
  const completed = iterations.filter((record) => record.metadata.Status === 'completed');
  const notices = completed
    .map((iteration) => records.find((record) => record.kind === 'Notice' && record.metadata.Iteration === iteration.id))
    .filter((record): record is HintRecord => Boolean(record));
  const latest = notices.at(-1);
  const latestCompletedIteration = latest
    ? completed.find((iteration) => iteration.id === latest.metadata.Iteration)
    : undefined;
  const shortcomings = latest?.sections['Known shortcomings']?.trim() ?? '';
  const criteriaPass = criteriaPassed(latestCompletedIteration, latest);
  const pass =
    latest?.metadata.Result === 'pass' &&
    Number(latest.metadata.Score) >= 8 &&
    shortcomings.toLowerCase() === 'none' &&
    criteriaPass &&
    options.currentEvidenceValid !== false;
  const signatures = notices.map((notice) =>
    JSON.stringify([
      notice.metadata.Result,
      notice.sections.Observation,
      notice.sections.Evidence,
      notice.sections.Fingerprints,
    ]),
  );
  const stagnated = signatures.length >= 2 && new Set(signatures.slice(-2)).size === 1;
  const hypothesis = records.find((record) => record.id === hypothesisId);
  const latestIteration = iterations.at(-1);
  const pending = latestIteration?.metadata.Status === 'open';
  const abandoned = hypothesis?.metadata.Status === 'abandoned' || latestIteration?.metadata.Status === 'abandoned';
  const blocked = !abandoned && latestIteration?.metadata.Status === 'blocked';
  const successful = !pending && !abandoned && !blocked && pass;
  const isStagnated = !abandoned && !blocked && !successful && stagnated;
  const limitReached = !abandoned && !blocked && !successful && !isStagnated && completed.length >= 10;
  return {
    attempts: completed.length,
    completed: successful,
    blocked,
    limitReached,
    stagnated: isStagnated,
    abandoned,
  };
}

export async function evaluateQuality(
  records: HintRecord[],
  hypothesisId: string,
  root: string,
): Promise<{ state: QualityState; diagnostics: Diagnostic[]; notice?: HintRecord }> {
  const notice = latestCompletedNotice(records, hypothesisId);
  if (!notice) return { state: qualityState(records, hypothesisId, { currentEvidenceValid: false }), diagnostics: [] };
  const diagnostics = await validateFingerprints(notice, root, notice.source ?? '<quality>');
  return {
    state: qualityState(records, hypothesisId, {
      currentEvidenceValid: Boolean(notice.sections.Fingerprints?.trim()) && diagnostics.length === 0,
    }),
    diagnostics,
    notice,
  };
}
