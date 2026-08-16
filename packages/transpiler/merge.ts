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
// Hole labels used to be the bare template label (`body`), which collided across blocks. A file
// written before they were qualified still carries the old form, so a new key falls back to matching
// on its trailing label — but only when that label appears exactly once on disk. Ambiguity is
// precisely the case the old scheme got wrong, and guessing there would repeat the damage.
function legacyMatch(preserved: Map<string, Hole>, key: string): Hole | undefined {
    const label = key.split(':').pop() ?? key;
    const candidates = [...preserved.values()].filter((hole) => hole.label === label);

    return candidates.length === 1 ? candidates[0] : undefined;
}

function restoreHoles(
    artifact: string,
    preserved: Map<string, Hole>,
): { content: string; restored: number; drifted: string[]; consumed: Set<string> } {
    const source = lines(artifact);
    const output: string[] = [];
    const drifted: string[] = [];
    const consumed = new Set<string>();

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

        const key = match[1] ?? '';
        const hole = preserved.get(key) ?? legacyMatch(preserved, key);

        if (!hole) {
            continue;
        }

        consumed.add(hole.label);

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

    return { content: output.join('\n'), restored, drifted, consumed };
}

export type MergeResult = {
    content: string;
    // Filled hole bodies carried over from the file on disk.
    restored: number;
    // Labels whose governing spec changed since the body was written.
    drifted: string[];
    // The output did not exist at all and was written from scratch.
    created: boolean;
    // The output existed, held content, and had no generated region. Appending one duplicates every
    // declaration the spec makes, which does not fail loudly — it produces a file that no longer
    // compiles — so the caller is expected to make this an explicit decision rather than a default.
    adopted: boolean;
    // Implementations on disk that the new artifact has nowhere to put — the spec block that owned
    // them was removed or renamed. Writing would delete work nobody can get back, so the caller is
    // expected to refuse rather than to proceed quietly.
    orphaned: Hole[];
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
    const stubs = extractHoles(artifact);
    const { content: restoredArtifact, restored, drifted, consumed } = restoreHoles(artifact, preserved);
    const region = wrap(restoredArtifact, comment);

    // A body only counts as orphaned if somebody wrote it: an untouched stub carries nothing to lose.
    const orphaned = [...preserved.values()].filter(
        (hole) => !consumed.has(hole.label) && hole.body.trim() !== '' && hole.body.trim() !== stubs.get(hole.label)?.body.trim(),
    );

    if (existing === null) {
        return { content: `${region}\n`, restored, drifted, created: true, adopted: false, orphaned };
    }

    const found = findRegion(existing);

    if (!found) {
        const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';

        return { content: `${existing}${separator}${region}\n`, restored, drifted, created: false, adopted: existing.trim() !== '', orphaned };
    }

    const source = lines(existing);
    const merged = [
        ...source.slice(0, found.begin),
        ...lines(region),
        ...source.slice(found.end + 1),
    ];

    return { content: merged.join('\n'), restored, drifted, created: false, adopted: false, orphaned };
}

export type HoleState = {
    label: string;
    // The body on disk differs from the stub a fresh emission produces — somebody implemented it.
    filled: boolean;
    // A filled body was written against a spec that has since changed. Only meaningful when filled:
    // an unfilled hole simply gets the new spec on the next emission.
    outdated: boolean;
};

// Compares the holes on disk against the ones a fresh emission would produce. This is how "what does
// the spec still ask for that nobody has written?" is answered without a second bookkeeping file:
// both sides are derivable, so nothing can fall out of sync with reality.
export function inspectHoles(existing: string, artifact: string): HoleState[] {
    const fresh = extractHoles(artifact);
    const current = extractHoles(existing);
    const states: HoleState[] = [];

    for (const [
        label,
        stub,
    ] of fresh) {
        const onDisk = current.get(label);

        if (!onDisk) {
            continue;
        }

        const filled = onDisk.body.trim() !== stub.body.trim();

        states.push({
            label,
            filled,
            outdated: filled && Boolean(onDisk.spec && stub.spec && onDisk.spec !== stub.spec),
        });
    }

    return states;
}
