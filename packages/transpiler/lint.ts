import * as Path from 'node:path';

import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { collectReferenceEdges } from './closure.js';
import { isPathExists } from './helper.js';
import { RUNNING_FILE, RUNNING_FOLDER, vocabularyBooks } from './hintbook.js';
import { listHintFiles, parseHintFile, parseHintFiles } from './parser.js';
import { repositoryPath } from './git.js';
import { hintTargetName } from './resolve.js';
import { searchHints } from './search.js';

export type LintFinding = {
    kind: 'vocab' | 'include' | 'duplicate-id' | 'empty' | 'dead-ref' | 'orphan' | 'duplicate-name' | 'near-name' | 'relation' | 'conflict' | 'similar';
    severity: 'finding' | 'info';
    hint: string;
    line?: number;
    detail: string;
    suggestion?: string;
};

function editDistance(a: string, b: string): number {
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let ai = 1; ai <= a.length; ai++) {
        const current = [ai];
        for (let bi = 1; bi <= b.length; bi++) {
            current[bi] = Math.min(current[bi - 1]! + 1, previous[bi]! + 1, previous[bi - 1]! + (a[ai - 1] === b[bi - 1] ? 0 : 1));
        }
        previous.splice(0, previous.length, ...current);
    }

    return previous[b.length]!;
}

export function nearestKeyword(keyword: string, hintbooks: HintbookData[]): string | null {
    const candidates = new Map<string, string>();

    for (const book of vocabularyBooks(hintbooks)) {
        for (const instruction of book.instructions) {
            candidates.set(instruction.name, instruction.name);
            for (const synonym of instruction.metadata?.synonyms ?? []) candidates.set(synonym, instruction.name);
        }
    }

    if (candidates.has(keyword)) return null;

    const lower = keyword.toLowerCase();
    const exact = [...candidates].find(([candidate]) => candidate.toLowerCase() === lower);
    if (exact) return exact[1];

    const limit = [...keyword].length >= 5 ? 2 : 1;
    const ranked = [...candidates]
        .map(([candidate, canonical]) => ({ candidate, canonical, distance: editDistance(lower, candidate.toLowerCase()) }))
        .filter((entry) => entry.distance <= limit)
        .sort((a, b) => a.distance - b.distance || (a.candidate < b.candidate ? -1 : 1));

    return ranked[0]?.canonical ?? null;
}

function analyze(hintPath: string, root: HintData, hintbooks: HintbookData[], strictVocabulary: boolean): LintFinding[] {
    const findings: LintFinding[] = [];
    const ids = new Map<string, number>();
    const known = new Set<string>();

    for (const book of vocabularyBooks(hintbooks)) {
        for (const instruction of book.instructions) {
            known.add(instruction.name);
            for (const synonym of instruction.metadata?.synonyms ?? []) known.add(synonym);
        }
    }

    const walk = (nodes: HintData[]): void => {
        for (const node of nodes) {
            if (node.id) {
                const previous = ids.get(node.id);
                if (previous !== undefined) {
                    findings.push({
                        kind: 'duplicate-id', severity: 'finding', hint: hintPath, line: node.line,
                        detail: `duplicate {#${node.id}}; first declared on line ${previous}`,
                    });
                } else ids.set(node.id, node.line ?? 0);
            }

            if (!known.has(node.keyword)) {
                const suggestion = nearestKeyword(node.keyword, hintbooks);
                findings.push({
                    kind: 'vocab',
                    severity: suggestion || strictVocabulary ? 'finding' : 'info',
                    hint: hintPath,
                    line: node.line,
                    detail: suggestion
                        ? `'${node.keyword}' matched no keyword — did you mean '${suggestion}'?`
                        : `'${node.keyword}' is not in the registered vocabulary`,
                    suggestion: suggestion ?? undefined,
                });
            }

            walk(node.children);
        }
    };

    walk(root.children);

    if (root.children.length === 0 && root.body.trim() === '') {
        findings.push({ kind: 'empty', severity: 'finding', hint: hintPath, detail: 'file contains no blocks or preamble' });
    }

    return findings;
}

type NamedBlock = { hint: string; name: string; id: string; line?: number };

type ScopedBlock = NamedBlock & { keyword: string; attrs: Record<string, string>; scopeDepth: number; scope: string; source?: string };

function scopedBlocks(roots: HintData[]): ScopedBlock[] {
    const blocks: ScopedBlock[] = [];
    const walk = (nodes: HintData[], scopeDepth: number, hint = '', scope = '.'): void => {
        for (const node of nodes) {
            if (node.keyword === RUNNING_FILE || node.keyword === RUNNING_FOLDER) {
                const nextHint = node.source?.split(':')[0] ?? hint;
                walk(node.children, scopeDepth + 1, nextHint, node.name);
            } else {
                blocks.push({ hint: node.source?.split(':')[0] ?? hint, name: node.name, id: node.id, line: node.line, keyword: node.keyword, attrs: node.attrs ?? {}, scopeDepth, scope, source: node.source });
                walk(node.children, scopeDepth, hint, scope);
            }
        }
    };
    walk(roots, 0);
    return blocks;
}

async function analyzeRelations(projectRootPath: string, hintPaths: string[], parsedRepository?: HintData[]): Promise<LintFinding[]> {
    let repositoryRoots = parsedRepository;
    if (!repositoryRoots) {
        const allPaths = (await listHintFiles(projectRootPath)).map((path) => Path.join(projectRootPath, path));
        const validPaths: string[] = [];
        for (const path of allPaths) {
            try {
                await parseHintFile(projectRootPath, path);
                validPaths.push(path);
            } catch {
                // Broken includes are reported by the ordinary lint pass; relations remain per-file tolerant.
            }
        }
        repositoryRoots = await parseHintFiles(projectRootPath, validPaths);
    }
    const repositoryBlocks = scopedBlocks(repositoryRoots);
    const repositoryIds = new Set(repositoryBlocks.map((block) => block.id).filter(Boolean));
    const byId = new Map(repositoryBlocks.filter((block) => block.id).map((block) => [block.id, block]));
    const selected = new Set(hintPaths.map((path) => repositoryPath(projectRootPath, path)));
    const findings = new Map<string, LintFinding>();

    const add = (finding: LintFinding): void => {
        findings.set(`${finding.kind}\0${finding.hint}\0${finding.line ?? 0}\0${finding.detail}`, finding);
    };

    const isAncestorScope = (ancestor: string, descendant: string): boolean =>
        ancestor !== descendant && (ancestor === '.' || descendant.startsWith(`${ancestor}/`));

    for (const block of repositoryBlocks.filter((candidate) => selected.has(candidate.hint))) {
            const overrides = block.attrs.overrides;
            if (overrides) {
                const target = byId.get(overrides);
                if (!target) {
                    add({ kind: 'relation', severity: 'finding', hint: block.hint, line: block.line, detail: `overrides target {#${overrides}} was not found in this compile chain` });
                } else if (target.scopeDepth >= block.scopeDepth || !isAncestorScope(target.scope, block.scope)) {
                    add({ kind: 'relation', severity: 'finding', hint: block.hint, line: block.line, detail: `only an ancestor scope can be overridden; {#${overrides}} is not strictly shallower` });
                }
            }

            const supersedes = block.attrs.supersedes;
            if (supersedes && repositoryIds.has(supersedes)) {
                add({ kind: 'relation', severity: 'finding', hint: block.hint, line: block.line, detail: `superseded block {#${supersedes}} still exists — delete it or drop the relation` });
            }
    }

    const conflictGroups = new Map<string, ScopedBlock[]>();
    for (const block of repositoryBlocks) {
        const normalizedName = block.name.trim().replace(/\s+/g, ' ').toLowerCase();
        const key = `${block.keyword}\0${normalizedName}`;
        conflictGroups.set(key, [...(conflictGroups.get(key) ?? []), block]);
    }
    for (const group of conflictGroups.values()) {
        for (let left = 0; left < group.length; left++) {
            for (let right = left + 1; right < group.length; right++) {
                const a = group[left]!;
                const b = group[right]!;
                if (!selected.has(a.hint) && !selected.has(b.hint)) continue;
                if (a.scopeDepth === b.scopeDepth) continue;
                if (!isAncestorScope(a.scope, b.scope) && !isAncestorScope(b.scope, a.scope)) continue;
                if ((a.id && b.attrs.overrides === a.id) || (b.id && a.attrs.overrides === b.id)) continue;
                const narrower = a.scopeDepth > b.scopeDepth ? a : b;
                add({ kind: 'conflict', severity: 'info', hint: narrower.hint, line: narrower.line, detail: `possible conflict: ${a.name} (${a.source ?? a.hint}) and ${b.name} (${b.source ?? b.hint}); add overrides= to the narrower one if intentional` });
            }
        }
    }

    const relationGraph = new Map<string, string[]>();
    for (const block of repositoryBlocks.filter((candidate) => candidate.id)) {
        relationGraph.set(block.id, [block.attrs.overrides, block.attrs.supersedes].filter((value): value is string => Boolean(value)));
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string, trail: string[]): void => {
        if (visiting.has(id)) {
            const block = byId.get(id)!;
            add({ kind: 'relation', severity: 'finding', hint: block.hint, line: block.line, detail: `relation cycle: ${[...trail, id].join(' -> ')}` });
            return;
        }
        if (visited.has(id)) return;
        visiting.add(id);
        for (const target of relationGraph.get(id) ?? []) if (relationGraph.has(target)) visit(target, [...trail, id]);
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of relationGraph.keys()) visit(id, []);

    return [...findings.values()];
}

type SimilarBlock = { hint: string; line?: number; heading: string; text: string; terms: Set<string> };

function similarityTerms(text: string): Set<string> {
    return new Set(text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
}

function similarity(a: Set<string>, b: Set<string>): number {
    const intersection = [...a].filter((term) => b.has(term)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
}

async function analyzeSimilarKnowledge(projectRootPath: string, hintPaths: string[], hintbooks: HintbookData[]): Promise<LintFinding[]> {
    const cache = new Map<string, SimilarBlock[]>();
    const readBlocks = async (hint: string): Promise<SimilarBlock[]> => {
        const cached = cache.get(hint);
        if (cached) return cached;
        const root = await parseHintFile(projectRootPath, Path.join(projectRootPath, hint));
        const found: SimilarBlock[] = [];
        const walk = (nodes: HintData[]): void => {
            for (const node of nodes) {
                if (node.keyword !== RUNNING_FILE && node.keyword !== RUNNING_FOLDER) {
                    const text = `${node.name} ${node.body}`.trim();
                    found.push({ hint, line: node.line, heading: `${node.keyword} ${node.name}`.trim(), text, terms: similarityTerms(text) });
                }
                walk(node.children);
            }
        };
        if (root) walk(root.children);
        cache.set(hint, found);
        return found;
    };

    const findings: LintFinding[] = [];
    for (const absolute of hintPaths) {
        const hint = repositoryPath(projectRootPath, absolute);
        let own: SimilarBlock[];
        try { own = await readBlocks(hint); } catch { continue; }
        for (const block of own) {
            // 0.82 plus eight distinct terms was tuned against the dogfooded repo and demos: near-copies
            // survive, while short shared conventions do not become noisy curation work.
            if (block.terms.size < 8) continue;
            const candidates = await searchHints(projectRootPath, block.text, { limit: -1, hintbooks });
            let best: { block: SimilarBlock; score: number } | null = null;
            for (const candidate of candidates.filter((result) => result.hint !== hint)) {
                let other: SimilarBlock[];
                try { other = await readBlocks(candidate.hint); } catch { continue; }
                for (const possible of other) {
                    const score = similarity(block.terms, possible.terms);
                    if (score >= 0.82 && (!best || score > best.score)) best = { block: possible, score };
                }
            }
            if (best) findings.push({
                kind: 'similar', severity: 'info', hint, line: block.line,
                detail: `similar knowledge exists: ${best.block.hint}${best.block.line ? `:${best.block.line}` : ''} "${best.block.heading}" — consider extending it instead`,
            });
        }
    }
    return findings;
}

function namedBlocks(root: HintData, hint: string): NamedBlock[] {
    const blocks: NamedBlock[] = [];
    const walk = (nodes: HintData[]): void => {
        for (const node of nodes) {
            if (node.name) blocks.push({ hint, name: node.name, id: node.id, line: node.line });
            walk(node.children);
        }
    };
    walk(root.children);
    return blocks;
}

async function analyzeGraph(projectRootPath: string, hintPaths: string[], strict: boolean): Promise<LintFinding[]> {
    const roots: { absolute: string; hint: string; root: HintData | null }[] = [];
    for (const absolute of hintPaths) {
        try {
            roots.push({ absolute, hint: repositoryPath(projectRootPath, absolute), root: await parseHintFile(projectRootPath, absolute) });
        } catch {
            // The ordinary per-file pass already owns the broken-include finding. Keep the remaining
            // repository graph useful instead of replacing every graph result with that same error.
        }
    }
    const valid = roots.filter((entry): entry is typeof entry & { root: HintData } => entry.root !== null);
    const graphHints = await parseHintFiles(projectRootPath, valid.map((entry) => entry.absolute));
    const edges = await collectReferenceEdges(projectRootPath, graphHints);
    const referenced = new Set(edges.flatMap((edge) => edge.to ? [Path.resolve(edge.to)] : []));
    const findings: LintFinding[] = [];
    const severity = strict ? 'finding' : 'info';

    for (const edge of edges.filter((candidate) => candidate.to === null)) {
        findings.push({ kind: 'dead-ref', severity, hint: repositoryPath(projectRootPath, edge.from), line: edge.line, detail: `reference '${edge.ref}' resolves to no .hint file` });
    }

    for (const entry of valid) {
        const target = hintTargetName(projectRootPath, entry.absolute);
        if (!referenced.has(Path.resolve(entry.absolute)) && target !== '.' && !(await isPathExists(Path.join(projectRootPath, target)))) {
            findings.push({ kind: 'orphan', severity, hint: entry.hint, detail: 'no other hint references this file and its target does not exist' });
        }
    }

    const blocks = valid.flatMap((entry) => namedBlocks(entry.root, entry.hint));
    const ids = new Map<string, NamedBlock>();
    for (const block of blocks.filter((entry) => entry.id)) {
        const previous = ids.get(block.id);
        if (previous && previous.hint !== block.hint) {
            findings.push({ kind: 'duplicate-id', severity, hint: block.hint, line: block.line, detail: `duplicate {#${block.id}} across files; first declared in ${previous.hint}${previous.line ? `:${previous.line}` : ''}` });
        } else if (!previous) ids.set(block.id, block);
    }

    const names = new Map<string, NamedBlock>();
    for (const block of blocks.filter((entry) => !entry.name.includes('/') && !entry.name.includes('.'))) {
        const normalized = block.name.trim().toLowerCase();
        const previous = names.get(normalized);
        if (previous && previous.hint !== block.hint) {
            findings.push({ kind: 'duplicate-name', severity, hint: block.hint, line: block.line, detail: `block name '${block.name}' is also declared in ${previous.hint}${previous.line ? `:${previous.line}` : ''}` });
        } else if (!previous) names.set(normalized, block);
    }

    const uniqueNames = [...names.entries()].filter(([name]) => [...name].length >= 5);
    for (let left = 0; left < uniqueNames.length; left++) {
        for (let right = left + 1; right < uniqueNames.length; right++) {
            const [a, first] = uniqueNames[left]!;
            const [b, second] = uniqueNames[right]!;
            if (first.hint !== second.hint && editDistance(a, b) === 1) {
                findings.push({ kind: 'near-name', severity, hint: second.hint, line: second.line, detail: `block name '${second.name}' is one edit from '${first.name}' in ${first.hint}` });
            }
        }
    }

    return findings;
}

export async function lintHintFiles(
    projectRootPath: string,
    hintPaths: string[],
    hintbooks: HintbookData[],
    options: { strictVocabulary?: boolean; graph?: boolean; strictGraph?: boolean; reconcile?: boolean; duplicates?: boolean; parsedRepository?: HintData[] } = {},
): Promise<LintFinding[]> {
    const findings: LintFinding[] = [];

    for (const absolutePath of [...new Set(hintPaths)]) {
        const hintPath = repositoryPath(projectRootPath, absolutePath);
        try {
            const root = await parseHintFile(projectRootPath, absolutePath);
            if (root) findings.push(...analyze(hintPath, root, hintbooks, Boolean(options.strictVocabulary)));
        } catch (error: unknown) {
            findings.push({
                kind: 'include', severity: 'finding', hint: hintPath,
                detail: error instanceof Error ? error.message : String(error),
            });
        }
    }

    if (options.graph) {
        try {
            findings.push(...await analyzeGraph(projectRootPath, [...new Set(hintPaths)], Boolean(options.strictGraph)));
        } catch (error: unknown) {
            findings.push({ kind: 'include', severity: 'finding', hint: '.', detail: error instanceof Error ? error.message : String(error) });
        }
    }

    if (options.reconcile !== false) findings.push(...await analyzeRelations(projectRootPath, [...new Set(hintPaths)], options.parsedRepository));
    if (options.duplicates !== false) findings.push(...await analyzeSimilarKnowledge(projectRootPath, [...new Set(hintPaths)], hintbooks));

    return findings.sort((a, b) => (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : (a.line ?? 0) - (b.line ?? 0)));
}

export function formatLintFinding(finding: LintFinding): string {
    return `${finding.hint}${finding.line ? `:${finding.line}` : ''}: ${finding.detail}`;
}
