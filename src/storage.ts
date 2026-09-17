import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import Path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validationError } from './errors.js';

export function revision(raw: string | Buffer): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

const delay = async (milliseconds: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acquireLock(path: string): Promise<Awaited<ReturnType<typeof open>>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await open(path, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await delay(20);
    }
  }
  throw validationError(`write lock is busy: ${path}`);
}

export interface UpdateResult<T> {
  value: T;
  raw: string;
  revision: string;
  changed: boolean;
}

export async function updateFile<T>(
  path: string,
  expectedRevision: string | undefined,
  transform: (raw: string | undefined) => Promise<{ raw: string; value: T }> | { raw: string; value: T },
): Promise<UpdateResult<T>> {
  await mkdir(Path.dirname(path), { recursive: true });
  const lockPath = `${path}.write-lock`;
  const lock = await acquireLock(lockPath);
  let temporary: string | undefined;
  try {
    const before = await readOptional(path);
    const beforeRevision = before === undefined ? 'missing' : revision(before);
    if (expectedRevision && expectedRevision !== beforeRevision) {
      throw validationError(`revision conflict for ${path}: expected ${expectedRevision}, found ${beforeRevision}`);
    }
    const result = await transform(before);
    if (before === result.raw) {
      return { value: result.value, raw: result.raw, revision: beforeRevision, changed: false };
    }
    temporary = Path.join(Path.dirname(path), `.${Path.basename(path)}.${process.pid}.${randomUUID()}.tmp`);
    const mode = before === undefined ? 0o644 : (await stat(path)).mode & 0o777;
    const handle = await open(temporary, 'wx', mode);
    try {
      await handle.writeFile(result.raw, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    temporary = undefined;
    try {
      const directory = await open(Path.dirname(path), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch {
      // Some platforms do not permit opening directories. The file rename is still atomic.
    }
    return { value: result.value, raw: result.raw, revision: revision(result.raw), changed: true };
  } finally {
    if (temporary) await rm(temporary, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
