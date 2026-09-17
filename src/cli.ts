#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { stdin, stdout, stderr } from 'node:process';
import { createRequire } from 'node:module';
import { readConfig } from './config.js';
import { HintError, resolutionError, validationError } from './errors.js';
import { GUIDE } from './guide.js';
import { parseDocument, parseRecordFragment, validateDocument } from './markdown.js';
import { knowledgeFiles, resolveReadTargets, resolveTarget } from './paths.js';
import { evaluateQuality } from './quality.js';
import type { HintRecord, RecordKind } from './records.js';
import { deduplicate, jsonEnvelope, renderCurrent, renderExpanded, selectRecords, type SourcedRecord } from './render.js';
import { readOptional, revision, updateFile } from './storage.js';
import { mutateDocument, preparation, recordOutput, simpleRecord } from './workflow.js';

const packageJson = createRequire(import.meta.url)('../package.json') as { version: string };

const HELP = `HINT — path-scoped research memory

Usage:
  hint <path...> [--history | --open] [--json]
  hint guide [--json]
  hint hypothesis <path> [--text TEXT | --file FILE | --stdin]
  hint iteration <path> [--hypothesis ID] [--file FILE | --stdin]
  hint notice <path> [--iteration ID] [--text TEXT | --file FILE | --stdin]
  hint thesis <path> [--based-on REF] [--supersedes ID] [--file FILE | --stdin]
  hint check <path...> [--json]
  hint --help
  hint --version

Write commands also accept --id ID and --expected-revision SHA256.`;

interface Arguments {
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
}

const booleanOptions = new Set(['help', 'version', 'history', 'open', 'json', 'stdin']);
const valueOptions = new Set([
  'text',
  'file',
  'id',
  'expected-revision',
  'hypothesis',
  'iteration',
  'based-on',
  'supersedes',
]);

function parseArguments(args: string[]): Arguments {
  const result: Arguments = { positional: [], flags: new Set(), values: new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    if (!argument.startsWith('--')) {
      result.positional.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (booleanOptions.has(name)) result.flags.add(name);
    else if (valueOptions.has(name)) {
      const value = args[index + 1];
      if (value === undefined) throw resolutionError(`--${name} requires a value`);
      result.values.set(name, value);
      index += 1;
    } else throw resolutionError(`unknown option --${name}`);
  }
  return result;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
}

async function payload(args: Arguments): Promise<string | undefined> {
  const selected = [args.values.has('text'), args.values.has('file'), args.flags.has('stdin')].filter(Boolean).length;
  if (selected > 1) throw resolutionError('choose exactly one of --text, --file, and --stdin');
  if (args.values.has('file')) return await readFile(Path.resolve(args.values.get('file') ?? ''), 'utf8');
  if (args.flags.has('stdin')) return await readStdin();
  return args.values.get('text');
}

function writeText(value: string): void {
  stdout.write(`${value.replace(/\n*$/, '')}\n`);
}

function writeJson(value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function configFor(root: string): Promise<Awaited<ReturnType<typeof readConfig>>> {
  return await readConfig(root);
}

async function readCommand(args: Arguments): Promise<void> {
  if (args.positional.length === 0) throw resolutionError('at least one path is required');
  if (args.flags.has('history') && args.flags.has('open')) throw resolutionError('--history and --open are mutually exclusive');
  const resolved = await resolveReadTargets(args.positional);
  const records: SourcedRecord[] = [];
  const warnings: string[] = [];
  let highQualityMode = false;
  for (const item of resolved) {
    const config = await configFor(item.target.context.root);
    highQualityMode ||= config.highQualityMode;
    warnings.push(...config.warnings);
    const documents = [];
    for (const file of item.files) {
      const document = parseDocument(await readFile(file, 'utf8'), file);
      const sourced = document.records.map((record) => ({ ...record, source: file }));
      documents.push({ file, document, records: sourced });
    }
    const visible = documents.flatMap((entry) => entry.records);
    for (const entry of documents) {
      const diagnostics = validateDocument(entry.document, entry.file, config.highQualityMode, visible);
      const errors = diagnostics.filter((diagnostic) => !/ has unknown (?:metadata|section) /.test(diagnostic.message));
      warnings.push(...diagnostics.filter((diagnostic) => !errors.includes(diagnostic)).map((diagnostic) => `${diagnostic.file}:${diagnostic.line}: ${diagnostic.message}`));
      if (errors.length > 0) throw validationError(`${errors[0]?.file}:${errors[0]?.line}: ${errors[0]?.message}`);
      records.push(...entry.records);
    }
    if (config.highQualityMode) {
      for (const thesis of visible.filter(
        (record) => record.kind === 'Thesis' && record.metadata.Status === 'accepted' && record.metadata['Task-outcome'] === 'completed',
      )) {
        const basis = visible.find((record) => record.id === thesis.metadata['Based-on']);
        const iteration = basis?.kind === 'Notice'
          ? visible.find((record) => record.id === basis.metadata.Iteration)
          : undefined;
        const hypothesisId = iteration?.kind === 'Iteration' ? iteration.metadata.Hypothesis : undefined;
        const evaluated = hypothesisId
          ? await evaluateQuality(visible, hypothesisId, item.target.context.root)
          : undefined;
        if (!evaluated?.state.completed || evaluated.notice?.id !== basis?.id) {
          warnings.push(
            `${thesis.source}:${thesis.line ?? 1}: ${thesis.id} is not backed by current passing quality evidence`,
          );
        }
      }
    }
  }
  const mode = args.flags.has('history') ? 'history' : args.flags.has('open') ? 'open' : 'current';
  const selected = selectRecords(deduplicate(records), mode);
  if (args.flags.has('json')) {
    writeJson(jsonEnvelope({ mode, records: selected }, { high_quality_mode: highQualityMode }, null, [...new Set(warnings)]));
  } else {
    writeText(mode === 'current' ? renderCurrent(selected, process.cwd()) : renderExpanded(selected, process.cwd()));
    for (const warning of new Set(warnings)) stderr.write(`hint: warning: ${warning}\n`);
  }
}

const commandKinds: Record<string, RecordKind> = {
  hypothesis: 'Hypothesis',
  iteration: 'Iteration',
  notice: 'Notice',
  thesis: 'Thesis',
};

function isHistoricalEvidence(records: SourcedRecord[], noticeId: string): boolean {
  const theses = records.filter(
    (record) => record.kind === 'Thesis' && record.metadata['Based-on'] === noticeId,
  );
  return theses.length > 0 && theses.every((record) =>
    ['superseded', 'withdrawn'].includes(record.metadata.Status ?? ''),
  );
}

async function writeCommand(command: string, args: Arguments): Promise<void> {
  const kind = commandKinds[command];
  if (!kind) throw resolutionError(`unknown command ${command}`);
  if (args.positional.length !== 1) throw resolutionError(`${command} requires exactly one target path`);
  const targetInput = args.positional[0] ?? '';
  const target = await resolveTarget(targetInput, { write: true });
  const config = await configFor(target.context.root);
  const existing = await readOptional(target.destination);
  const visibleRecords: HintRecord[] = [];
  for (const file of (await knowledgeFiles(target)).filter((file) => file !== target.destination)) {
    visibleRecords.push(...parseDocument(await readFile(file, 'utf8'), file).records.map((item) => ({ ...item, source: file })));
  }
  const currentRevision = existing === undefined ? 'missing' : revision(existing);
  const supplied = await payload(args);
  if (supplied === undefined) {
    const data = preparation(kind, target.destination, currentRevision, config.highQualityMode);
    if (args.flags.has('json')) writeJson(jsonEnvelope({ destination: target.destination, revision: currentRevision, template: data }, { high_quality_mode: config.highQualityMode }, null, config.warnings));
    else writeText(data);
    return;
  }

  let record: HintRecord;
  if (args.values.has('text')) {
    const requestedId = args.values.get('id');
    const requestedBasis = args.values.get('based-on');
    const requestedIteration = args.values.get('iteration');
    record = simpleRecord(kind, supplied, {
      ...(requestedId ? { id: requestedId } : {}),
      ...(requestedBasis ? { basedOn: requestedBasis } : {}),
      ...(requestedIteration ? { iteration: requestedIteration } : {}),
      target: targetInput,
    });
  } else {
    record = parseRecordFragment(supplied);
    if (record.kind !== kind) throw validationError(`payload is ${record.kind}, expected ${kind}`);
    const optionId = args.values.get('id');
    if (optionId && optionId !== record.id) throw validationError(`--id ${optionId} contradicts payload ID ${record.id}`);
  }
  const hypothesis = args.values.get('hypothesis');
  const iteration = args.values.get('iteration');
  const basedOn = args.values.get('based-on');
  const supersedes = args.values.get('supersedes');
  if (hypothesis) {
    if (record.metadata.Hypothesis && record.metadata.Hypothesis !== hypothesis) throw validationError('--hypothesis contradicts payload');
    record.metadata.Hypothesis = hypothesis;
  }
  if (iteration) {
    if (record.metadata.Iteration && record.metadata.Iteration !== iteration) throw validationError('--iteration contradicts payload');
    record.metadata.Iteration = iteration;
  }
  if (basedOn) {
    if (record.metadata['Based-on'] && record.metadata['Based-on'] !== basedOn) throw validationError('--based-on contradicts payload');
    record.metadata['Based-on'] = basedOn;
  }
  if (supersedes) {
    if (record.metadata.Supersedes && record.metadata.Supersedes !== supersedes) throw validationError('--supersedes contradicts payload');
    record.metadata.Supersedes = supersedes;
  }

  const result = await updateFile(target.destination, args.values.get('expected-revision'), async (raw) => {
    const expectedRevision = args.values.get('expected-revision');
    const beforeRecord = raw
      ? parseDocument(raw, target.destination).records.find((item) => item.id === record.id)
      : undefined;
    const mutation = mutateDocument(raw, record, {
      ...(expectedRevision ? { expectedRevision } : {}),
      highQuality: config.highQualityMode,
      ...(supersedes ? { supersedes } : {}),
      visibleRecords,
    });
    const acceptsCompleted =
      config.highQualityMode &&
      mutation.record.kind === 'Thesis' &&
      mutation.record.metadata.Status === 'accepted' &&
      mutation.record.metadata['Task-outcome'] === 'completed' &&
      (
        beforeRecord?.metadata.Status !== 'accepted' ||
        beforeRecord.metadata['Task-outcome'] !== 'completed' ||
        beforeRecord.metadata['Based-on'] !== mutation.record.metadata['Based-on']
      );
    if (acceptsCompleted) {
      const parsed = parseDocument(mutation.raw, target.destination);
      const local = parsed.records.map((item) => ({ ...item, source: target.destination }));
      const visible = [...visibleRecords, ...local];
      const basis = visible.find((item) => item.id === mutation.record.metadata['Based-on']);
      const iterationRecord = basis?.kind === 'Notice'
        ? visible.find((item) => item.id === basis.metadata.Iteration)
        : undefined;
      const hypothesisId = iterationRecord?.kind === 'Iteration' ? iterationRecord.metadata.Hypothesis : undefined;
      const evaluated = hypothesisId
        ? await evaluateQuality(visible, hypothesisId, target.context.root)
        : undefined;
      if (!evaluated?.state.completed || evaluated.notice?.id !== basis?.id) {
        const detail = evaluated?.diagnostics[0]?.message ?? 'completed Thesis requires current passing quality evidence';
        throw validationError(`${mutation.record.id} cannot claim completed: ${detail}`);
      }
    }
    return { raw: mutation.raw, value: mutation };
  });
  const response = {
    id: result.value.record.id,
    file: target.destination,
    status: result.value.record.metadata.Status ?? result.value.record.metadata.Result ?? 'recorded',
    revision: result.revision,
    changed: result.changed,
  };
  if (args.flags.has('json')) writeJson(jsonEnvelope(response, { high_quality_mode: config.highQualityMode }, result.value.next, config.warnings));
  else {
    writeText(recordOutput(result.value.record));
    stderr.write(`hint: saved ${response.id} in ${response.file}\nNEXT: ${result.value.next}\n`);
  }
}

async function checkCommand(args: Arguments): Promise<void> {
  if (args.positional.length === 0) throw resolutionError('check requires at least one path');
  const resolved = await resolveReadTargets(args.positional);
  const subjects = new Map<string, { root: string; highQuality: boolean }>();
  const scopes: Array<{ files: string[]; root: string; highQuality: boolean }> = [];
  const warnings: string[] = [];
  for (const item of resolved) {
    const config = await configFor(item.target.context.root);
    warnings.push(...config.warnings);
    for (const file of item.files) subjects.set(file, { root: item.target.context.root, highQuality: config.highQualityMode });
    scopes.push({ files: item.files, root: item.target.context.root, highQuality: config.highQualityMode });
  }
  if (subjects.size === 0) throw resolutionError('check found no HINT files');
  const documents = new Map<string, ReturnType<typeof parseDocument>>();
  const diagnosticMap = new Map<string, { file: string; line: number; message: string }>();
  const qualityMap = new Map<string, unknown>();
  for (const [file] of subjects) {
    try {
      documents.set(file, parseDocument(await readFile(file, 'utf8'), file));
    } catch (error) {
      if (error instanceof HintError) diagnosticMap.set(`${file}\0line1\0${error.message}`, { file, line: 1, message: error.message });
      else throw error;
    }
  }
  for (const scope of scopes) {
    const entries = scope.files.flatMap((file) => {
      const document = documents.get(file);
      return document ? [{ file, document }] : [];
    });
    const visible = entries.flatMap(({ file, document }) =>
      document.records.map((record) => ({ ...record, source: file })),
    );
    for (const { file, document } of entries) {
      for (const diagnostic of validateDocument(document, file, scope.highQuality, visible)) {
        diagnosticMap.set(`${diagnostic.file}\0${diagnostic.line}\0${diagnostic.message}`, diagnostic);
      }
    }
    if (scope.highQuality) {
      for (const hypothesis of visible.filter((item) => item.kind === 'Hypothesis')) {
        const evaluated = await evaluateQuality(visible, hypothesis.id, scope.root);
        const state = evaluated.state;
        if (!evaluated.notice || !isHistoricalEvidence(visible, evaluated.notice.id)) {
          for (const diagnostic of evaluated.diagnostics) {
            diagnosticMap.set(`${diagnostic.file}\0${diagnostic.line}\0${diagnostic.message}`, diagnostic);
          }
        }
        qualityMap.set(`${hypothesis.source}\0${hypothesis.id}`, {
          file: hypothesis.source,
          hypothesis: hypothesis.id,
          ...state,
        });
        for (const thesis of visible.filter(
          (item) =>
            item.kind === 'Thesis' &&
            item.metadata.Status === 'accepted' &&
            item.metadata['Task-outcome'] === 'completed',
        )) {
          const basis = visible.find((item) => item.id === thesis.metadata['Based-on']);
          const iteration = basis?.kind === 'Notice'
            ? visible.find((item) => item.id === basis.metadata.Iteration)
            : undefined;
          if (iteration?.kind === 'Iteration' && iteration.metadata.Hypothesis === hypothesis.id && (
            !state.completed || evaluated.notice?.id !== basis?.id
          )) {
            const message = `${thesis.id} is not backed by current passing quality evidence`;
            diagnosticMap.set(`${thesis.source}\0${thesis.line ?? 1}\0${message}`, {
              file: thesis.source,
              line: thesis.line ?? 1,
              message,
            });
          }
        }
        if (state.stagnated || state.limitReached) {
          const message = state.stagnated
            ? `${hypothesis.id} quality cycle stagnated`
            : `${hypothesis.id} reached the ten-attempt limit without completion`;
          diagnosticMap.set(`${hypothesis.source}\0${hypothesis.line ?? 1}\0${message}`, {
            file: hypothesis.source,
            line: hypothesis.line ?? 1,
            message,
          });
        }
      }
    }
  }
  const diagnostics = [...diagnosticMap.values()];
  const quality = [...qualityMap.values()];
  const data = { checked: [...subjects.keys()], diagnostics };
  if (args.flags.has('json')) writeJson(jsonEnvelope(data, { quality }, diagnostics.length === 0 ? null : 'Fix the reported diagnostics.', [...new Set(warnings)]));
  else if (diagnostics.length === 0) {
    writeText(`Checked ${subjects.size} HINT file${subjects.size === 1 ? '' : 's'}; no findings.`);
  } else {
    writeText(diagnostics.map((item) => `${item.file}:${item.line}: ${item.message}`).join('\n'));
  }
  if (diagnostics.length > 0) {
    stderr.write(`hint: ${diagnostics.length} validation finding${diagnostics.length === 1 ? '' : 's'}\n`);
    process.exitCode = 1;
  }
}

const legacyCommands = new Set([
  'add', 'apply', 'author', 'bootstrap', 'compile', 'config', 'diff', 'emit', 'extract',
  'lint', 'lock', 'mcp', 'remove', 'report', 'search', 'status', 'verify',
]);

export async function run(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArguments(argv);
  if (args.flags.has('help') || argv.length === 0) return writeText(HELP);
  if (args.flags.has('version')) return writeText(packageJson.version);
  const first = args.positional.shift();
  if (!first) throw resolutionError('missing command or path');
  if (first === 'guide') {
    if (args.positional.length > 0) throw resolutionError('guide accepts no path');
    const context = await resolveTarget('.', { write: false });
    const config = await configFor(context.context.root);
    const modeNote = config.highQualityMode
      ? '\n\nHigh-quality mode is enabled for this project.'
      : '\n\nHigh-quality mode is not enabled for this project.';
    const guide = `${GUIDE}${modeNote}`;
    if (args.flags.has('json')) writeJson(jsonEnvelope({ guide }, { high_quality_mode: config.highQualityMode }, null, config.warnings));
    else {
      writeText(guide);
      for (const warning of config.warnings) stderr.write(`hint: warning: ${warning}\n`);
    }
    return;
  }
  if (first === 'check') return await checkCommand(args);
  if (commandKinds[first]) return await writeCommand(first, args);
  if (legacyCommands.has(first)) throw resolutionError(`unknown command ${first}\n\n${HELP}`);
  args.positional.unshift(first);
  await readCommand(args);
}

const wantsJson = process.argv.includes('--json');
run().catch((error: unknown) => {
  const hintError = error instanceof HintError ? error : new HintError(error instanceof Error ? error.message : String(error), 1);
  if (wantsJson) writeJson(jsonEnvelope({ error: hintError.message }, {}, null, []));
  stderr.write(`hint: ${hintError.message}\n`);
  process.exitCode = hintError.exitCode;
});
