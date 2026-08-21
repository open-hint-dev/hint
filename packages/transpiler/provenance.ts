import * as Path from 'node:path';

import type { HintData } from './parser.js';
import { readGitBlame } from './git.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';

export type BlockProvenance = {
    hint: string;
    line: number;
    heading: string;
    author?: string;
    email?: string;
    commit?: string;
    date?: string;
    ageDays?: number;
    marker: boolean;
};

function glob(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');
    return new RegExp(`^${escaped}$`, 'i');
}

function blocks(hints: HintData[]): HintData[] {
    const result: HintData[] = [];
    const walk = (nodes: HintData[]): void => {
        for (const node of nodes) {
            if (node.keyword !== RUNNING_FILE && node.keyword !== RUNNING_FOLDER) result.push(node);
            walk(node.children);
        }
    };
    walk(hints);
    return result;
}

export async function findUnreviewedBlocks(projectRootPath: string, hints: HintData[], agentAuthors: string[] = []): Promise<BlockProvenance[]> {
    const candidates = blocks(hints).filter((block) => block.source && block.line);
    const blameByHint = new Map<string, Awaited<ReturnType<typeof readGitBlame>>>();
    const patterns = agentAuthors.map(glob);
    const rows: BlockProvenance[] = [];

    for (const block of candidates) {
        const marker = block.attrs?.origin === 'agent';
        if (!marker && patterns.length === 0) continue;
        const hint = block.source!.replace(/:\d+$/, '');
        let blame = blameByHint.get(hint);
        if (blame === undefined) {
            blame = await readGitBlame(projectRootPath, hint);
            blameByHint.set(hint, blame);
        }
        const readings = blame
            ? Array.from({ length: Math.max(1, (block.endLine ?? block.line!) - block.line! + 1) }, (_, index) => blame!.lines.get(block.line! + index)).filter((value) => value !== undefined)
            : [];
        const reading = readings.sort((a, b) => b.time - a.time)[0];
        const gitAgent = patterns.length > 0 && readings.length > 0 && readings.every((line) =>
            [line.author, line.email].some((value) => patterns.some((pattern) => pattern.test(value))),
        );
        if (!marker && !gitAgent) continue;
        const ageDays = reading && blame ? Math.max(0, Math.floor((blame.referenceTime - reading.time) / 86_400)) : undefined;
        rows.push({
            hint: Path.normalize(hint).replaceAll('\\', '/'),
            line: block.line!,
            heading: `${block.keyword}${block.name ? ` ${block.name}` : ''}`,
            author: reading?.author,
            email: reading?.email,
            commit: reading?.commit,
            date: reading ? new Date(reading.time * 1000).toISOString().slice(0, 10) : undefined,
            ageDays,
            marker,
        });
    }

    return rows.sort((a, b) => a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : a.line - b.line);
}
