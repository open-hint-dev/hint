// Layer 6 — merge.
//
// Emission has to be safe to re-run, or it gets run exactly once and then abandoned. Two guarantees
// make it safe, and both are implemented here:
//
//   1. Code outside the generated region is never touched. The orthodox spec-as-source demand that
//      "no human ever edits the output" is what makes the paradigm fail on contact with reality;
//      guarded regions dissolve it — the generator owns marked spans, the human owns the rest.
//   2. A hole body that has been filled is never overwritten. Otherwise the first re-emit after a
//      model run destroys the work, and nobody re-runs it.
//
// Markers live inside comments and are matched by their token alone, so the same parser serves every
// target's comment form — `// hint:begin`, `# hint:begin`, `<!-- hint:begin -->`.

import { commentBlock } from './template.js';

export const MARKER_BEGIN = 'hint:begin';
export const MARKER_END = 'hint:end';
export const MARKER_HOLE = 'hint:hole';

const BEGIN = /(?:^|\W)hint:begin(?:\W|$)/;
const END = /(?:^|\W)hint:end(?:\W|$)/;
const HOLE = /(?:^|\W)hint:hole\(([^)]*)\)(?:\s+spec=([0-9a-f]+))?/;

export type Hole = {
    label: string;
    // Hash of the governing spec block when the body was written. A later mismatch means the spec
    // moved underneath a body somebody wrote against the old one.
    spec: string;
    // The lines between the hole marker and its `hint:end`, verbatim.
    body: string;
};

// The `hint:begin` … `hint:end` span, as inclusive line indices. Holes nested inside it are skipped,
// so a hole's own `hint:end` cannot be mistaken for the region's.
export type Region = {
    begin: number;
    end: number;
};

function lines(content: string): string[] {
    return content.split('\n');
}

export function findRegion(content: string): Region | null {
    const source = lines(content);

    let begin = -1;
    let inHole = false;

    for (let index = 0; index < source.length; index++) {
        const line = source[index]!;

        if (begin === -1) {
            if (BEGIN.test(line)) {
                begin = index;
            }

            continue;
        }

        if (HOLE.test(line)) {
            inHole = true;
            continue;
        }

        if (END.test(line)) {
            if (inHole) {
                inHole = false;
                continue;
            }

            return { begin, end: index };
        }
    }

    return null;
}

// Every filled hole inside `content`, keyed by label. The body is whatever sits between the hole
// marker and its `hint:end` — including a body that is still the emitted default, which costs
// nothing to preserve and keeps the rule simple: what is inside a hole belongs to whoever wrote it.
export function extractHoles(content: string): Map<string, Hole> {
    const holes = new Map<string, Hole>();
    const source = lines(content);

    let open: { label: string; spec: string; from: number } | null = null;

    for (let index = 0; index < source.length; index++) {
        const line = source[index]!;
        const match = HOLE.exec(line);

        if (match) {
            open = { label: match[1] ?? '', spec: match[2] ?? '', from: index + 1 };
            continue;
        }

        if (open && END.test(line)) {
            holes.set(open.label, { label: open.label, spec: open.spec, body: source.slice(open.from, index).join('\n') });
            open = null;
        }
    }

    return holes;
}

// Substitutes preserved bodies into a freshly rendered artifact. The hole's header — its instructions
// and the current spec hash — is regenerated every time, because that is the part the spec owns; only
// what sits between the marker and `hint:end` is carried over.
function restoreHoles(artifact: string, preserved: Map<string, Hole>): { content: string; restored: number; drifted: string[] } {
    const source = lines(artifact);
    const output: string[] = [];
    const drifted: string[] = [];

    let restored = 0;
    let skipping: string | null = null;

    for (const line of source) {
        if (skipping !== null) {
            if (END.test(line)) {
                output.push(line);
                skipping = null;
            }

            continue;
        }

        output.push(line);

        const match = HOLE.exec(line);

        if (!match) {
            continue;
        }

        const hole = preserved.get(match[1] ?? '');

        if (!hole) {
            continue;
        }

        // The body stays whatever it was; a spec that has moved since is reported, never silently
        // resolved. Whether the change invalidates the implementation is a judgement, not a rewrite.
        if (hole.spec && match[2] && hole.spec !== match[2]) {
            drifted.push(hole.label);
        }

        if (hole.body !== '') {
            output.push(hole.body);
        }

        restored += 1;
        skipping = hole.label;
    }

    return { content: output.join('\n'), restored, drifted };
}

export type MergeResult = {
    content: string;
    // Filled hole bodies carried over from the file on disk.
    restored: number;
    // Labels whose governing spec changed since the body was written.
    drifted: string[];
    // Whether the file had no generated region — a new file, or an existing one gaining its first.
    created: boolean;
};

function wrap(artifact: string, comment: string | undefined): string {
    return [
        commentBlock(comment, MARKER_BEGIN),
        artifact,
        commentBlock(comment, MARKER_END),
    ].join('\n');
}

// `existing` is null when the output does not exist yet. An existing file with no region keeps all of
// its content and gains one at the end — adopting a hand-written file must never begin by truncating it.
export function mergeArtifact(existing: string | null, artifact: string, comment?: string): MergeResult {
    const preserved = existing === null ? new Map<string, Hole>() : extractHoles(existing);
    const { content: restoredArtifact, restored, drifted } = restoreHoles(artifact, preserved);
    const region = wrap(restoredArtifact, comment);

    if (existing === null) {
        return { content: `${region}\n`, restored, drifted, created: true };
    }

    const found = findRegion(existing);

    if (!found) {
        const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';

        return { content: `${existing}${separator}${region}\n`, restored, drifted, created: true };
    }

    const source = lines(existing);
    const merged = [
        ...source.slice(0, found.begin),
        ...lines(region),
        ...source.slice(found.end + 1),
    ];

    return { content: merged.join('\n'), restored, drifted, created: false };
}
