import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import { VFile } from 'vfile';
import { matter } from 'vfile-matter';

import { isPathExists, isPathFolder, URL_FILE_PREFIX, URL_NPM_PREFIX } from './helper.js';

export const INSTRUCTION_EXTENSION = '.md';

export const INSTRUCTION_MODE_DEFAULT = 'compile';

export const HINTBOOK_FILE_NAME = 'hintbook.json';

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
    exclude?: boolean;
    synonyms?: string[];
};

export type InstructionFileData = {
    name: string;
    mode: string;
};

export type InstructionData = {
    name: string;
    content: string;
    metadata?: MetaData;
};

export type ModeData = {
    instructions: InstructionData[];
};

export type HintbookData = {
    name?: string;
    description?: string;
    modes: Record<string, ModeData>;
};

async function resolveInstructionMode(file: string): Promise<InstructionFileData | null> {
    const fileExt = Path.extname(file);
    if (fileExt !== INSTRUCTION_EXTENSION) {
        return null;
    }

    const fileName = Path.basename(file, fileExt);
    const mode = Path.extname(fileName);
    const name = Path.basename(fileName, mode);

    return {
        mode: mode.slice(1) || INSTRUCTION_MODE_DEFAULT,
        name,
    };
}

export async function loadHintbook(hintbookPath: string): Promise<HintbookData> {
    const data: HintbookData = {
        modes: {
            [INSTRUCTION_MODE_DEFAULT]: {
                instructions: [],
            },
        },
    };

    const files = await FsPromises.readdir(hintbookPath);

    for (const file of files) {
        if (file === HINTBOOK_FILE_NAME) {
            const hintbookJson = JSON.parse(await FsPromises.readFile(Path.join(hintbookPath, file), 'utf-8'));

            data.name = hintbookJson.name || '';
            data.description = hintbookJson.description || '';

            continue;
        }

        const instructionFileData = await resolveInstructionMode(file);
        if (!instructionFileData) {
            continue;
        }

        const mode = data.modes[instructionFileData.mode] || {
            instructions: [],
        };

        if (!data.modes[instructionFileData.mode]) {
            data.modes[instructionFileData.mode] = mode;
        }

        const content = await FsPromises.readFile(Path.join(hintbookPath, file), 'utf-8');

        const parsed = new VFile(content);
        matter(parsed, { strip: true });
        const metadata = (parsed.data.matter ?? {}) as MetaData;

        mode.instructions.push({
            name: instructionFileData.name,
            content: String(parsed),
            metadata: {
                exclude: metadata.exclude,
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
            Path.join(projectRootPath, 'node_modules', packageName),
            Path.resolve(nodeFolderPath, '..', 'lib', 'node_modules', packageName),
            Path.join(nodeFolderPath, 'node_modules', packageName),
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

export async function resolveHintbookPaths(projectRootPath: string, book: string): Promise<string[]> {
    for (const baseFolderPath of hintbookBaseFolders(projectRootPath, book)) {
        const hintbookPaths = await findHintbookFolders(baseFolderPath);

        if (hintbookPaths.length > 0) {
            return hintbookPaths;
        }
    }

    return [];
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
