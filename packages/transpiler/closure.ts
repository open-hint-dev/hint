import * as Path from 'node:path';

import type { HintData } from './parser.js';
import { isPathExists } from './helper.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import { parseHints } from './parser.js';

const HINT_EXT = '.hint';

// Cheap guard before touching the filesystem: a real cross-file reference names a path, which contains
// a separator or a dot (extension). Keyword names like `executeLogin` or `Credentials` never do, so they
// are skipped without a stat — the filesystem check below is what ultimately decides a reference.
function looksLikePath(name: string): boolean {
    return name.includes('/') || name.includes('.');
}

function isSubHint(hint: HintData): boolean {
    return hint.keyword === RUNNING_FILE || hint.keyword === RUNNING_FOLDER;
}

// Resolves a block name to the companion hint of the file it references, or null when it names no real
// file. Tries the project root first, then the referencing file's own folder; the target's companion is
// `<path>.hint`. References escaping the project root are ignored.
async function resolveReferenceHintPath(projectRootPath: string, baseDir: string, ref: string): Promise<string | null> {
    const candidates = [
        Path.resolve(projectRootPath, ref),
        Path.resolve(projectRootPath, baseDir, ref),
    ];

    for (const candidate of candidates) {
        if (!candidate.startsWith(projectRootPath)) {
            continue;
        }

        const hintPath = candidate.endsWith(HINT_EXT) ? candidate : `${candidate}${HINT_EXT}`;

        if (await isPathExists(hintPath)) {
            return hintPath;
        }
    }

    return null;
}

// Walks a parsed tree and collects the companion-hint paths of every file referenced by a block name —
// e.g. a `# read src/tokens.ts` block pulls in `src/tokens.ts.hint`. References resolve relative to the
// project root or to the referencing file's folder.
async function collectReferenceTargets(projectRootPath: string, hints: HintData[]): Promise<Set<string>> {
    const targets = new Set<string>();

    const visitBlock = async (block: HintData, baseDir: string): Promise<void> => {
        if (block.name && looksLikePath(block.name)) {
            const hintPath = await resolveReferenceHintPath(projectRootPath, baseDir, block.name);

            if (hintPath) {
                targets.add(hintPath);
            }
        }

        for (const child of block.children) {
            await visitBlock(child, baseDir);
        }
    };

    const walk = async (nodes: HintData[]): Promise<void> => {
        for (const node of nodes) {
            const baseDir = node.keyword === RUNNING_FILE ? Path.dirname(node.name) : node.name === '.' ? '' : node.name;

            for (const child of node.children) {
                if (isSubHint(child)) {
                    continue;
                }

                await visitBlock(child, baseDir === '.' ? '' : baseDir);
            }

            await walk(node.children.filter(isSubHint));
        }
    };

    await walk(hints);

    return targets;
}

// Expands the requested paths with the transitive closure of the files they reference, so a single
// compilation carries every referenced spec with its shared ancestors emitted once — instead of the
// agent re-invoking `hint` per file and re-paying for the same folder/root context each time.
export async function resolveClosurePaths(projectRootPath: string, paths: string[]): Promise<string[]> {
    const resultPaths = [...paths];
    const seenHintPaths = new Set<string>();

    let frontier = paths;

    while (frontier.length > 0) {
        const hints = await parseHints(projectRootPath, frontier, false);
        const targets = await collectReferenceTargets(projectRootPath, hints);

        const next: string[] = [];

        for (const hintPath of targets) {
            if (seenHintPaths.has(hintPath)) {
                continue;
            }

            seenHintPaths.add(hintPath);
            resultPaths.push(hintPath);
            next.push(hintPath);
        }

        frontier = next;
    }

    return resultPaths;
}
