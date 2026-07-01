import * as Crypto from 'node:crypto';
import * as Path from 'node:path';

import * as YAML from 'yaml';

import type { HintData } from './parser.js';
import { isPathExists, readFile, writeFile } from './helper.js';
import { resolveHintbookVersion, RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';

export const LOCK_FILE = 'hint.lock';
export const LOCK_VERSION = 1;

// One generated target: the hash captures its spec plus the inherited folder/root context,
// so editing an ancestor `_.hint` marks the file stale even when its own companion is untouched.
export type LockEntry = {
    hash: string;
};

export type LockData = {
    // Lock format version, so the shape can evolve without silently misreading old files.
    version: number;
    // Fingerprint of the registered hintbooks (name -> resolved version). Hintbooks define keyword
    // semantics, so any change here invalidates every entry — a books mismatch marks all files stale.
    books: Record<string, string>;
    // Target path (relative to the project root) -> its recorded hash.
    files: Record<string, LockEntry>;
};

export type FileHash = {
    // Target path relative to the project root — the same key used in the lock's `files` map.
    name: string;
    hash: string;
};

// True for the wrapper nodes that stand in for a nested file or folder, as opposed to the ordinary
// heading blocks a `_.hint`/companion declares. Used to split a node's own content from its context layers.
function isSubHint(hint: HintData): boolean {
    return hint.keyword === RUNNING_FILE || hint.keyword === RUNNING_FOLDER;
}

// Merkle hash of a block subtree: keyword, id, name, body, and the ordered hashes of its children.
// Stable under trivial markdown reformatting because `body` is already normalized by the parser's
// remark round-trip. Two blocks hash equal iff their parsed subtrees are structurally identical.
export function hashHint(hint: HintData): string {
    const hash = Crypto.createHash('sha256');

    hash.update(`${hint.level}\0${hint.keyword}\0${hint.id}\0${hint.name}\0${hint.body}\0`);

    for (const child of hint.children) {
        hash.update(hashHint(child));
        hash.update('\0');
    }

    return hash.digest('hex');
}

// Hash of a file/folder node's *own* declared blocks — its heading children only, excluding the
// nested file/folder wrappers (those are separate targets or context layers, folded in via the chain).
function ownHash(hint: HintData): string {
    const hash = Crypto.createHash('sha256');

    hash.update(`${hint.level}\0${hint.keyword}\0${hint.id}\0${hint.name}\0${hint.body}\0`);

    for (const child of hint.children) {
        if (isSubHint(child)) {
            continue;
        }

        hash.update(hashHint(child));
        hash.update('\0');
    }

    return hash.digest('hex');
}

function combineHash(chainHash: string, nodeHash: string): string {
    return Crypto.createHash('sha256').update(`${chainHash}\0${nodeHash}`).digest('hex');
}

// The effective hash of every file target in the tree. Each file's hash chains the `ownHash` of every
// folder from the root down to it, then its own content — so a change anywhere in the inherited context
// (root or folder `_.hint`) shifts the hash of the files beneath it, not just the file whose companion changed.
export function hashFileHints(hints: HintData[]): FileHash[] {
    const fileHashes: FileHash[] = [];

    const walk = (nodes: HintData[], chainHash: string): void => {
        for (const node of nodes) {
            if (node.keyword === RUNNING_FILE) {
                fileHashes.push({ name: node.name, hash: combineHash(chainHash, ownHash(node)) });
                continue;
            }

            if (node.keyword === RUNNING_FOLDER) {
                walk(node.children.filter(isSubHint), combineHash(chainHash, ownHash(node)));
            }
        }
    };

    walk(hints, '');

    return fileHashes;
}

// Drops file nodes whose target is not in `stale`, then drops any folder branch left with no stale file
// beneath it — so the compiled output carries only the files that need regenerating, with just the ancestor
// context needed to reach them (and shared ancestors still emitted once for multiple stale siblings).
export function pruneFreshHints(hints: HintData[], stale: Set<string>): HintData[] {
    const prune = (node: HintData): HintData | null => {
        if (node.keyword === RUNNING_FILE) {
            return stale.has(node.name) ? node : null;
        }

        if (node.keyword === RUNNING_FOLDER) {
            const ownBlocks = node.children.filter((child) => !isSubHint(child));
            const subHints = node.children
                .filter(isSubHint)
                .map(prune)
                .filter((child): child is HintData => child !== null);

            if (subHints.length === 0) {
                return null;
            }

            return {
                ...node,
                children: [
                    ...ownBlocks,
                    ...subHints,
                ],
            };
        }

        return node;
    };

    return hints.map(prune).filter((node): node is HintData => node !== null);
}

// name -> resolved version for each registered hintbook (empty string when a version cannot be read),
// forming the fingerprint stored in the lock and compared on every gated run.
export async function booksFingerprint(projectRootPath: string, books: string[]): Promise<Record<string, string>> {
    const fingerprint: Record<string, string> = {};

    for (const book of books) {
        fingerprint[book] = (await resolveHintbookVersion(projectRootPath, book)) ?? '';
    }

    return fingerprint;
}

export function booksMatch(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    if (keysA.length !== keysB.length) {
        return false;
    }

    return keysA.every((key, index) => key === keysB[index] && a[key] === b[key]);
}

// Target paths whose spec (with inherited context) is unchanged since the lock was written AND whose
// output still exists on disk — i.e. nothing to regenerate. A books-fingerprint mismatch marks all stale.
export async function selectFreshTargets(
    projectRootPath: string,
    fileHashes: FileHash[],
    lock: LockData,
    books: Record<string, string>,
): Promise<Set<string>> {
    const fresh = new Set<string>();

    if (!booksMatch(lock.books, books)) {
        return fresh;
    }

    for (const { name, hash } of fileHashes) {
        const entry = lock.files[name];

        if (!entry || entry.hash !== hash) {
            continue;
        }

        if (!(await isPathExists(Path.join(projectRootPath, name)))) {
            continue;
        }

        fresh.add(name);
    }

    return fresh;
}

export async function loadLock(projectRootPath: string): Promise<LockData | null> {
    const lockPath = Path.join(projectRootPath, LOCK_FILE);
    const content = await readFile(lockPath);

    if (content === null) {
        return null;
    }

    try {
        const data = YAML.parse(content) as Partial<LockData> | null;

        if (!data || typeof data !== 'object') {
            return null;
        }

        return {
            version: data.version ?? LOCK_VERSION,
            books: data.books ?? {},
            files: data.files ?? {},
        };
    } catch (err: unknown) {
        throw new Error(`Failed to read '${lockPath}': ${(err as Error).message}`);
    }
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
    return Object.fromEntries(
        Object.keys(record)
            .sort()
            .map((key) => [
                key,
                record[key]!,
            ]),
    );
}

export async function saveLock(projectRootPath: string, lock: LockData): Promise<void> {
    const lockPath = Path.join(projectRootPath, LOCK_FILE);
    // Sort keys so the lock is deterministic and diff-friendly regardless of insertion order.
    const ordered: LockData = {
        version: lock.version,
        books: sortRecord(lock.books),
        files: sortRecord(lock.files),
    };
    const body = YAML.stringify(ordered, { lineWidth: 0 });
    const content = `# hint.lock — managed by \`hint lock\`. Records which specs have been generated so\n# unchanged specs can be skipped. Deterministic and diff-friendly; do not edit by hand.\n${body}`;

    try {
        await writeFile(lockPath, content);
    } catch (err: unknown) {
        throw new Error(`Failed to write '${lockPath}': ${(err as Error).message}`);
    }
}
