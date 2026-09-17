import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const repository = Path.resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix = 'hint-site-test-'): Promise<string> {
  const directory = await mkdtemp(Path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repository,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
}

async function writeEnvironment(directory: string, overrides: Record<string, string> = {}): Promise<string> {
  const values = {
    SITE_DEPLOY_HOST: 'example.invalid',
    SITE_DEPLOY_USER: 'deploy',
    SITE_DEPLOY_PORT: '22',
    SITE_DEPLOY_PATH: '~/public_html',
    ...overrides,
  };
  const file = Path.join(directory, 'deploy.env');
  await writeFile(file, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  return file;
}

async function isolatedRepository(): Promise<string> {
  const root = await temporaryDirectory();
  await cp(Path.join(repository, 'scripts'), Path.join(root, 'scripts'), { recursive: true });
  await mkdir(Path.join(root, 'sites'), { recursive: true });
  await cp(Path.join(repository, 'sites', 'openhint.dev'), Path.join(root, 'sites', 'openhint.dev'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('static site packaging', () => {
  test('packages only the explicit public manifest when invoked from another cwd', async () => {
    const scratch = await temporaryDirectory();
    const destination = Path.join(scratch, 'public');
    const result = run(Path.join(repository, 'scripts', 'site-package.sh'), [destination], { cwd: scratch });

    expect(result.status).toBe(0);
    expect((await readdir(destination)).toSorted()).toEqual([
      '.htaccess', '404.html', 'favicon.png', 'index.html', 'llms.txt', 'robots.txt', 'sitemap.xml', 'styles.css',
    ]);
    expect(await lstat(Path.join(destination, 'index.html'))).toMatchObject({});
    expect(result.stdout).toContain('staged allowlisted public files');
  });

  test('rejects a non-empty destination without clearing it', async () => {
    const scratch = await temporaryDirectory();
    const destination = Path.join(scratch, 'public');
    await mkdir(destination);
    await writeFile(Path.join(destination, 'keep.txt'), 'keep');

    const result = run(Path.join(repository, 'scripts', 'site-package.sh'), [destination]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('destination must be empty');
    expect(await readFile(Path.join(destination, 'keep.txt'), 'utf8')).toBe('keep');
  });

  test.each(['missing', 'symlink'] as const)('rejects a %s required public asset', async (condition) => {
    const root = await isolatedRepository();
    const favicon = Path.join(root, 'sites', 'openhint.dev', 'favicon.png');
    await rm(favicon);
    if (condition === 'symlink') await symlink('/etc/hosts', favicon);

    const result = run(Path.join(root, 'scripts', 'site-package.sh'), [Path.join(root, 'package')]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(condition === 'symlink' ? 'must not be a symlink' : 'is missing');
  });
});

describe('static site publication safeguards', () => {
  test('requires deployment configuration and rejects unsafe port and path values', async () => {
    const scratch = await temporaryDirectory();
    const missing = run(Path.join(repository, 'scripts', 'site-publish.sh'), ['--dry-run'], {
      env: { SITE_DEPLOY_ENV_FILE: Path.join(scratch, 'absent.env') },
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('environment file not found');

    const invalidPort = await writeEnvironment(scratch, { SITE_DEPLOY_PORT: '70000' });
    const portResult = run(Path.join(repository, 'scripts', 'site-publish.sh'), ['--dry-run'], {
      env: { SITE_DEPLOY_ENV_FILE: invalidPort },
    });
    expect(portResult.status).toBe(1);
    expect(portResult.stderr).toContain('integer from 1 to 65535');

    const invalidPath = await writeEnvironment(scratch, { SITE_DEPLOY_PATH: '../public_html' });
    const pathResult = run(Path.join(repository, 'scripts', 'site-publish.sh'), ['--dry-run'], {
      env: { SITE_DEPLOY_ENV_FILE: invalidPath },
    });
    expect(pathResult.status).toBe(1);
    expect(pathResult.stderr).toContain('safe absolute or ~/ relative path');
  });

  test('dry-run checks and packages without invoking remote tools', async () => {
    const scratch = await temporaryDirectory();
    const environmentFile = await writeEnvironment(scratch);
    const mockBin = Path.join(scratch, 'bin');
    const callLog = Path.join(scratch, 'calls');
    await mkdir(mockBin);
    for (const command of ['curl', 'scp', 'ssh']) {
      const executable = Path.join(mockBin, command);
      await writeFile(executable, `#!/bin/sh\necho ${command} >> "$MOCK_CALL_LOG"\nexit 91\n`);
      await chmod(executable, 0o755);
    }

    const result = run(Path.join(repository, 'scripts', 'site-publish.sh'), ['--dry-run'], {
      cwd: scratch,
      env: {
        SITE_DEPLOY_ENV_FILE: environmentFile,
        MOCK_CALL_LOG: callLog,
        PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no remote connection, upload, backup, or cleanup');
    expect(result.stdout).toContain('for-software-engineers.html');
    await expect(readFile(callLog, 'utf8')).rejects.toThrow();
  });

  test('direct publication stops at the site check when an asset is absent', async () => {
    const root = await isolatedRepository();
    const environmentFile = await writeEnvironment(root);
    await rm(Path.join(root, 'sites', 'openhint.dev', 'favicon.png'));

    const result = run(Path.join(root, 'scripts', 'site-publish.sh'), ['--dry-run'], {
      env: { SITE_DEPLOY_ENV_FILE: environmentFile },
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('required public file is missing');
  });

  test('an SCP failure exits nonzero and never reports publication success', async () => {
    const scratch = await temporaryDirectory();
    const environmentFile = await writeEnvironment(scratch);
    const mockBin = Path.join(scratch, 'bin');
    await mkdir(mockBin);
    const liveBytes = 'legacy live page';
    const liveHash = createHash('sha256').update(liveBytes).digest('hex');
    const curl = Path.join(mockBin, 'curl');
    await writeFile(curl, `#!/bin/sh\nprintf '%s' '${liveBytes}'\n`);
    await chmod(curl, 0o755);
    const ssh = Path.join(mockBin, 'ssh');
    await writeFile(ssh, `#!/bin/sh
case "$*" in
  *"test -f index.html"*) echo "$MOCK_LIVE_HASH  index.html" ;;
  *"test -f .htaccess"*) echo absent ;;
  *"find . -mindepth"*) echo ./index.html ;;
  *"bash -s --"*) cat >/dev/null; echo 'site-publish: backup test contains 1 affected files' ;;
  *) exit 92 ;;
esac
`);
    await chmod(ssh, 0o755);
    const scp = Path.join(mockBin, 'scp');
    await writeFile(scp, '#!/bin/sh\nexit 23\n');
    await chmod(scp, 0o755);

    const result = run(Path.join(repository, 'scripts', 'site-publish.sh'), [], {
      env: {
        SITE_DEPLOY_ENV_FILE: environmentFile,
        MOCK_LIVE_HASH: liveHash,
        PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      },
    });

    expect(result.status).toBe(23);
    expect(result.stdout).not.toContain('upload and targeted legacy cleanup complete');
  });
});
