import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

export const URL_FILE_PREFIX = 'file://';
export const URL_NPM_PREFIX = 'npm://';

// Project-local folder where the CLI stores fetched hintbooks: git clones land in
// `hintbooks/<repo>`, and npm books are installed into `hintbooks/node_modules/<pkg>`
// via an isolated npm prefix so the host project's package manager is never invoked.
export const HINTBOOKS_FOLDER = 'hintbooks';
export const NODE_MODULES_FOLDER = 'node_modules';

export function interpolate(template: string, values: Record<string, any>): string {
    if (!template) return template;

    let result = template;
    if (values) {
        for (const [
            key,
            value,
        ] of Object.entries(values || {})) {
            const placeholder = `{${key}}`;
            result = result.split(placeholder).join(String(value));
        }
    }

    return result;
}

export function isGlobPattern(p: string): boolean {
    return /[*?{[]/.test(p);
}

export async function isPathFolder(path: string): Promise<boolean> {
    try {
        return (await FsPromises.stat(path)).isDirectory();
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }

        throw error;
    }
}

export async function isPathExists(path: string): Promise<boolean> {
    try {
        await FsPromises.access(path);
        return true;
    } catch {
        return false;
    }
}

// Reads a UTF-8 file, returning null when it does not exist instead of throwing.
export async function readFile(path: string): Promise<string | null> {
    try {
        return await FsPromises.readFile(path, 'utf8');
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

let temporaryFileSequence = 0;

// Writes a UTF-8 file atomically. The temporary file lives beside the destination, so rename is
// atomic on the filesystems where the destination itself lives. A process-local sequence avoids
// wall-clock/randomness while keeping concurrent writes from this process distinct.
export async function writeFile(path: string, content: string): Promise<void> {
    const temporaryPath = Path.join(Path.dirname(path), `.${Path.basename(path)}.${process.pid}.${temporaryFileSequence++}.tmp`);

    try {
        await FsPromises.writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
        await FsPromises.rename(temporaryPath, path);
    } catch (error: unknown) {
        await FsPromises.unlink(temporaryPath).catch(() => undefined);
        throw error;
    }
}

// True when `path` is the root itself or is contained by it. Prefix checks are insufficient:
// `/work/repo-extra` starts with `/work/repo` but is not inside that project.
export function isInsideProject(root: string, path: string): boolean {
    const relative = Path.relative(root, path);

    return relative === '' || (!relative.startsWith(`..${Path.sep}`) && relative !== '..' && !Path.isAbsolute(relative));
}

// Stable key form used in lock files, git maps, rendered target names, and JSON output.
export function toPortablePath(path: string): string {
    return path.replaceAll('\\', '/').split(Path.sep).join('/').replace(/\/{2,}/g, '/');
}
