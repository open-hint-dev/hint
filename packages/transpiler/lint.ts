import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { vocabularyBooks } from './hintbook.js';
import { parseHintFile } from './parser.js';
import { repositoryPath } from './git.js';

export type LintFinding = {
    kind: 'vocab' | 'include' | 'duplicate-id' | 'empty';
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

export async function lintHintFiles(
    projectRootPath: string,
    hintPaths: string[],
    hintbooks: HintbookData[],
    options: { strictVocabulary?: boolean } = {},
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

    return findings.sort((a, b) => (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : (a.line ?? 0) - (b.line ?? 0)));
}

export function formatLintFinding(finding: LintFinding): string {
    return `${finding.hint}${finding.line ? `:${finding.line}` : ''}: ${finding.detail}`;
}
