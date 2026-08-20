import * as Path from 'node:path';

import type { HintData } from './parser.js';
import { isInsideProject, isPathExists } from './helper.js';
import { RUNNING_FILE } from './hintbook.js';
import { parseHintFiles } from './parser.js';
import { HINT_EXT } from './resolve.js';
import { isScopeNode as isSubHint } from './tree.js';

// Cheap guard before touching the filesystem: a real cross-file reference names a path, which contains
// a separator or a dot (extension). Keyword names like `executeLogin` or `Credentials` never do, so they
// are skipped without a stat — the filesystem check below is what ultimately decides a reference.
export function looksLikePath(name: string): boolean {
    return name.includes('/') || name.includes('.');
}

// Resolves a block name to the companion hint of the file it references, or null when it names no real
// file. Tries the project root first, then the referencing file's own folder; the target's companion is
// `<path>.hint`. References escaping the project root are ignored.
export async function resolveReferenceHintPath(projectRootPath: string, baseDir: string, ref: string): Promise<string | null> {
    const candidates = [
        Path.resolve(projectRootPath, ref),
        Path.resolve(projectRootPath, baseDir, ref),
    ];

    for (const candidate of candidates) {
        if (!isInsideProject(projectRootPath, candidate)) {
            continue;
        }

        const hintPaths = candidate.endsWith(HINT_EXT)
            ? [candidate]
            : [`${candidate}${HINT_EXT}`, Path.join(candidate, `_${HINT_EXT}`)];

        for (const hintPath of hintPaths) {
            if (await isPathExists(hintPath)) return hintPath;
        }
    }

    return null;
}

// Walks a parsed tree and collects the companion-hint paths of every file referenced by a block name —
// e.g. a `# read src/tokens.ts` block pulls in `src/tokens.ts.hint`. References resolve relative to the
// project root or to the referencing file's folder.
export type ReferenceEdge = { from: string; ref: string; to: string | null; line?: number };

export async function collectReferenceEdges(projectRootPath: string, hints: HintData[]): Promise<ReferenceEdge[]> {
    const edges: ReferenceEdge[] = [];

    const visitBlock = async (block: HintData, baseDir: string, from: string): Promise<void> => {
        if (block.name && looksLikePath(block.name)) {
            const hintPath = await resolveReferenceHintPath(projectRootPath, baseDir, block.name);
            edges.push({ from, ref: block.name, to: hintPath, line: block.line });
        }

        for (const child of block.children) {
            await visitBlock(child, baseDir, from);
        }
    };

    const walk = async (nodes: HintData[]): Promise<void> => {
        for (const node of nodes) {
            const baseDir = node.keyword === RUNNING_FILE ? Path.dirname(node.name) : node.name === '.' ? '' : node.name;
            const from = node.keyword === RUNNING_FILE
                ? `${Path.resolve(projectRootPath, node.name)}${HINT_EXT}`
                : Path.join(projectRootPath, node.name === '.' ? '' : node.name, `_${HINT_EXT}`);

            for (const child of node.children) {
                if (isSubHint(child)) {
                    continue;
                }

                await visitBlock(child, baseDir === '.' ? '' : baseDir, from);
            }

            await walk(node.children.filter(isSubHint));
        }
    };

    await walk(hints);

    return edges;
}

export type ClosureOptions = { depth?: number };
export type ClosureResult = { paths: string[]; trimmed: string[] };

// Expands the requested paths with the transitive closure of the files they reference, so a single
// compilation carries every referenced spec with its shared ancestors emitted once — instead of the
// agent re-invoking `hint` per file and re-paying for the same folder/root context each time.
export async function resolveClosure(projectRootPath: string, hintPaths: string[], options: ClosureOptions = {}): Promise<ClosureResult> {
    const resultPaths = [...hintPaths];
    const seenHintPaths = new Set<string>(hintPaths);
    const trimmed = new Set<string>();
    const maximumDepth = options.depth === undefined ? Number.POSITIVE_INFINITY : Math.max(0, options.depth);

    let frontier = hintPaths;
    let depth = 0;

    while (frontier.length > 0) {
        const hints = await parseHintFiles(projectRootPath, frontier);
        const edges = await collectReferenceEdges(projectRootPath, hints);
        const targets = new Map(edges.filter((edge) => edge.to).map((edge) => [edge.to!, edge.ref]));

        const next: string[] = [];

        for (const [hintPath, ref] of targets) {
            if (seenHintPaths.has(hintPath)) {
                continue;
            }

            if (depth >= maximumDepth) {
                trimmed.add(ref);
                continue;
            }

            seenHintPaths.add(hintPath);
            resultPaths.push(hintPath);
            next.push(hintPath);
        }

        frontier = next;
        depth += 1;
    }

    return { paths: resultPaths, trimmed: [...trimmed].sort() };
}

export async function resolveClosurePaths(projectRootPath: string, hintPaths: string[], options: ClosureOptions = {}): Promise<string[]> {
    return (await resolveClosure(projectRootPath, hintPaths, options)).paths;
}
