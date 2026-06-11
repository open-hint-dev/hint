import type { HintbookData, InstructionData } from './hintbook.js';
import type { HintData } from './parser.js';
import { interpolate } from './helper.js';
import {
    INSTRUCTION_MODE_DEFAULT,
    PLACEHOLDER_BODY,
    PLACEHOLDER_CHILDREN,
    PLACEHOLDER_ID,
    PLACEHOLDER_NAME,
    RUNNING_FOOTER,
    RUNNING_HEADER,
} from './hintbook.js';

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

export async function compileHints(hints: HintData[], hintbooks: HintbookData[], mode: string): Promise<string> {
    const resolvedMode = mode || INSTRUCTION_MODE_DEFAULT;

    const content = hints
        .map((hint) => compileHint(hint, hintbooks, resolvedMode))
        .filter(Boolean)
        .join('\n\n');

    const header = findInstruction(hintbooks, resolvedMode, RUNNING_HEADER)?.content.trim();
    const footer = findInstruction(hintbooks, resolvedMode, RUNNING_FOOTER)?.content.trim();

    return [
        header,
        content,
        footer,
    ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
}
