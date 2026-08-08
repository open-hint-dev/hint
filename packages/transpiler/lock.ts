import * as Crypto from 'node:crypto';
import * as Path from 'node:path';

import * as YAML from 'yaml';

import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { findInstruction } from './compiler.js';
import { readFile, writeFile } from './helper.js';
import { RUNNING_FILE, RUNNING_FOLDER, RUNNING_FOOTER, RUNNING_HEADER } from './hintbook.js';

export const LOCK_FILE = 'hint.lock';
// Bumped to 2 when the file hash began folding in the vocabulary each file uses (see effectiveFileHashes),
// replacing the old top-level `books` version fingerprint. Old (v1) locks simply read as stale once.
export const LOCK_VERSION = 2;

// Block path (the `keyword name` chain from the file root) -> the block's own-content hash. Lets a
// stale file be diffed block by block, so a fix can target exactly what drifted instead of the whole file.
export type BlockHashes = Record<string, string>;

// One generated target: `hash` captures its spec plus the inherited folder/root context AND the vocabulary
// it uses (the resolved instruction content of every keyword in its chain, plus the mode wrappers — so a
// change to what a keyword *means* invalidates exactly the files that use it, with no separate book-version
// fingerprint). `target` is the content hash of the generated output at lock time (so the code changing
// underneath an unchanged spec is detectable — drift is bidirectional), and `blocks` records each declared
// spec block so drift can be localized. `target` is optional: absent for entries locked before an output
// existed, or carried over from an older lock, in which case freshness falls back to output-existence only.
export type LockEntry = {
    hash: string;
    target?: string;
    blocks?: BlockHashes;
};

export type LockData = {
    // Lock format version, so the shape can evolve without silently misreading old files.
    version: number;
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

// Every keyword used in a subtree (recursively), excluding the file/folder wrappers. These are the
// keywords whose instruction content shapes the compiled prompt for the file that owns the subtree.
function collectKeywords(nodes: HintData[], into: Set<string>): void {
    for (const node of nodes) {
        if (isSubHint(node)) {
            continue;
        }

        into.add(node.keyword);
        collectKeywords(node.children, into);
    }
}

// Hash of one keyword's contribution to the compiled prompt: its resolved instruction content and whether
// it is excluded. Deliberately ignores `description`/`synonyms`/`surface` — those never change the output,
// so touching them must NOT invalidate a lock. An unknown keyword (no instruction) contributes a stable
// empty marker; adding an instruction for it later changes the hash, since the output would then change.
function keywordVocabPart(keyword: string, hintbooks: HintbookData[]): string {
    const instruction = findInstruction(hintbooks, keyword);

    return `${keyword}\0${instruction?.content ?? ''}\0${instruction?.metadata?.exclude ? '1' : '0'}`;
}

// Content of the mode wrappers that render around (nearly) every file — header, footer, and the file/folder
// path frames. A change to any of these shifts the prompt for every target, so it is folded into every
// file's vocab hash. Conditional wrappers (`__system__` for --standalone, `__changes__` for fix mode) are
// excluded: they are not part of the canonical implementation-mode output a lock records.
function wrapperVocabHash(hintbooks: HintbookData[]): string {
    const parts = [
        RUNNING_HEADER,
        RUNNING_FOOTER,
        RUNNING_FILE,
        RUNNING_FOLDER,
    ].map((name) => findInstruction(hintbooks, name)?.content ?? '');

    return Crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
}

// The vocabulary hash of every file target: for each file, the resolved instruction content of every
// keyword in its chain (its own blocks plus every ancestor folder's own blocks) combined with the shared
// wrapper hash. This is what replaces the old book-version fingerprint — a keyword's meaning changing
// invalidates exactly the files that use it, an in-place edit to a `file://` book is caught, and a change
// to an unused keyword (or to non-rendering metadata like `surface`) invalidates nothing.
export function hashFileVocab(hints: HintData[], hintbooks: HintbookData[]): FileHash[] {
    const wrapper = wrapperVocabHash(hintbooks);
    const fileHashes: FileHash[] = [];

    const hashFor = (keywords: Set<string>): string => {
        const parts = [...keywords].sort().map((keyword) => keywordVocabPart(keyword, hintbooks));

        return Crypto.createHash('sha256')
            .update(`${wrapper}\0${parts.join('\0')}`)
            .digest('hex');
    };

    const walk = (nodes: HintData[], inherited: Set<string>): void => {
        for (const node of nodes) {
            if (node.keyword === RUNNING_FILE) {
                const keywords = new Set(inherited);
                collectKeywords(node.children, keywords);
                fileHashes.push({ name: node.name, hash: hashFor(keywords) });
                continue;
            }

            if (node.keyword === RUNNING_FOLDER) {
                const keywords = new Set(inherited);
                collectKeywords(
                    node.children.filter((child) => !isSubHint(child)),
                    keywords,
                );
                walk(node.children.filter(isSubHint), keywords);
            }
        }
    };

    walk(hints, new Set());

    return fileHashes;
}

// The full effective hash of every file target: its spec-and-inherited-context hash combined with the
// vocabulary it uses. This is the value recorded in the lock and compared on every gated run — so a file is
// fresh only while both its spec and the meaning of every keyword it uses are unchanged.
export function effectiveFileHashes(hints: HintData[], hintbooks: HintbookData[]): FileHash[] {
    const vocab = new Map(
        hashFileVocab(hints, hintbooks).map((file) => [
            file.name,
            file.hash,
        ]),
    );

    return hashFileHints(hints).map((file) => ({
        name: file.name,
        hash: combineHash(file.hash, vocab.get(file.name) ?? ''),
    }));
}

// Own-content hash of a single block, excluding its children — so a change localizes to exactly the
// block whose keyword, name, or body changed rather than rippling up through its ancestors.
function blockContentHash(hint: HintData): string {
    return Crypto.createHash('sha256').update(`${hint.level}\0${hint.keyword}\0${hint.id}\0${hint.name}\0${hint.body}`).digest('hex');
}

function blockKeySegment(hint: HintData): string {
    return hint.name ? `${hint.keyword} ${hint.name}` : hint.keyword;
}

// Flat map of block-path -> own-content hash for a file node's declared blocks (its heading children,
// excluding nested file/folder wrappers). Keys are the `keyword name` chain from the file root, e.g.
// `func executeLogin > flow`; colliding keys get a numeric suffix so every block stays addressable.
export function hashFileBlocks(fileNode: HintData): BlockHashes {
    const blocks: BlockHashes = {};

    // The file's preamble (content before its first heading) lives in the file node's own body, so it is
    // tracked as a block in its own right — a preamble edit is a real spec change, not inherited drift.
    if (fileNode.body) {
        blocks['(preamble)'] = blockContentHash({ ...fileNode, children: [] });
    }

    const walk = (nodes: HintData[], prefix: string): void => {
        for (const node of nodes) {
            if (isSubHint(node)) {
                continue;
            }

            const base = prefix ? `${prefix} > ${blockKeySegment(node)}` : blockKeySegment(node);

            let key = base;
            let suffix = 2;

            while (key in blocks) {
                key = `${base} #${suffix++}`;
            }

            blocks[key] = blockContentHash(node);
            walk(node.children, key);
        }
    };

    walk(fileNode.children, '');

    return blocks;
}

// Every file target in the tree paired with its parsed node, so callers can hash or diff a file's blocks.
export function collectFileNodes(hints: HintData[]): { name: string; node: HintData }[] {
    const files: { name: string; node: HintData }[] = [];

    const walk = (nodes: HintData[]): void => {
        for (const node of nodes) {
            if (node.keyword === RUNNING_FILE) {
                files.push({ name: node.name, node });
            } else if (node.keyword === RUNNING_FOLDER) {
                walk(node.children.filter(isSubHint));
            }
        }
    };

    walk(hints);

    return files;
}

export type BlockDiff = {
    changed: string[];
    added: string[];
    removed: string[];
};

export function diffFileBlocks(previous: BlockHashes, current: BlockHashes): BlockDiff {
    const changed: string[] = [];
    const added: string[] = [];

    for (const key of Object.keys(current)) {
        if (!(key in previous)) {
            added.push(key);
        } else if (previous[key] !== current[key]) {
            changed.push(key);
        }
    }

    const removed = Object.keys(previous).filter((key) => !(key in current));

    return {
        changed: changed.sort(),
        added: added.sort(),
        removed: removed.sort(),
    };
}

export type FileDriftStatus = 'fresh' | 'new' | 'inherited' | 'blocks' | 'drifted-output';

export type FileDrift = {
    name: string;
    status: FileDriftStatus;
    diff?: BlockDiff;
};

// Classifies every file target against the lock: `fresh` (unchanged), `new` (never locked), `blocks`
// (its own declared blocks drifted — carries the diff), `inherited` (stale only because ancestor context
// or the vocabulary it uses changed), or `drifted-output` (spec unchanged but the generated code was edited
// since it was locked). Output drift is only reported when `targetHashes` is supplied and the entry recorded
// an output hash — the caller reads the files on disk.
export function computeDrift(hints: HintData[], lock: LockData, hintbooks: HintbookData[], targetHashes?: Map<string, string | null>): FileDrift[] {
    const effective = new Map(
        effectiveFileHashes(hints, hintbooks).map((file) => [
            file.name,
            file.hash,
        ]),
    );

    return collectFileNodes(hints).map(({ name, node }): FileDrift => {
        const entry = lock.files[name];

        if (!entry) {
            return { name, status: 'new' };
        }

        if (entry.hash === effective.get(name)) {
            // Spec unchanged. If the caller read the output and it no longer matches what was locked, the
            // code drifted underneath a stable spec — surface it rather than reporting fresh.
            if (targetHashes && entry.target !== undefined) {
                const targetHash = targetHashes.get(name);

                if (targetHash != null && targetHash !== entry.target) {
                    return { name, status: 'drifted-output' };
                }
            }

            return { name, status: 'fresh' };
        }

        const diff = diffFileBlocks(entry.blocks ?? {}, hashFileBlocks(node));
        const hasBlockChanges = diff.changed.length > 0 || diff.added.length > 0 || diff.removed.length > 0;

        return hasBlockChanges ? { name, status: 'blocks', diff } : { name, status: 'inherited' };
    });
}

// Renders drift as agent-facing guidance: which files are new, which changed only through inherited
// context, and — for the rest — exactly which blocks to reconcile. Fresh files are omitted.
export function formatDrift(drift: FileDrift[]): string {
    const lines: string[] = [];

    for (const file of drift) {
        if (file.status === 'fresh') {
            continue;
        }

        if (file.status === 'new') {
            lines.push(`- ${file.name}: new target — implement it in full.`);
            continue;
        }

        if (file.status === 'inherited') {
            lines.push(`- ${file.name}: inherited context or vocabulary changed — re-verify the whole file against the spec.`);
            continue;
        }

        if (file.status === 'drifted-output') {
            lines.push(
                `- ${file.name}: output changed since it was generated — re-verify it against the unchanged spec, then \`hint lock\` (or --force to regenerate from the spec).`,
            );
            continue;
        }

        lines.push(`- ${file.name}: reconcile these blocks, leave the rest untouched:`);

        for (const key of file.diff!.changed) {
            lines.push(`    - changed: ${key}`);
        }

        for (const key of file.diff!.added) {
            lines.push(`    - added: ${key}`);
        }

        for (const key of file.diff!.removed) {
            lines.push(`    - removed: ${key}`);
        }
    }

    return lines.join('\n');
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

// Content hash of a generated target's bytes on disk, or null when the file does not exist. This is the
// output-side fingerprint — the counterpart to a spec's `hash` — that lets a stable spec whose code has
// been edited underneath it be detected as drifted rather than silently skipped.
export async function hashTargetFile(projectRootPath: string, name: string): Promise<string | null> {
    const content = await readFile(Path.join(projectRootPath, name));

    if (content === null) {
        return null;
    }

    return Crypto.createHash('sha256').update(content).digest('hex');
}

// The on-disk content hash of each named target (null when missing), for callers that report drift across
// a set of files without re-reading each one twice.
export async function hashTargetFiles(projectRootPath: string, names: string[]): Promise<Map<string, string | null>> {
    const hashes = new Map<string, string | null>();

    for (const name of names) {
        hashes.set(name, await hashTargetFile(projectRootPath, name));
    }

    return hashes;
}

// Target paths whose effective hash (spec + inherited context + vocabulary) is unchanged since the lock was
// written AND whose output still exists on disk AND — when the lock recorded one — still matches the output
// hash captured at lock time. i.e. nothing to regenerate. A change to the meaning of any keyword the file
// uses shifts its effective hash and drops it here; so does the output being edited underneath an unchanged
// spec. Entries with no recorded `target` fall back to existence only. Pass effective hashes as `fileHashes`.
export async function selectFreshTargets(projectRootPath: string, fileHashes: FileHash[], lock: LockData): Promise<Set<string>> {
    const fresh = new Set<string>();

    for (const { name, hash } of fileHashes) {
        const entry = lock.files[name];

        if (!entry || entry.hash !== hash) {
            continue;
        }

        const targetHash = await hashTargetFile(projectRootPath, name);

        if (targetHash === null) {
            continue;
        }

        // Output drifted since it was locked: the spec is unchanged but the generated file no longer matches.
        // Treat it as stale so it is recompiled/re-verified instead of skipped. Only enforced when the lock
        // recorded an output hash — older entries keep the existence-only behavior.
        if (entry.target !== undefined && entry.target !== targetHash) {
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
