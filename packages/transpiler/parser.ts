import * as FsPromises from 'node:fs/promises';
import Path from 'node:path';

import type { Heading, Root, RootContent } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkCustomHeaderId from 'remark-custom-header-id';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import * as Unified from 'unified';

import { HINTBOOKS_FOLDER, isPathExists, readFile } from './helper.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import { FOLDER_HINT, HINT_EXT, hintTargetName, isFolderHintPath, normalizeHintPaths } from './resolve.js';

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
    return findHintFiles(projectRootPath, await normalizeHintPaths(projectRootPath, paths));
}

// Builds the nesting tree from hint paths that are already normalized — the shape `resolveRequests`
// hands back, so resolution happens once instead of again per command.
export function findHintFiles(projectRootPath: string, hintPaths: string[]): HintFileData[] {
    const sortedHintPaths = sortHintPaths([...new Set(hintPaths)]);

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

// A hint file that is not on disk contributes nothing. A folder hint reads as empty instead of absent
// so an intermediate folder without its own `_.hint` still nests its children. Whether a caller
// *asked* for a spec that does not exist is decided in `resolve.ts`, not here — the parser has no
// opinion about intent.
async function readHintContent(path: string): Promise<string | null> {
    const content = await readFile(path);

    if (content !== null) {
        return content;
    }

    return isFolderHintPath(path) ? '' : null;
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

async function parseHint(projectRootPath: string, hintFile: HintFileData): Promise<HintData | null> {
    const content = await readHintContent(hintFile.path);

    if (content === null) {
        return null;
    }

    const hint: HintData = {
        level: 0,
        keyword: isFolderHintPath(hintFile.path) ? RUNNING_FOLDER : RUNNING_FILE,
        id: '',
        name: hintTargetName(projectRootPath, hintFile.path),
        body: '',
        children: [],
    };

    parseHeadings(await parseHintContent(hintFile.path, content, projectRootPath), hint);

    for (const childFile of hintFile.children) {
        const childHint = await parseHint(projectRootPath, childFile);

        if (childHint) {
            hint.children.push(childHint);
        }
    }

    return hint;
}

// Parses a single hint file in isolation — no folder closure, no referenced child files pulled in.
// Unlike `parseHints`, which builds the nested compile closure, this returns exactly one document
// for the given file, which is what a per-file index (search, listings) needs. `hintPath` must be
// absolute. Returns null when the file does not exist.
export async function parseHintFile(projectRootPath: string, hintPath: string): Promise<HintData | null> {
    return parseHint(projectRootPath, { path: hintPath, children: [] });
}

// Enumerates every `.hint` file in the project, skipping dependency and hintbook stores. Paths are
// returned relative to `projectRootPath`.
export async function listHintFiles(projectRootPath: string): Promise<string[]> {
    const ignored = [
        'node_modules',
        '.git',
        HINTBOOKS_FOLDER,
    ];
    const results: string[] = [];

    for await (const match of FsPromises.glob(`**/*${HINT_EXT}`, { cwd: projectRootPath })) {
        const segments = match.split(Path.sep);

        if (segments.some((segment) => ignored.includes(segment))) {
            continue;
        }

        results.push(match);
    }

    return results.sort();
}

// Parses an already-resolved set of hint paths into the nested context tree. This is the form
// commands use, so path resolution stays in `resolve.ts` and is reported on rather than repeated.
export async function parseHintFiles(projectRootPath: string, hintPaths: string[]): Promise<HintData[]> {
    const hints: HintData[] = [];

    for (const hintFile of findHintFiles(projectRootPath, hintPaths)) {
        const hint = await parseHint(projectRootPath, hintFile);

        if (hint) {
            hints.push(hint);
        }
    }

    return hints;
}

export async function parseHints(projectRootPath: string, paths: string[]): Promise<HintData[]> {
    return parseHintFiles(projectRootPath, await normalizeHintPaths(projectRootPath, paths));
}

// How many scopes a parsed tree actually carries, split by kind. Folder scopes count: a repository
// whose knowledge lives entirely in `_.hint` files has no file targets at all, and a breadth guard
// that only counted files would never fire there.
export function countScopes(hints: HintData[]): { files: number; folders: number } {
    let files = 0;
    let folders = 0;

    const walk = (nodes: HintData[]): void => {
        for (const node of nodes) {
            if (node.keyword === RUNNING_FILE) {
                files += 1;
            } else if (node.keyword === RUNNING_FOLDER) {
                folders += 1;
            }

            walk(node.children);
        }
    };

    walk(hints);

    return { files, folders };
}
