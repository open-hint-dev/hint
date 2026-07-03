import * as Path from 'node:path';

import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { findInstruction } from './compiler.js';
import { readFile } from './helper.js';
import { INSTRUCTION_MODE_DEFAULT, RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';
import { collectFileNodes } from './lock.js';

// A declared surface that must manifest by name in the generated output — the `keyword name` a spec
// promised (e.g. `func executeLogin`, `error InvalidCredentialsException`, `party Discloser`).
export type Surface = {
    keyword: string;
    name: string;
};

// `ok` — every declared surface appears in the output; `missing-output` — the target does not exist on
// disk; `missing-surfaces` — the output exists but one or more declared surfaces are absent from it.
export type VerifyStatus = 'ok' | 'missing-output' | 'missing-surfaces';

export type FileVerification = {
    name: string;
    status: VerifyStatus;
    // How many surface blocks were checked (0 when the active hintbooks declare none for this file).
    checked: number;
    missing: Surface[];
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True when `name` appears in `content`. Case-sensitive (identifiers and defined terms are), and bounded
// by word boundaries when the name starts/ends with a word character so `login` does not match inside
// `loginController` — names carrying punctuation fall back to a plain substring test. This is a presence
// lint, not a parse: it catches a whole surface omitted (a stubbed or forgotten function, an unhandled
// error type, an unused defined term), not a subtly wrong implementation.
export function mentionsSurface(content: string, name: string): boolean {
    const trimmed = name.trim();

    if (!trimmed) {
        return false;
    }

    const left = /^\w/.test(trimmed) ? '\\b' : '';
    const right = /\w$/.test(trimmed) ? '\\b' : '';

    return new RegExp(`${left}${escapeRegExp(trimmed)}${right}`).test(content);
}

function isSubHint(hint: HintData): boolean {
    return hint.keyword === RUNNING_FILE || hint.keyword === RUNNING_FOLDER;
}

// The declared surfaces of a file node: every named block (at any depth) whose keyword resolves to an
// instruction flagged `surface: true` by the active hintbooks. Constraint/scratch/input keywords
// (`bad`, `rule`, `notes`, `read`) are never surfaces, so their names are not expected in the output.
export function collectSurfaces(fileNode: HintData, hintbooks: HintbookData[], mode: string): Surface[] {
    const surfaces: Surface[] = [];

    const walk = (nodes: HintData[]): void => {
        for (const node of nodes) {
            if (isSubHint(node)) {
                continue;
            }

            const instruction = findInstruction(hintbooks, mode, node.keyword);

            if (instruction?.metadata?.surface && node.name.trim()) {
                surfaces.push({ keyword: node.keyword, name: node.name.trim() });
            }

            walk(node.children);
        }
    };

    walk(fileNode.children);

    return surfaces;
}

// Number of surface-flagged keyword instructions across the active hintbooks (active mode plus the
// default-mode fallback). Zero means structural verification is a no-op for these books — callers use it
// to tell the user to mark keywords `surface: true` rather than silently reporting everything verified.
export function countSurfaceKeywords(hintbooks: HintbookData[], mode: string): number {
    const resolvedMode = mode || INSTRUCTION_MODE_DEFAULT;
    let count = 0;

    for (const modeName of new Set([
        resolvedMode,
        INSTRUCTION_MODE_DEFAULT,
    ])) {
        for (const hintbook of hintbooks) {
            for (const instruction of hintbook.modes[modeName]?.instructions ?? []) {
                if (instruction.metadata?.surface) {
                    count += 1;
                }
            }
        }
    }

    return count;
}

// Deterministic structural check of each file target against its spec: the generated output must exist
// and mention every declared surface by name. Zero tokens, no language assumptions — the counterpart to
// the semantic `--mode review` audit. A file with no declared surfaces verifies vacuously (`ok`).
export async function verifyTargets(
    projectRootPath: string,
    hints: HintData[],
    hintbooks: HintbookData[],
    mode: string,
): Promise<FileVerification[]> {
    const resolvedMode = mode || INSTRUCTION_MODE_DEFAULT;
    const results: FileVerification[] = [];

    for (const { name, node } of collectFileNodes(hints)) {
        const surfaces = collectSurfaces(node, hintbooks, resolvedMode);
        const content = await readFile(Path.join(projectRootPath, name));

        if (content === null) {
            results.push({ name, status: 'missing-output', checked: surfaces.length, missing: [] });

            continue;
        }

        const missing = surfaces.filter((surface) => !mentionsSurface(content, surface.name));

        results.push({
            name,
            status: missing.length > 0 ? 'missing-surfaces' : 'ok',
            checked: surfaces.length,
            missing,
        });
    }

    return results;
}

// Renders the failing verifications as agent/human-facing guidance; `ok` files are omitted. Returns an
// empty string when everything verified, so callers can treat "" as success.
export function formatVerification(results: FileVerification[]): string {
    const lines: string[] = [];

    for (const result of results) {
        if (result.status === 'ok') {
            continue;
        }

        if (result.status === 'missing-output') {
            lines.push(`- ${result.name}: output not found on disk — generate it before verifying.`);
            continue;
        }

        lines.push(`- ${result.name}: ${result.missing.length} declared surface(s) missing from the output:`);

        for (const surface of result.missing) {
            lines.push(`    - ${surface.keyword} ${surface.name}`);
        }
    }

    return lines.join('\n');
}
