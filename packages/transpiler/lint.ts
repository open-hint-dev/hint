import * as Path from 'node:path';

import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { collectReferenceEdges } from './closure.js';
import { isPathExists } from './helper.js';
import { vocabularyBooks } from './hintbook.js';
import { parseHintFile, parseHintFiles } from './parser.js';
import { repositoryPath } from './git.js';
import { hintTargetName } from './resolve.js';

export type LintFinding = {
    kind: 'vocab' | 'include' | 'duplicate-id' | 'empty' | 'dead-ref' | 'orphan' | 'duplicate-name' | 'near-name';
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
    options: { strictVocabulary?: boolean; graph?: boolean; strictGraph?: boolean } = {},
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

    return findings.sort((a, b) => (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : (a.line ?? 0) - (b.line ?? 0)));
}

export function formatLintFinding(finding: LintFinding): string {
    return `${finding.hint}${finding.line ? `:${finding.line}` : ''}: ${finding.detail}`;
}
