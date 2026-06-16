import * as FsPromises from 'node:fs/promises';

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

export async function isPathFile(path: string): Promise<boolean> {
    return (await FsPromises.stat(path)).isFile();
}

export async function isPathFolder(path: string): Promise<boolean> {
    return (await FsPromises.stat(path)).isDirectory();
}

export async function isPathExists(path: string): Promise<boolean> {
    try {
        await FsPromises.access(path);
        return true;
    } catch {
        return false;
    }
}
