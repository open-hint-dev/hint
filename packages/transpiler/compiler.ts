import type { HintbookData, InstructionData } from './hintbook.js';
import type { HintData } from './parser.js';
import { interpolate } from './helper.js';
import {
    INSTRUCTION_MODE_DEFAULT,
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

function findInstruction(hintbooks: HintbookData[], mode: string, keyword: string): InstructionData | null {
    for (const modeName of new Set([
        mode,
        INSTRUCTION_MODE_DEFAULT,
    ])) {
        for (const hintbook of hintbooks) {
            const instruction = hintbook.modes[modeName]?.instructions.find(
                (candidate) => candidate.name === keyword || candidate.metadata?.synonyms?.includes(keyword),
            );

            if (instruction) {
                return instruction;
            }
        }
    }

    return null;
}

function compileHint(hint: HintData, hintbooks: HintbookData[], mode: string): string {
    const instruction = findInstruction(hintbooks, mode, hint.keyword);

    if (instruction?.metadata?.exclude) {
        return '';
    }

    const children = hint.children
        .map((child) => compileHint(child, hintbooks, mode))
        .filter(Boolean)
        .join('\n\n');

    // Drop empty structural wrappers, promoting whatever their (already path-scoped) children compiled
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

export async function compileHints(
    hints: HintData[],
    hintbooks: HintbookData[],
    mode: string,
    changes: string = '',
    standalone: boolean = false,
): Promise<string> {
    const resolvedMode = mode || INSTRUCTION_MODE_DEFAULT;

    const content = hints
        .map((hint) => compileHint(hint, hintbooks, resolvedMode))
        .filter(Boolean)
        .join('\n\n');

    // The tag glossary normally lives once in AGENTS.md, not in every compile. `--standalone` prepends
    // it so the output explains its own tags for an agent that never loaded AGENTS.md (e.g. a subagent).
    const system = standalone ? findInstruction(hintbooks, resolvedMode, RUNNING_SYSTEM)?.content.trim() : '';
    const header = findInstruction(hintbooks, resolvedMode, RUNNING_HEADER)?.content.trim();
    const footer = findInstruction(hintbooks, resolvedMode, RUNNING_FOOTER)?.content.trim();

    // Drift guidance renders only when the mode defines a `__changes__` instruction (e.g. fix mode) and the
    // caller supplied a summary — so it stays a hintbook-controlled section, dormant everywhere else.
    const changesInstruction = changes ? findInstruction(hintbooks, resolvedMode, RUNNING_CHANGES) : null;
    const changesSection = changesInstruction ? interpolate(changesInstruction.content, { [PLACEHOLDER_BODY]: changes }).trim() : '';

    return (
        [
            system,
            header,
            changesSection,
            content,
            footer,
        ]
            .filter(Boolean)
            .join('\n\n')
            // Interpolated wrappers pad `{body}`/`{children}` with blank lines; when a slot is empty this
            // leaves runs of 3+ newlines. Collapse every run to a single blank line so nesting stays legible.
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}
