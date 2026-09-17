import { access, lstat, realpath, stat } from 'node:fs/promises';
import Path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolutionError } from './errors.js';

export interface ProjectContext {
  root: string;
  canonicalRoot: string;
  cwd: string;
}

export interface ResolvedTarget {
  context: ProjectContext;
  input: string;
  target: string;
  destination: string;
  isDirectory: boolean;
  exists: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function nearestExisting(path: string): Promise<string> {
  let current = path;
  for (;;) {
    if (await exists(current)) return current;
    const parent = Path.dirname(current);
    if (parent === current) throw resolutionError(`no existing ancestor for ${path}`);
    current = parent;
  }
}

async function findConfigRoot(start: string): Promise<string | undefined> {
  let current = (await stat(start)).isDirectory() ? start : Path.dirname(start);
  for (;;) {
    if (await exists(Path.join(current, '.hintrc'))) return current;
    const parent = Path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function findGitRoot(start: string): string | undefined {
  try {
    return execFileSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = Path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${Path.sep}`) && relative !== '..' && !Path.isAbsolute(relative));
}

export async function projectContext(input: string, cwd = process.cwd()): Promise<ProjectContext> {
  const absolute = Path.resolve(cwd, input);
  const existing = await nearestExisting(absolute);
  const existingDirectory = (await stat(existing)).isDirectory() ? existing : Path.dirname(existing);
  const gitRoot = findGitRoot(existingDirectory);
  const configRoot = gitRoot ? undefined : await findConfigRoot(existing);
  const root = await realpath(Path.resolve(gitRoot ?? configRoot ?? cwd));
  return { root, canonicalRoot: root, cwd: await realpath(Path.resolve(cwd)) };
}

async function assertSafePath(context: ProjectContext, target: string, forWrite: boolean): Promise<void> {
  const existing = await nearestExisting(target);
  let canonical: string;
  try {
    canonical = await realpath(existing);
  } catch (error) {
    throw resolutionError(`cannot resolve path ${existing}: ${String(error)}`);
  }
  if (!isInside(context.canonicalRoot, canonical)) {
    throw resolutionError(`path escapes project root after resolution: ${target}`);
  }
  if (await exists(target)) {
    const info = await lstat(target);
    if (forWrite && info.isSymbolicLink()) throw resolutionError(`refusing to write through symlink: ${target}`);
    const targetReal = await realpath(target);
    if (!isInside(context.canonicalRoot, targetReal)) {
      throw resolutionError(`path escapes project root after resolution: ${target}`);
    }
  }
}

async function canonicalFuturePath(path: string): Promise<string> {
  const existing = await nearestExisting(path);
  return Path.resolve(await realpath(existing), Path.relative(existing, path));
}

export async function resolveTarget(input: string, options: { cwd?: string; write?: boolean } = {}): Promise<ResolvedTarget> {
  const cwd = options.cwd ?? process.cwd();
  const trailingSlash = /[\\/]$/.test(input);
  const requestedTarget = Path.resolve(cwd, input);
  const context = await projectContext(input, cwd);
  await assertSafePath(context, requestedTarget, options.write ?? false);
  const target = await canonicalFuturePath(requestedTarget);
  const targetExists = await exists(target);
  const isDirectory = targetExists ? (await stat(target)).isDirectory() : trailingSlash;
  const destination = target.endsWith('.hint')
    ? target
    : isDirectory
      ? Path.join(target, '_.hint')
      : `${target}.hint`;
  await assertSafePath(context, destination, options.write ?? false);
  return { context, input, target, destination, isDirectory, exists: targetExists };
}

export async function knowledgeFiles(target: ResolvedTarget): Promise<string[]> {
  if (target.target.endsWith('.hint')) return (await exists(target.target)) ? [target.target] : [];
  const base = target.isDirectory ? target.target : Path.dirname(target.target);
  const folders: string[] = [];
  let current = base;
  for (;;) {
    if (!isInside(target.context.root, current)) break;
    folders.push(current);
    if (current === target.context.root) break;
    const parent = Path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const candidates = folders.reverse().map((folder) => Path.join(folder, '_.hint'));
  if (!target.isDirectory) candidates.push(target.destination);
  const found: string[] = [];
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      await assertSafePath(target.context, candidate, false);
      found.push(candidate);
    }
  }
  return found;
}

export async function resolveReadTargets(inputs: string[], cwd = process.cwd()): Promise<Array<{ target: ResolvedTarget; files: string[] }>> {
  const results = [];
  for (const input of inputs) {
    const target = await resolveTarget(input, { cwd });
    const files = await knowledgeFiles(target);
    if (!target.exists && files.length === 0) throw resolutionError(`unresolved path: ${input}`);
    results.push({ target, files });
  }
  return results;
}
