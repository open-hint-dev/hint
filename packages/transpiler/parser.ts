import * as FsPromises from 'node:fs/promises';
import Path from 'node:path';

import type { Heading, Root, RootContent } from 'mdast';
// @ts-ignore - no types available
import { includeMarkdown } from '@hashicorp/platform-remark-plugins';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkCustomHeaderId from 'remark-custom-header-id';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import * as Unified from 'unified';

import { isGlobPattern, isPathExists, isPathFolder } from './helper.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';

const HINT_EXT = '.hint';
const FOLDER_HINT = `_${HINT_EXT}`;

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
    if (await isPathExists(path)) {
        return FsPromises.readFile(path, 'utf-8');
    }

    if (Path.basename(path) === FOLDER_HINT) {
        return '';
    }

    if (dryRun) {
        throw new Error(`Hint file not found: ${path}`);
    }

    return null;
}

async function parseHintContent(path: string, content: string): Promise<Root> {
    const processor = Unified.unified()
        .use(remarkParse)
        .use(remarkCustomHeaderId)
        .use(includeMarkdown, { resolveFrom: Path.dirname(path) });

    return (await processor.run(processor.parse(content))) as Root;
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

function hintName(projectRootPath: string, hintPath: string, isFolderHint: boolean): string {
    const targetPath = isFolderHint ? Path.dirname(hintPath) : hintPath.slice(0, -HINT_EXT.length);

    return Path.relative(projectRootPath, targetPath) || '.';
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

    parseHeadings(await parseHintContent(hintFile.path, content), hint);

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
