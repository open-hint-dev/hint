import * as FsPromises from 'node:fs/promises';
import Path from 'node:path';

import type { Heading, Root, RootContent } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkCustomHeaderId from 'remark-custom-header-id';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import * as Unified from 'unified';

import { isGlobPattern, isPathExists, isPathFolder, readFile } from './helper.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';

const HINT_EXT = '.hint';
const FOLDER_HINT = `_${HINT_EXT}`;
const INCLUDE_DIRECTIVE = '@include';

export type HintFileData = {
    path: string;
    children: HintFileData[];
};

export type HintData = {
    level: number;
    keyword: string;
    id: string;
    name: string;
    body: string;
    children: HintData[];
};

async function normalizeHintPath(path: string): Promise<string | null> {
    if ((await isPathExists(path)) && (await isPathFolder(path))) {
        return Path.join(path, FOLDER_HINT);
    }

    if (Path.extname(path) === HINT_EXT) {
        return path;
    }

    return normalizeHintPath(`${path}${HINT_EXT}`);
}

async function normalizeHintPaths(currentPath: string, paths: string[]): Promise<string[]> {
    const normalizedPaths: string[] = [];

    for (const path of paths) {
        if (isGlobPattern(path)) {
            const expandedPaths: string[] = [];

            for await (const match of FsPromises.glob(path, { cwd: currentPath })) {
                expandedPaths.push(match);
            }

            normalizedPaths.push(...(await normalizeHintPaths(currentPath, expandedPaths)));
        } else {
            const resolvedPath = Path.resolve(currentPath, path);
            if (resolvedPath.startsWith(currentPath)) {
                const normalizedPath = await normalizeHintPath(resolvedPath);

                if (normalizedPath) {
                    normalizedPaths.push(normalizedPath);
                }
            }
        }
    }

    return normalizedPaths;
}

function sortHintPaths(normalizedHintPaths: string[]): string[] {
    return normalizedHintPaths.sort((a: string, b: string): number => {
        const folderA = Path.dirname(a);
        const folderB = Path.dirname(b);

        if (folderA !== folderB) {
            const partsA = folderA.split(Path.sep).filter(Boolean);
            const partsB = folderB.split(Path.sep).filter(Boolean);
            const minLength = Math.min(partsA.length, partsB.length);

            for (let i = 0; i < minLength; i++) {
                if (partsA[i] !== partsB[i]) {
                    return partsA[i]!.localeCompare(partsB[i]!);
                }
            }

            return partsA.length - partsB.length;
        }

        const fileA = Path.basename(a);
        const fileB = Path.basename(b);

        if (fileA === FOLDER_HINT && fileB !== FOLDER_HINT) {
            return -1;
        }

        if (fileB === FOLDER_HINT && fileA !== FOLDER_HINT) {
            return 1;
        }

        return fileA.localeCompare(fileB);
    });
}

function findHint(projectRootPath: string, folderPath: string, hints: HintFileData[], nodes: Map<string, HintFileData>): HintFileData {
    const path = Path.join(folderPath, FOLDER_HINT);

    let node = nodes.get(path);

    if (!node) {
        node = {
            path,
            children: [],
        };

        nodes.set(path, node);

        if (folderPath === projectRootPath) {
            hints.push(node);
        } else {
            findHint(projectRootPath, Path.dirname(folderPath), hints, nodes).children.push(node);
        }
    }

    return node;
}

export async function findHints(projectRootPath: string, paths: string[]): Promise<HintFileData[]> {
    const normalizedHintPaths = await normalizeHintPaths(projectRootPath, paths);
    const sortedHintPaths = sortHintPaths([...new Set(normalizedHintPaths)]);

    const hints: HintFileData[] = [];
    const nodes = new Map<string, HintFileData>();

    for (const path of sortedHintPaths) {
        const node = findHint(projectRootPath, Path.dirname(path), hints, nodes);

        if (Path.basename(path) !== FOLDER_HINT) {
            node.children.push({ path, children: [] });
        }
    }

    return hints;
}

async function readHintContent(path: string, dryRun: boolean): Promise<string | null> {
    const content = await readFile(path);

    if (content !== null) {
        return content;
    }

    if (Path.basename(path) === FOLDER_HINT) {
        return '';
    }

    if (dryRun) {
        throw new Error(`Hint file not found: ${path}`);
    }

    return null;
}

async function parseHintContent(path: string, content: string, projectRootPath: string): Promise<Root> {
    const expanded = await expandIncludes(path, content, projectRootPath, new Set([path]));

    const processor = Unified.unified().use(remarkParse).use(remarkCustomHeaderId);

    return (await processor.run(processor.parse(expanded))) as Root;
}

// A line is an `@include` directive when, ignoring surrounding whitespace, it is exactly
// `@include <path>`. The path may be wrapped in matching single or double quotes, or left bare.
function parseIncludeDirective(line: string): string | null {
    const trimmed = line.trim();

    if (!trimmed.startsWith(INCLUDE_DIRECTIVE)) {
        return null;
    }

    const rest = trimmed.slice(INCLUDE_DIRECTIVE.length);

    if (rest.length === 0 || !/^\s/.test(rest)) {
        return null;
    }

    let target = rest.trim();

    if (target.length === 0) {
        return null;
    }

    const quote = target[0];

    if ((quote === '"' || quote === "'") && target.length >= 2 && target.endsWith(quote)) {
        target = target.slice(1, -1);
    }

    return target.length > 0 ? target : null;
}

// A leading slash resolves the include from the project root. Otherwise it resolves relative to
// the including file's folder, falling back to the project root when that does not exist.
async function resolveIncludePath(target: string, fromFilePath: string, projectRootPath: string): Promise<string | null> {
    if (target.startsWith('/')) {
        const rooted = Path.join(projectRootPath, target.replace(/^\/+/, ''));

        return (await isPathExists(rooted)) ? rooted : null;
    }

    const relative = Path.resolve(Path.dirname(fromFilePath), target);

    if (await isPathExists(relative)) {
        return relative;
    }

    const rooted = Path.join(projectRootPath, target);

    return (await isPathExists(rooted)) ? rooted : null;
}

// Inlines `@include` targets as-is: the referenced file's raw content replaces the directive line
// before any markdown parsing, so an included file behaves exactly as if its text were written in
// place. Includes nest, and a file may not include itself transitively (cycle).
async function expandIncludes(filePath: string, content: string, projectRootPath: string, seen: Set<string>): Promise<string> {
    const lines = content.split('\n');
    const out: string[] = [];

    for (const line of lines) {
        const target = parseIncludeDirective(line);

        if (target === null) {
            out.push(line);
            continue;
        }

        const resolved = await resolveIncludePath(target, filePath, projectRootPath);

        if (resolved === null) {
            throw new Error(`@include target not found: '${target}' (referenced in ${filePath})`);
        }

        if (seen.has(resolved)) {
            throw new Error(`@include cycle detected: '${resolved}' (referenced in ${filePath})`);
        }

        const includedContent = await readFile(resolved);

        if (includedContent === null) {
            throw new Error(`@include target not found: '${target}' (referenced in ${filePath})`);
        }

        const expanded = await expandIncludes(
            resolved,
            includedContent,
            projectRootPath,
            new Set([
                ...seen,
                resolved,
            ]),
        );

        out.push(expanded.trim());
    }

    return out.join('\n');
}

function stringifyHintBody(nodes: RootContent[]): string {
    return Unified.unified().use(remarkStringify).stringify({ type: 'root', children: nodes }).trim();
}

function parseHeading(heading: Heading): HintData {
    const [
        keyword = '',
        ...nameParts
    ] = mdastToString(heading).trim().split(/\s+/);

    return {
        level: heading.depth,
        keyword,
        id: (heading.data as { id?: string } | undefined)?.id ?? '',
        name: nameParts.join(' '),
        body: '',
        children: [],
    };
}

function parseHeadings(root: Root, parent: HintData): void {
    const stack: HintData[] = [parent];

    let current = parent;
    let bodyNodes: RootContent[] = [];

    const flushBody = (): void => {
        current.body = stringifyHintBody(bodyNodes);
        bodyNodes = [];
    };

    for (const node of root.children) {
        if (node.type !== 'heading') {
            bodyNodes.push(node);
            continue;
        }

        flushBody();

        const hint = parseHeading(node);

        while (stack.length > 1 && stack.at(-1)!.level >= hint.level) {
            stack.pop();
        }

        stack.at(-1)!.children.push(hint);
        stack.push(hint);
        current = hint;
    }

    flushBody();
}

// A directory whose name ends in `.hint` (e.g. `packages.hint/`) is a detached hint store: its hints
// describe the matching real path with the `.hint` tail removed. This lets hints live in a separate
// tree — kept out of, or gitignored from, the folder they document. Strip the suffix from every
// directory segment of the derived target path so `packages.hint/db/schema.ts.hint` describes
// `packages/db/schema.ts`, and the folder hint `os.hint/_.hint` describes `os`.
function stripHintFolderTails(relativeTargetPath: string, isFolderHint: boolean): string {
    const segments = relativeTargetPath.split(Path.sep);

    // For a file hint the last segment is the target file itself, which keeps any `.hint` in its name;
    // every other segment is a folder. For a folder hint every segment, the last included, is a folder.
    const lastFolderIndex = isFolderHint ? segments.length - 1 : segments.length - 2;

    return segments
        .map((segment, index) => (index <= lastFolderIndex && segment.endsWith(HINT_EXT) ? segment.slice(0, -HINT_EXT.length) : segment))
        .join(Path.sep);
}

function hintName(projectRootPath: string, hintPath: string, isFolderHint: boolean): string {
    const targetPath = isFolderHint ? Path.dirname(hintPath) : hintPath.slice(0, -HINT_EXT.length);
    const relativeTargetPath = Path.relative(projectRootPath, targetPath);

    return stripHintFolderTails(relativeTargetPath, isFolderHint) || '.';
}

async function parseHint(projectRootPath: string, hintFile: HintFileData, dryRun: boolean): Promise<HintData | null> {
    const content = await readHintContent(hintFile.path, dryRun);

    if (content === null) {
        return null;
    }

    const isFolderHint = Path.basename(hintFile.path) === FOLDER_HINT;

    const hint: HintData = {
        level: 0,
        keyword: isFolderHint ? RUNNING_FOLDER : RUNNING_FILE,
        id: '',
        name: hintName(projectRootPath, hintFile.path, isFolderHint),
        body: '',
        children: [],
    };

    parseHeadings(await parseHintContent(hintFile.path, content, projectRootPath), hint);

    for (const childFile of hintFile.children) {
        const childHint = await parseHint(projectRootPath, childFile, dryRun);

        if (childHint) {
            hint.children.push(childHint);
        }
    }

    return hint;
}

export async function parseHints(projectRootPath: string, paths: string[], dryRun: boolean): Promise<HintData[]> {
    const hintFiles = await findHints(projectRootPath, paths);

    const hints: HintData[] = [];

    for (const hintFile of hintFiles) {
        const hint = await parseHint(projectRootPath, hintFile, dryRun);

        if (hint) {
            hints.push(hint);
        }
    }

    return hints;
}
