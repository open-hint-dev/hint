import { execFile } from 'node:child_process';
import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';
import { promisify } from 'node:util';

import { VFile } from 'vfile';
import { matter } from 'vfile-matter';

import { HINTBOOKS_FOLDER, isPathExists, isPathFolder, NODE_MODULES_FOLDER, readFile, URL_FILE_PREFIX, URL_NPM_PREFIX } from './helper.js';

const INSTRUCTION_EXTENSION = '.md';
// Emit templates are `<keyword>.tmpl` rather than `<keyword>.md`: they hold code, not prose, and the
// separate extension keeps markdown tooling from reflowing a Go function into a paragraph.
const TEMPLATE_EXTENSION = '.tmpl';

export const HINTBOOK_FILE_NAME = 'hintbook.json';

export const RUNNING_CHANGES = '__changes__';
export const RUNNING_AUTHORING = '__authoring__';
export const RUNNING_CONFIG = '__config__';
export const RUNNING_FILE = '__file__';
export const RUNNING_FOLDER = '__folder__';
export const RUNNING_FOOTER = '__footer__';
export const RUNNING_HEADER = '__header__';
// Emit packs only: rendered once per artifact, listing what the spec refers to and does not declare.
export const RUNNING_IMPORTS = '__imports__';
export const RUNNING_SYSTEM = '__system__';

export const PLACEHOLDER_ID = 'id';
export const PLACEHOLDER_NAME = 'name';
export const PLACEHOLDER_BODY = 'body';
export const PLACEHOLDER_CHILDREN = 'children';
export const PLACEHOLDER_ATTRS = 'attrs';
export const PLACEHOLDER_OVERRIDES = 'overrides';
export const PLACEHOLDER_SUPERSEDED_BY = 'superseded_by';
export const PLACEHOLDER_OVERRIDDEN_BY = 'overridden_by';
export const PLACEHOLDER_SOURCE = 'source';
export const PLACEHOLDER_INCLUDED_FROM = 'included_from';

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
    // Domain search vocabulary. Groups are symmetric and data-only: the engine never assigns meaning
    // to a term, it merely expands every member to the other members of its group.
    synonyms?: string[][];
    // Present only on an emit pack — a book whose `<keyword>.tmpl` files render an artifact instead of
    // an instruction. Its presence is the whole distinction between the two kinds of book, so one
    // loader, one registry, and one first-wins precedence rule serve both.
    target?: string;
    // Globs matched against the *output* path, so a file extension selects the emitter and the engine
    // never learns a language. Empty means the pack is only selectable by an explicit `--target`.
    match?: string[];
    // How this target writes a comment, as a `{text}` template — `// {text}`, `# {text}`,
    // `<!-- {text} -->`. Region markers and rendered documentation both go through it.
    comment?: string;
    // Optional external command reporting the real symbols of a file as JSON. Keeps language parsers
    // out of the engine: a language is a plugin on the same footing as a vocabulary, and its absence
    // degrades verification to the presence lint rather than breaking it.
    symbols?: string;
    // How this target's symbol kinds map onto the vocabulary's keywords, for `hint extract`. Declared
    // rather than inferred, because the engine knows no keywords and a template cannot be read
    // backwards from its output.
    extract?: Record<string, string>;
    // Identifiers this language provides without an import — `string`, `error`, `any`. Everything a
    // spec names that is neither one of these nor declared in the file itself needs importing, and
    // saying which is the most the emitter can honestly do: it knows the type names, never the paths.
    builtins?: string[];
    instructions: InstructionData[];
};

// True for a book that renders artifacts rather than instructions. Every consumer of the vocabulary —
// rendering, the author prompt, the glossary, lock's vocabulary hash — has to exclude these, because
// `resolveHintbookPaths` returns folders sorted, and `emit/go` sorts before `keywords`.
export function isEmitPack(hintbook: HintbookData): boolean {
    return Boolean(hintbook.target);
}

export function vocabularyBooks(hintbooks: HintbookData[]): HintbookData[] {
    return hintbooks.filter((hintbook) => !isEmitPack(hintbook));
}

export function emitPacks(hintbooks: HintbookData[]): HintbookData[] {
    return hintbooks.filter(isEmitPack);
}

// A hintbook is a flat folder of `<keyword>.md` instructions — or, for an emit pack, `<keyword>.tmpl`
// templates. Files carrying a second extension (`__header__.fix.md`, `__mode__.review.md`) are
// variants from the removed mode system; they are ignored so an older hintbook still loads its base
// vocabulary instead of failing or double-binding.
function instructionName(file: string, extension: string): string | null {
    if (Path.extname(file) !== extension) {
        return null;
    }

    const name = Path.basename(file, extension);

    return Path.extname(name) === '' ? name : null;
}

// Only string-to-string entries survive, so a malformed manifest degrades to "no extract support"
// rather than producing blocks whose keyword is `undefined`.
function parseExtractMap(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const map: Record<string, string> = {};

    for (const [
        kind,
        keyword,
    ] of Object.entries(value as Record<string, unknown>)) {
        if (typeof keyword === 'string' && keyword.trim()) {
            map[kind] = keyword.trim();
        }
    }

    return Object.keys(map).length > 0 ? map : undefined;
}

function parseSynonymGroups(value: unknown, source: string): string[][] | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) throw new Error(`Invalid synonym groups in '${source}': expected an array of string arrays`);

    const groups = value.map((group) => {
        const terms = metadataStrings(group, source);
        if (!Array.isArray(group) || !terms) throw new Error(`Invalid synonym groups in '${source}': every group must contain strings`);
        return [...new Set(terms)];
    }).filter((group) => group.length > 1);

    return groups.length > 0 ? groups : undefined;
}

function metadataStrings(value: unknown, source?: string): string[] | undefined {
    if (value === undefined || value === null) return undefined;

    const values = Array.isArray(value) ? value : [value];
    const invalid = values.find((entry) => typeof entry !== 'string');

    if (invalid !== undefined) {
        throw new Error(`Invalid string list${source ? ` in '${source}'` : ''}: every value must be a string`);
    }

    const strings = (values as string[]).map((entry) => entry.trim()).filter(Boolean);

    return strings.length > 0 ? strings : undefined;
}

function metadataString(metadata: MetaData, key: 'description' | 'name'): string {
    const value = metadata[key];

    return typeof value === 'string' ? value.trim() : '';
}

export async function loadHintbook(hintbookPath: string): Promise<HintbookData> {
    const data: HintbookData = { instructions: [] };

    // The manifest is read before the folder is walked, because `target` decides which file extension
    // counts as a template here — readdir order must not be able to change what loads.
    const manifestPath = Path.join(hintbookPath, HINTBOOK_FILE_NAME);
    let manifest: Record<string, any>;

    try {
        manifest = JSON.parse((await readFile(manifestPath)) ?? '{}') as Record<string, any>;
    } catch (error: unknown) {
        throw new Error(`Failed to read hintbook manifest '${manifestPath}': ${error instanceof Error ? error.message : String(error)}`);
    }

    data.id = manifest.id || '';
    data.name = manifest.name || '';
    data.description = manifest.description || '';
    data.synonyms = parseSynonymGroups(manifest.synonyms, manifestPath);

    if (typeof manifest.target === 'string' && manifest.target.trim()) {
        data.target = manifest.target.trim();
        data.match = metadataStrings(manifest.match, manifestPath);
        data.comment = typeof manifest.comment === 'string' && manifest.comment.trim() ? manifest.comment.trim() : undefined;
        data.symbols = typeof manifest.symbols === 'string' && manifest.symbols.trim() ? manifest.symbols.trim() : undefined;
        data.extract = parseExtractMap(manifest.extract);
        data.builtins = metadataStrings(manifest.builtins, manifestPath);
    }

    const extension = data.target ? TEMPLATE_EXTENSION : INSTRUCTION_EXTENSION;
    const files = await FsPromises.readdir(hintbookPath);

    for (const file of files) {
        const name = instructionName(file, extension);

        if (!name) {
            continue;
        }

        const content = (await readFile(Path.join(hintbookPath, file))) ?? '';
        const instructionPath = Path.join(hintbookPath, file);

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
                synonyms: metadataStrings(metadata.synonyms, instructionPath),
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
