import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { HintError } from '../src/errors.js';
import {
  knowledgeFiles,
  projectContext,
  resolveReadTargets,
  resolveTarget,
} from '../src/paths.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(Path.join(tmpdir(), `hint-${label}-`));
  const canonical = await realpath(directory);
  temporaryDirectories.push(canonical);
  return canonical;
}

async function createFile(path: string, contents = ''): Promise<void> {
  await mkdir(Path.dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

function initialiseGit(directory: string): void {
  execFileSync('git', ['init', '--quiet', directory], { stdio: 'ignore' });
}

async function expectHintError(
  promise: Promise<unknown>,
  exitCode: 1 | 2,
  message: RegExp,
): Promise<void> {
  try {
    await promise;
    expect.fail('expected a HintError');
  } catch (error) {
    expect(error).toBeInstanceOf(HintError);
    const hintError = error as HintError;
    expect(hintError.exitCode).toBe(exitCode);
    expect(hintError.message).toMatch(message);
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('project roots', () => {
  it('accepts a cwd reached through a filesystem alias of the Git root', async () => {
    const alias = await mkdtemp(Path.join(tmpdir(), 'hint-aliased-root-'));
    const canonical = await realpath(alias);
    temporaryDirectories.push(canonical);
    if (alias === canonical) return;
    initialiseGit(alias);
    await createFile(Path.join(alias, 'entry.ts'), 'export {};\n');

    const target = await resolveTarget('entry.ts', { cwd: alias });

    expect(target.context.canonicalRoot).toBe(canonical);
    expect(target.destination).toBe(Path.join(canonical, 'entry.ts.hint'));
  });

  it('uses the nearest Git worktree root even when a nested .hintrc exists', async () => {
    const root = await temporaryDirectory('git-root');
    initialiseGit(root);
    const nested = Path.join(root, 'packages', 'feature');
    await mkdir(nested, { recursive: true });
    await createFile(Path.join(root, 'packages', '.hintrc'), 'high-quality-mode: true\n');

    const context = await projectContext('future.ts', nested);

    expect(context.root).toBe(await realpath(root));
    expect(context.canonicalRoot).toBe(await realpath(root));
    expect(context.cwd).toBe(nested);
  });

  it('uses the nearest .hintrc outside Git from a nested cwd', async () => {
    const outer = await temporaryDirectory('config-root');
    await createFile(Path.join(outer, '.hintrc'), 'high-quality-mode: false\n');
    const nearer = Path.join(outer, 'workspace');
    await createFile(Path.join(nearer, '.hintrc'), 'high-quality-mode: true\n');
    const cwd = Path.join(nearer, 'src', 'nested');
    await mkdir(cwd, { recursive: true });

    const context = await projectContext('future.ts', cwd);

    expect(context.root).toBe(nearer);
  });

  it('falls back to the cwd outside Git when no .hintrc exists', async () => {
    const cwd = await temporaryDirectory('plain-root');
    await mkdir(Path.join(cwd, 'nested'), { recursive: true });

    const context = await projectContext('nested/future.ts', cwd);

    expect(context.root).toBe(cwd);
    expect(context.canonicalRoot).toBe(await realpath(cwd));
  });

  it('finds the root for a future path through its nearest existing ancestor', async () => {
    const root = await temporaryDirectory('future-root');
    initialiseGit(root);
    const cwd = Path.join(root, 'deep');
    await mkdir(cwd);

    const context = await projectContext('not-created/yet/file.ts', cwd);

    expect(context.root).toBe(await realpath(root));
  });
});

describe('target and knowledge path resolution', () => {
  it('distinguishes existing files, existing directories, and future directories', async () => {
    const root = await temporaryDirectory('target-kinds');
    initialiseGit(root);
    const file = Path.join(root, 'src', 'entry.ts');
    const directory = Path.join(root, 'docs');
    await createFile(file, 'export {};\n');
    await mkdir(directory);

    const fileTarget = await resolveTarget('src/entry.ts', { cwd: root });
    const directoryTarget = await resolveTarget('docs', { cwd: root });
    const futureDirectory = await resolveTarget('future scope/', { cwd: root, write: true });

    expect(fileTarget).toMatchObject({
      target: file,
      destination: `${file}.hint`,
      isDirectory: false,
      exists: true,
    });
    expect(directoryTarget).toMatchObject({
      target: directory,
      destination: Path.join(directory, '_.hint'),
      isDirectory: true,
      exists: true,
    });
    expect(futureDirectory).toMatchObject({
      target: Path.join(root, 'future scope'),
      destination: Path.join(root, 'future scope', '_.hint'),
      isDirectory: true,
      exists: false,
    });
  });

  it('treats an explicit .hint path as its own destination', async () => {
    const root = await temporaryDirectory('explicit-hint');
    initialiseGit(root);
    const hint = Path.join(root, 'src', 'entry.ts.hint');
    await createFile(hint, '---\nhint-format: 1\n---\n');

    const target = await resolveTarget('src/entry.ts.hint', { cwd: root });

    expect(target.destination).toBe(hint);
    expect(await knowledgeFiles(target)).toEqual([hint]);
  });

  it('collects ancestor folder knowledge and a file companion in root-to-leaf order', async () => {
    const root = await temporaryDirectory('knowledge');
    initialiseGit(root);
    const targetPath = Path.join(root, 'src', 'feature', 'entry.ts');
    await createFile(targetPath, 'export {};\n');
    const expected = [
      Path.join(root, '_.hint'),
      Path.join(root, 'src', '_.hint'),
      Path.join(root, 'src', 'feature', '_.hint'),
      `${targetPath}.hint`,
    ];
    await Promise.all(expected.map(async (path) => await createFile(path, '---\nhint-format: 1\n---\n')));
    await createFile(Path.join(root, 'src', 'feature', 'child', '_.hint'), 'must not be scanned');

    const target = await resolveTarget('src/feature/entry.ts', { cwd: root });

    expect(await knowledgeFiles(target)).toEqual(expected);
  });

  it('does not scan descendants when resolving a directory scope', async () => {
    const root = await temporaryDirectory('directory-scope');
    initialiseGit(root);
    const directory = Path.join(root, 'scope');
    await mkdir(Path.join(directory, 'child'), { recursive: true });
    const rootHint = Path.join(root, '_.hint');
    const scopeHint = Path.join(directory, '_.hint');
    await createFile(rootHint, 'root');
    await createFile(scopeHint, 'scope');
    await createFile(Path.join(directory, 'child', '_.hint'), 'child');

    const target = await resolveTarget('scope', { cwd: root });

    expect(await knowledgeFiles(target)).toEqual([rootHint, scopeHint]);
  });

  it('reads the companion of a deleted target', async () => {
    const root = await temporaryDirectory('deleted-target');
    initialiseGit(root);
    const companion = Path.join(root, 'removed file.ts.hint');
    await createFile(companion, '---\nhint-format: 1\n---\n');

    const [result] = await resolveReadTargets(['removed file.ts'], root);

    expect(result?.target.exists).toBe(false);
    expect(result?.files).toEqual([companion]);
  });

  it('rejects an unresolved future path for reads but resolves it for writes', async () => {
    const root = await temporaryDirectory('future-target');
    initialiseGit(root);

    await expectHintError(resolveReadTargets(['src/future.ts'], root), 2, /unresolved path/);
    await expect(resolveTarget('src/future.ts', { cwd: root, write: true })).resolves.toMatchObject({
      destination: Path.join(root, 'src', 'future.ts.hint'),
      exists: false,
    });
  });

  it('supports spaces and Unicode in file and folder names', async () => {
    const root = await temporaryDirectory('unicode');
    initialiseGit(root);
    const folder = Path.join(root, 'папка с пробелом');
    const targetPath = Path.join(folder, 'файл 🧪.ts');
    const folderHint = Path.join(folder, '_.hint');
    const companion = `${targetPath}.hint`;
    await createFile(targetPath, 'export {};\n');
    await createFile(folderHint, 'folder');
    await createFile(companion, 'companion');

    const target = await resolveTarget(Path.relative(root, targetPath), { cwd: root });

    expect(target.destination).toBe(companion);
    expect(await knowledgeFiles(target)).toEqual([folderHint, companion]);
  });

  it('rejects lexical parent traversal outside the selected root', async () => {
    const container = await temporaryDirectory('parent-escape');
    const root = Path.join(container, 'repository');
    await mkdir(root);
    initialiseGit(root);

    await expectHintError(
      resolveTarget('../outside.ts', { cwd: root, write: true }),
      2,
      /(?:escapes|resolves outside) project root/,
    );
  });

  it('rejects existing file symlinks that resolve outside the selected root', async () => {
    const container = await temporaryDirectory('file-symlink');
    const root = Path.join(container, 'repository');
    const outside = Path.join(container, 'outside.txt');
    await mkdir(root);
    initialiseGit(root);
    await createFile(outside, 'outside');
    await symlink(outside, Path.join(root, 'linked.txt'));

    await expectHintError(
      resolveTarget('linked.txt', { cwd: root }),
      2,
      /(?:resolves outside|escapes project root after resolution)/,
    );
  });

  it('rejects future paths whose existing symlink ancestor resolves outside the root', async () => {
    const container = await temporaryDirectory('directory-symlink');
    const root = Path.join(container, 'repository');
    const outside = Path.join(container, 'outside');
    await mkdir(root);
    await mkdir(outside);
    initialiseGit(root);
    await symlink(outside, Path.join(root, 'linked'));

    await expectHintError(
      resolveTarget('linked/future.ts', { cwd: root, write: true }),
      2,
      /(?:resolves outside|escapes project root after resolution)/,
    );
  });

  it('refuses writes through an in-root destination symlink', async () => {
    const root = await temporaryDirectory('destination-symlink');
    initialiseGit(root);
    const target = Path.join(root, 'entry.ts');
    const realHint = Path.join(root, 'stored.hint');
    await createFile(target, 'export {};\n');
    await createFile(realHint, 'stored');
    await symlink(realHint, `${target}.hint`);

    await expectHintError(resolveTarget('entry.ts', { cwd: root, write: true }), 2, /refusing to write through symlink/);
  });
});

describe('.hintrc', () => {
  it('uses defaults when configuration is absent or empty', async () => {
    const absent = await temporaryDirectory('config-absent');
    const empty = await temporaryDirectory('config-empty');
    await createFile(Path.join(empty, '.hintrc'), '  \n');

    await expect(readConfig(absent)).resolves.toEqual({ highQualityMode: false, warnings: [] });
    await expect(readConfig(empty)).resolves.toEqual({ highQualityMode: false, warnings: [] });
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('loads high-quality-mode: %s', async (yamlValue, expected) => {
    const root = await temporaryDirectory(`config-${yamlValue}`);
    await createFile(Path.join(root, '.hintrc'), `high-quality-mode: ${yamlValue}\n`);

    await expect(readConfig(root)).resolves.toEqual({ highQualityMode: expected, warnings: [] });
  });

  it.each([
    ['malformed YAML', 'high-quality-mode: [\n', /invalid YAML/],
    ['a scalar', 'true\n', /must be a YAML mapping/],
    ['a sequence', '- high-quality-mode\n', /must be a YAML mapping/],
    ['a string boolean', 'high-quality-mode: "true"\n', /must be true or false/],
    ['an unknown key', 'high-quality-mode: false\nprofile: strict\n', /unknown key profile/],
  ])('rejects %s', async (_label, contents, message) => {
    const root = await temporaryDirectory('config-invalid');
    await createFile(Path.join(root, '.hintrc'), contents);

    await expectHintError(readConfig(root), 1, message);
  });

  it('warns about both legacy config names without loading them', async () => {
    const root = await temporaryDirectory('legacy-config');
    await createFile(Path.join(root, 'hint.yml'), 'high-quality-mode: true\n');
    await createFile(Path.join(root, 'hint.yaml'), 'high-quality-mode: true\n');

    await expect(readConfig(root)).resolves.toEqual({
      highQualityMode: false,
      warnings: [
        'hint.yml is ignored; migrate to .hintrc',
        'hint.yaml is ignored; migrate to .hintrc',
      ],
    });
  });

  it('preserves legacy warnings while loading the real .hintrc', async () => {
    const root = await temporaryDirectory('legacy-and-current');
    await createFile(Path.join(root, 'hint.yml'), 'ignored: true\n');
    await createFile(Path.join(root, '.hintrc'), 'high-quality-mode: true\n');

    await expect(readConfig(root)).resolves.toEqual({
      highQualityMode: true,
      warnings: ['hint.yml is ignored; migrate to .hintrc'],
    });
  });
});
