import type { HintbookData, InstructionData } from './hintbook.js';
import type { HintData } from './parser.js';
import { interpolate } from './helper.js';
import {
    PLACEHOLDER_BODY,
    PLACEHOLDER_CHILDREN,
    PLACEHOLDER_ID,
    PLACEHOLDER_NAME,
    RUNNING_CHANGES,
    RUNNING_FILE,
    RUNNING_FOLDER,
    RUNNING_FOOTER,
    RUNNING_HEADER,
    RUNNING_SYSTEM,
} from './hintbook.js';

export type PromptOptions = {
    // Block-level drift, rendered through the hintbook's `__changes__` instruction. Supplied only when
    // a lock exists and something actually drifted, so reconciliation framing appears exactly when it
    // applies instead of being selected by hand.
    changes?: string;
    // Prepend the tag glossary, for an agent that never loaded the project's AGENTS.md.
    standalone?: boolean;
};

// A file/folder wrapper is pure structural nesting when it declares no directives of its own: its
// own hint body is empty and none of its children are content blocks (every child is itself a
// file/folder wrapper). Such a wrapper carries no constraints — its `path` only groups descendants
// that already hold their own absolute paths — so emitting it adds tokens and visual noise.
function isEmptyStructuralWrapper(hint: HintData): boolean {
    if (hint.keyword !== RUNNING_FOLDER && hint.keyword !== RUNNING_FILE) {
        return false;
    }

    if (hint.body.trim() !== '') {
        return false;
    }

    return hint.children.every((child) => child.keyword === RUNNING_FOLDER || child.keyword === RUNNING_FILE);
}

// Resolves a keyword to its instruction, matching by name or by one of its declared synonyms. The
// first hintbook that defines the keyword wins. Exported so drift and verification resolve keywords
// by exactly the rules the renderer uses.
export function findInstruction(hintbooks: HintbookData[], keyword: string): InstructionData | null {
    for (const hintbook of hintbooks) {
        const instruction = hintbook.instructions.find((candidate) => candidate.name === keyword || candidate.metadata?.synonyms?.includes(keyword));

        if (instruction) {
            return instruction;
        }
    }

    return null;
}

function renderHint(hint: HintData, hintbooks: HintbookData[]): string {
    const instruction = findInstruction(hintbooks, hint.keyword);

    if (instruction?.metadata?.exclude) {
        return '';
    }

    const children = hint.children
        .map((child) => renderHint(child, hintbooks))
        .filter(Boolean)
        .join('\n\n');

    // Drop empty structural wrappers, promoting whatever their (already path-scoped) children rendered
    // to. A folder that only nests other wrappers collapses to those wrappers; an empty file wrapper
    // collapses to '' and is filtered out by its parent.
    if (isEmptyStructuralWrapper(hint)) {
        return children;
    }

    if (!instruction) {
        return [
            hint.body,
            children,
        ]
            .filter(Boolean)
            .join('\n\n');
    }

    return interpolate(instruction.content, {
        [PLACEHOLDER_ID]: hint.id,
        [PLACEHOLDER_NAME]: hint.name,
        [PLACEHOLDER_BODY]: hint.body,
        [PLACEHOLDER_CHILDREN]: children,
    }).trim();
}

// Interpolated wrappers pad `{body}`/`{children}` with blank lines; when a slot is empty this leaves
// runs of 3+ newlines. Collapse every run to a single blank line so nesting stays legible.
function tidy(text: string): string {
    return text.replace(/\n{3,}/g, '\n\n').trim();
}

// The core artifact: the scoped repository knowledge that applies, and nothing else. No persona, no
// workflow instructions, no reporting format — so the cost of asking HINT what applies to a path is
// proportional to how much actually applies. `renderPrompt` wraps this when framing is wanted.
export function renderContext(hints: HintData[], hintbooks: HintbookData[]): string {
    return tidy(
        hints
            .map((hint) => renderHint(hint, hintbooks))
            .filter(Boolean)
            .join('\n\n'),
    );
}

// The optional wrapper: the same context framed as a standalone implementation prompt, for piping to
// a fresh agent that has no other instructions. Everything here is framing — losing it loses no
// repository knowledge.
export function renderPrompt(context: string, hintbooks: HintbookData[], options: PromptOptions = {}): string {
    const system = options.standalone ? findInstruction(hintbooks, RUNNING_SYSTEM)?.content.trim() : '';
    const header = findInstruction(hintbooks, RUNNING_HEADER)?.content.trim();
    const footer = findInstruction(hintbooks, RUNNING_FOOTER)?.content.trim();

    // Reconciliation guidance renders only when the hintbook defines a `__changes__` instruction and the
    // caller detected drift — so it appears exactly when code has drifted from its spec, with no mode to
    // select by hand.
    const changesInstruction = options.changes ? findInstruction(hintbooks, RUNNING_CHANGES) : null;
    const changes = changesInstruction ? interpolate(changesInstruction.content, { [PLACEHOLDER_BODY]: options.changes! }).trim() : '';

    return tidy(
        [
            system,
            header,
            changes,
            context,
            footer,
        ]
            .filter(Boolean)
            .join('\n\n'),
    );
}
