import * as Path from 'node:path';

import type { HintbookData, InstructionData } from './hintbook.js';
import type { HintData } from './parser.js';
import type { Placeholder, Resolved } from './template.js';
import { toGitPath } from './git.js';
import { emitPacks, RUNNING_FILE, RUNNING_FOLDER, vocabularyBooks } from './hintbook.js';
import { hashHint } from './lock.js';
import { MARKER_END, MARKER_HOLE } from './merge.js';
import { commentBlock, renderTemplate, resolvedValue } from './template.js';

// Translates a `match` glob into a matcher. `*` stops at a separator, `**` crosses them, `?` is one
// non-separator character; everything else is literal. A pattern with no separator is tested against
// the basename, so `*.ts` means "any TypeScript file" rather than "a TypeScript file at the root".
function globToRegExp(pattern: string): RegExp {
    let source = '';

    for (let index = 0; index < pattern.length; index++) {
        const char = pattern[index]!;

        if (char === '*') {
            if (pattern[index + 1] === '*') {
                source += '.*';
                index += 1;
            } else {
                source += '[^/]*';
            }

            continue;
        }

        source += char === '?' ? '[^/]' : char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }

    return new RegExp(`^${source}$`);
}

export function matchesGlob(pattern: string, path: string): boolean {
    const normalized = toGitPath(path);
    const subject = pattern.includes('/') ? normalized : Path.basename(normalized);

    return globToRegExp(pattern).test(subject);
}

// The emit pack that should render `outputPath`. An explicit `target` wins outright — that is what
// `--target` is for. Otherwise the output path's own shape selects the pack, which is what keeps
// language knowledge in the pack and out of the engine. First match wins, mirroring keyword lookup.
export function selectEmitter(hintbooks: HintbookData[], outputPath: string, target?: string): HintbookData | null {
    const packs = emitPacks(hintbooks);

    if (target) {
        return packs.find((pack) => pack.target === target) ?? null;
    }

    return packs.find((pack) => (pack.match ?? []).some((pattern) => matchesGlob(pattern, outputPath))) ?? null;
}

// Every target an emitter exists for, in registration order — for error messages that tell the caller
// what they could have asked for instead of only what failed.
export function availableTargets(hintbooks: HintbookData[]): string[] {
    return [...new Set(emitPacks(hintbooks).map((pack) => pack.target!))];
}

// A keyword written in a spec resolves to the canonical name its vocabulary declares, so a synonym
// (`# application`) finds the template filed under `app.tmpl`. Emit packs are keyed by canonical name
// only: a pack should not have to restate the vocabulary's synonym list to stay in sync with it.
export function canonicalKeyword(hintbooks: HintbookData[], keyword: string): string | null {
    for (const hintbook of vocabularyBooks(hintbooks)) {
        const instruction = hintbook.instructions.find((candidate) => candidate.name === keyword || candidate.metadata?.synonyms?.includes(keyword));

        if (instruction) {
            return instruction.name;
        }
    }

    return null;
}

// The template this emitter provides for a keyword, or null when it provides none. Null is the normal
// case and the whole anti-bloat mechanism: `decision`, `rule`, and `bad` have no TypeScript template,
// so they never become code — no configuration decides that, the absence of a file does.
export function findEmitTemplate(emitter: HintbookData, hintbooks: HintbookData[], keyword: string): InstructionData | null {
    const canonical = canonicalKeyword(hintbooks, keyword) ?? keyword;

    return emitter.instructions.find((candidate) => candidate.name === canonical) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Layer 4 — plan
// ---------------------------------------------------------------------------------------------

// One artifact that will be produced: which spec, which emitter, where it lands. Assembling this
// before anything renders means `hint emit` can report exactly what it is about to do, and that a
// run which would produce nothing says so instead of succeeding quietly.
export type EmitUnit = {
    // Repository-relative path of the output — which is also the companion spec's target.
    output: string;
    target: string;
    emitter: HintbookData;
    node: HintData;
    // Every folder scope above this file, root first. They never emit; they supply the constraints a
    // hole is written against.
    ancestors: HintData[];
};

// A scope that will produce nothing, and why. `no-emitter` is by far the common case and is not an
// error: a repository is allowed to hold specs for targets it has installed no emitter for.
export type EmitSkip = {
    output: string;
    reason: 'no-emitter';
};

export type EmitPlan = {
    units: EmitUnit[];
    skipped: EmitSkip[];
    // Folder scopes seen while walking. Reported so a run over a folder-knowledge repository can say
    // "folder hints do not emit" rather than "nothing matched".
    folders: number;
};

// Walks the parsed tree to every file scope, carrying the chain of folder scopes above it. Folder
// scopes are never emission units — a folder spec describes everything beneath it and has no single
// output — so this is the one place the rule is enforced, and everything downstream inherits it.
function walkFileScopes(hints: HintData[], visit: (node: HintData, ancestors: HintData[]) => void, folders: { count: number }): void {
    const walk = (nodes: HintData[], ancestors: HintData[]): void => {
        for (const node of nodes) {
            if (node.keyword === RUNNING_FILE) {
                visit(node, ancestors);
            } else if (node.keyword === RUNNING_FOLDER) {
                folders.count += 1;

                walk(node.children, [
                    ...ancestors,
                    node,
                ]);
            }
        }
    };

    walk(hints, []);
}

export function planEmit(hints: HintData[], hintbooks: HintbookData[], target?: string): EmitPlan {
    const units: EmitUnit[] = [];
    const skipped: EmitSkip[] = [];
    const folders = { count: 0 };

    walkFileScopes(
        hints,
        (node, ancestors) => {
            const emitter = selectEmitter(hintbooks, node.name, target);

            if (!emitter) {
                skipped.push({ output: node.name, reason: 'no-emitter' });

                return;
            }

            units.push({ output: node.name, target: emitter.target!, emitter, node, ancestors });
        },
        folders,
    );

    return { units, skipped, folders: folders.count };
}

// ---------------------------------------------------------------------------------------------
// Layer 5 — render
// ---------------------------------------------------------------------------------------------

function isScope(hint: HintData): boolean {
    return hint.keyword === RUNNING_FILE || hint.keyword === RUNNING_FOLDER;
}

// A block's declared name, split on its first colon into an identifier and a type. The type half is
// always optional: `## arg invoice` is a spec a person wrote, and demanding `## arg invoice: Invoice`
// would turn authoring back into programming. A template decides how to cope with the absence.
export function splitName(name: string): { ident: string; type: string } {
    const colon = name.indexOf(':');

    if (colon === -1) {
        return { ident: name.trim(), type: '' };
    }

    return { ident: name.slice(0, colon).trim(), type: name.slice(colon + 1).trim() };
}

// The first line of a block's body, for the one-line constraint summaries a hole carries.
function summarize(hint: HintData): string {
    const first = hint.body
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    const label = hint.name ? `${hint.keyword} ${hint.name}` : hint.keyword;

    return first ? `${label} — ${first}` : label;
}

// What a hole must be written to honor: every block in scope that produces no code in this target.
// Derived rather than declared — a block with an emit template becomes the artifact, a block without
// one exists to constrain it — so no keyword list is hardcoded and a new vocabulary needs no changes.
export function collectConstraints(unit: EmitUnit, hintbooks: HintbookData[]): string[] {
    const constraints: string[] = [];

    const collect = (nodes: HintData[], origin: string): void => {
        for (const node of nodes) {
            if (isScope(node)) {
                continue;
            }

            if (findEmitTemplate(unit.emitter, hintbooks, node.keyword)) {
                continue;
            }

            constraints.push(origin ? `${summarize(node)}  (${origin})` : summarize(node));
        }
    };

    for (const ancestor of unit.ancestors) {
        collect(ancestor.children, ancestor.name === '.' ? 'root' : ancestor.name);
    }

    collect(unit.node.children, '');

    return constraints;
}

export type HoleOptions = {
    // Rendered above the hole so whoever fills it can see what governs it without another lookup.
    constraints: string[];
    comment?: string;
    label: string;
    intent: string;
    // Hash of the governing spec block. Recorded on the marker so a body written against an older
    // version of the spec can be reported later instead of quietly standing.
    spec: string;
    // What the body starts as, from the template's `{hole:body|…}` fallback.
    stub: string;
};

// A hole is a region the deterministic emitter provably cannot fill, emitted with the constraints
// that govern it already attached — so the work is specified where it happens rather than in a
// separate briefing nobody reads.
//
// The instructions sit *above* the marker on purpose: everything between the marker and `hint:end` is
// the body, and the body belongs to whoever wrote it. Keeping the regenerated header outside that
// span is what lets a filled body survive re-emission without any escaping or diffing.
export function renderHole(options: HoleOptions): string {
    const header = [];

    if (options.intent) {
        header.push(...options.intent.split('\n').map((line) => line.trimEnd()));
    }

    if (options.constraints.length > 0) {
        header.push('Honor:');
        header.push(...options.constraints.map((constraint) => `  ${constraint}`));
    }

    header.push(`${MARKER_HOLE}(${options.label})${options.spec ? ` spec=${options.spec}` : ''}`);

    return [
        commentBlock(options.comment, header.join('\n')),
        options.stub,
        commentBlock(options.comment, MARKER_END),
    ]
        .filter((part) => part !== '')
        .join('\n');
}

function renderBlock(hint: HintData, unit: EmitUnit, hintbooks: HintbookData[], constraints: string[]): string {
    const template = findEmitTemplate(unit.emitter, hintbooks, hint.keyword);

    // No template, no output. This is the whole anti-bloat mechanism, and nothing configures it: a
    // `decision` has no TypeScript template, so it never becomes code.
    if (!template) {
        return '';
    }

    const { ident, type } = splitName(hint.name);

    const renderChildren = (placeholder: Placeholder, single: boolean): Resolved => {
        const wanted = placeholder.argument ? (canonicalKeyword(hintbooks, placeholder.argument) ?? placeholder.argument) : null;

        const matched = hint.children.filter((child) => {
            if (isScope(child)) {
                return false;
            }

            return wanted === null || (canonicalKeyword(hintbooks, child.keyword) ?? child.keyword) === wanted;
        });

        const rendered = matched.map((child) => renderBlock(child, unit, hintbooks, constraints)).filter(Boolean);
        const value = single ? (rendered[0] ?? '') : rendered.join(placeholder.separator ?? '\n');

        return resolvedValue(value, placeholder);
    };

    // Placeholders that take no argument reject one, so a brace construct that merely looks like a
    // placeholder — `{id: string}` in a TypeScript type literal — falls through to literal text.
    const plain = (value: string, placeholder: Placeholder): Resolved | null =>
        placeholder.argument === null ? resolvedValue(value, placeholder) : null;

    const content = renderTemplate(template.content, (placeholder) => {
        switch (placeholder.kind) {
            case 'name':
                return plain(hint.name, placeholder);
            case 'id':
                return plain(hint.id, placeholder);
            case 'ident':
                return plain(ident, placeholder);
            case 'type':
                return plain(type, placeholder);
            case 'body':
                return plain(hint.body.trim(), placeholder);
            case 'doc':
                return plain(commentBlock(unit.emitter.comment, hint.body), placeholder);
            case 'children':
                return renderChildren(placeholder, false);
            case 'child':
                return renderChildren(placeholder, true);
            case 'hole':
                return {
                    value: renderHole({
                        constraints,
                        comment: unit.emitter.comment,
                        label: placeholder.argument ?? 'body',
                        intent: hint.body.trim(),
                        spec: hashHint(hint).slice(0, 8),
                        stub: placeholder.fallback ?? '',
                    }),
                    empty: false,
                };
            default:
                // Not a placeholder this target defines — emit the braces verbatim rather than
                // silently swallowing a piece of the artifact.
                return null;
        }
    });

    return content.trim();
}

// The artifact a single spec produces. Deterministic: the same spec and the same emitter always give
// byte-identical output, which is what makes `--check` an assertion rather than an opinion.
export function renderArtifact(unit: EmitUnit, hintbooks: HintbookData[]): string {
    const constraints = collectConstraints(unit, hintbooks);

    const blocks = unit.node.children
        .filter((child) => !isScope(child))
        .map((child) => renderBlock(child, unit, hintbooks, constraints))
        .filter(Boolean);

    return blocks.join('\n\n');
}
