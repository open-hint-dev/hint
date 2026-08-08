import { execFile } from 'node:child_process';
import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';
import { promisify } from 'node:util';

import { VFile } from 'vfile';
import { matter } from 'vfile-matter';

import { HINTBOOKS_FOLDER, isPathExists, isPathFolder, NODE_MODULES_FOLDER, readFile, URL_FILE_PREFIX, URL_NPM_PREFIX } from './helper.js';

const INSTRUCTION_EXTENSION = '.md';

export const HINTBOOK_FILE_NAME = 'hintbook.json';

export const RUNNING_CHANGES = '__changes__';
export const RUNNING_FILE = '__file__';
export const RUNNING_FOLDER = '__folder__';
export const RUNNING_FOOTER = '__footer__';
export const RUNNING_HEADER = '__header__';
export const RUNNING_SYSTEM = '__system__';

export const PLACEHOLDER_ID = 'id';
export const PLACEHOLDER_NAME = 'name';
export const PLACEHOLDER_BODY = 'body';
export const PLACEHOLDER_CHILDREN = 'children';

export type MetaData = {
    description?: string;
    exclude?: boolean;
    name?: string;
    surface?: boolean;
    synonyms?: string[];
};

export type InstructionData = {
    name: string;
    content: string;
    metadata?: MetaData;
};

export type HintbookData = {
    id?: string;
    name?: string;
    description?: string;
    instructions: InstructionData[];
};

// A hintbook is a flat folder of `<keyword>.md` instructions. Files carrying a second extension
// (`__header__.fix.md`, `__mode__.review.md`) are variants from the removed mode system; they are
// ignored so an older hintbook still loads its base vocabulary instead of failing or double-binding.
function instructionName(file: string): string | null {
    if (Path.extname(file) !== INSTRUCTION_EXTENSION) {
        return null;
    }

    const name = Path.basename(file, INSTRUCTION_EXTENSION);

    return Path.extname(name) === '' ? name : null;
}

function metadataString(metadata: MetaData, key: 'description' | 'name'): string {
    const value = metadata[key];

    return typeof value === 'string' ? value.trim() : '';
}

export async function loadHintbook(hintbookPath: string): Promise<HintbookData> {
    const data: HintbookData = { instructions: [] };

    const files = await FsPromises.readdir(hintbookPath);

    for (const file of files) {
        if (file === HINTBOOK_FILE_NAME) {
            const hintbookJson = JSON.parse((await readFile(Path.join(hintbookPath, file))) ?? '{}');

            data.id = hintbookJson.id || '';
            data.name = hintbookJson.name || '';
            data.description = hintbookJson.description || '';

            continue;
        }

        const name = instructionName(file);

        if (!name) {
            continue;
        }

        const content = (await readFile(Path.join(hintbookPath, file))) ?? '';

        const parsed = new VFile(content);
        matter(parsed, { strip: true });
        const metadata = (parsed.data.matter ?? {}) as MetaData;

        data.instructions.push({
            name,
            content: String(parsed),
            metadata: {
                description: metadataString(metadata, 'description') || undefined,
                exclude: metadata.exclude,
                name: metadataString(metadata, 'name') || undefined,
                surface: metadata.surface,
                synonyms: metadata.synonyms,
            },
        });
    }

    return data;
}

function hintbookBaseFolders(projectRootPath: string, book: string): string[] {
    if (book.startsWith(URL_FILE_PREFIX)) {
        return [Path.resolve(projectRootPath, book.slice(URL_FILE_PREFIX.length))];
    }

    if (book.startsWith(URL_NPM_PREFIX)) {
        const packageName = book.slice(URL_NPM_PREFIX.length);
        const nodeFolderPath = Path.dirname(process.execPath);

        return [
            Path.join(projectRootPath, HINTBOOKS_FOLDER, NODE_MODULES_FOLDER, packageName),
            Path.join(projectRootPath, NODE_MODULES_FOLDER, packageName),
            Path.resolve(nodeFolderPath, '..', 'lib', NODE_MODULES_FOLDER, packageName),
            Path.join(nodeFolderPath, NODE_MODULES_FOLDER, packageName),
        ];
    }

    return [Path.resolve(projectRootPath, book)];
}

async function findHintbookFolders(baseFolderPath: string): Promise<string[]> {
    if (!(await isPathExists(baseFolderPath)) || !(await isPathFolder(baseFolderPath))) {
        return [];
    }

    const hintbookFolders: string[] = [];

    for await (const match of FsPromises.glob(`**/${HINTBOOK_FILE_NAME}`, { cwd: baseFolderPath })) {
        hintbookFolders.push(Path.dirname(Path.join(baseFolderPath, match)));
    }

    return hintbookFolders.sort();
}

let npmGlobalRootPromise: Promise<string | null> | undefined;

function findNpmGlobalRoot(): Promise<string | null> {
    npmGlobalRootPromise ??= promisify(execFile)(
        'npm',
        [
            'root',
            '--global',
        ],
        { shell: process.platform === 'win32' },
    )
        .then(({ stdout }) => stdout.trim() || null)
        .catch(() => null);

    return npmGlobalRootPromise;
}

async function* hintbookSearchFolders(projectRootPath: string, book: string): AsyncGenerator<string> {
    for (const baseFolderPath of hintbookBaseFolders(projectRootPath, book)) {
        yield baseFolderPath;
    }

    if (book.startsWith(URL_NPM_PREFIX)) {
        const npmGlobalRoot = await findNpmGlobalRoot();

        if (npmGlobalRoot) {
            yield Path.join(npmGlobalRoot, book.slice(URL_NPM_PREFIX.length));
        }
    }
}

export async function resolveHintbookPaths(projectRootPath: string, book: string): Promise<string[]> {
    for await (const baseFolderPath of hintbookSearchFolders(projectRootPath, book)) {
        const hintbookPaths = await findHintbookFolders(baseFolderPath);

        if (hintbookPaths.length > 0) {
            return hintbookPaths;
        }
    }

    return [];
}

async function readVersion(filePath: string): Promise<string | null> {
    try {
        const content = await readFile(filePath);
        if (content === null) {
            return null;
        }

        const data = JSON.parse(content);

        return typeof data.version === 'string' && data.version ? data.version : null;
    } catch {
        return null;
    }
}

export async function resolveHintbookVersion(projectRootPath: string, book: string): Promise<string | null> {
    for await (const baseFolderPath of hintbookSearchFolders(projectRootPath, book)) {
        const hintbookPaths = await findHintbookFolders(baseFolderPath);

        if (hintbookPaths.length === 0) {
            continue;
        }

        return (await readVersion(Path.join(baseFolderPath, 'package.json'))) ?? (await readVersion(Path.join(baseFolderPath, HINTBOOK_FILE_NAME)));
    }

    return null;
}

export async function loadHintbooks(projectRootPath: string, books: string[]): Promise<HintbookData[]> {
    const hintbooks: HintbookData[] = [];

    for (const book of books) {
        const hintbookPaths = await resolveHintbookPaths(projectRootPath, book);

        if (hintbookPaths.length === 0) {
            throw new Error(`Hintbook not found: ${book}`);
        }

        for (const hintbookPath of hintbookPaths) {
            hintbooks.push(await loadHintbook(hintbookPath));
        }
    }

    return hintbooks;
}
