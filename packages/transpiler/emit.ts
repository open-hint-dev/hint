import * as Path from 'node:path';

import type { HintbookData, InstructionData } from './hintbook.js';
import type { HintData } from './parser.js';
import type { Placeholder, Resolved } from './template.js';
import { findInstruction } from './compiler.js';
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

// A constraint as it appears in a hole: its label, then its body in full, indented under it.
//
// In full, not summarized — because the constraints reaching a hole are now scoped to the block that
// owns it, so there are a handful rather than a repository's worth, and the one that matters most is
// usually a step list. A `flow` truncated to its first line is exactly the wrong half.
function summarize(hint: HintData): string {
    const label = hint.name ? `${hint.keyword} ${hint.name}` : hint.keyword;
    const body = hint.body.trim();

    if (!body) {
        return label;
    }

    return [
        `${label}:`,
        ...body.split('\n').map((line) => `  ${line}`.trimEnd()),
    ].join('\n');
}

// Whether a block contributes text to a hole: it must produce no code in this target, and must not be
// excluded by its own vocabulary. Derived rather than declared — a block with an emit template becomes
// the artifact, a block without one exists to constrain it — so no keyword list is hardcoded.
//
// `exclude` is honoured here as strictly as it is at render time. A hintbook marks a keyword excluded
// to say it must never leave the spec (`notes` is a private scratchpad), and a generated file is the
// last place that promise may quietly break.
function isConstraint(node: HintData, unit: EmitUnit, hintbooks: HintbookData[]): boolean {
    if (isScope(node) || findEmitTemplate(unit.emitter, hintbooks, node.keyword)) {
        return false;
    }

    return !findInstruction(hintbooks, node.keyword)?.metadata?.exclude;
}

// Constraint blocks anywhere beneath `node`, in document order. Recursive on purpose: a `flow` or a
// declared error nested under a `func` is the specification of that function's body, and it is the
// most relevant thing a hole can carry.
function collectBeneath(node: HintData, unit: EmitUnit, hintbooks: HintbookData[], into: HintData[]): void {
    for (const child of node.children) {
        if (isScope(child)) {
            continue;
        }

        if (isConstraint(child, unit, hintbooks)) {
            into.push(child);
        }

        collectBeneath(child, unit, hintbooks, into);
    }
}

// What a hole must be written to honor, narrowed to what is actually about this hole: the constraints
// declared inside the block that owns it, then the file's own.
//
// Inherited folder knowledge is named, not inlined. `hint <path>` already returns that chain in full,
// and reproducing it inside every hole of every file would duplicate the retrieval layer into the
// artifact — which is the opposite of the reason scoping exists.
export function collectConstraints(unit: EmitUnit, hintbooks: HintbookData[], owner?: HintData): string[] {
    const own: HintData[] = [];

    if (owner) {
        collectBeneath(owner, unit, hintbooks, own);
    }

    for (const node of unit.node.children) {
        if (node !== owner && isConstraint(node, unit, hintbooks)) {
            own.push(node);
        }
    }

    const constraints = own.map(summarize);
    const inherited = unit.ancestors.map((ancestor) => (ancestor.name === '.' ? '.' : ancestor.name)).filter((name) => name !== '');

    if (inherited.length > 0) {
        constraints.push(`plus the knowledge inherited from ${inherited.join(', ')} — run \`hint ${unit.output}\``);
    }

    return constraints;
}

export type HoleOptions = {
    // Rendered above the hole so whoever fills it can see what governs it without another lookup.
    constraints: string[];
    comment?: string;
    label: string;
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

    // The block's own body is deliberately not repeated here. A template that wants it renders `{doc}`
    // immediately above, and printing it twice costs context on every read of the file for nothing —
    // which matters most for the reader this is built for, who pays for the whole file each time.
    if (options.constraints.length > 0) {
        header.push('Honor:');

        for (const constraint of options.constraints) {
            header.push(...constraint.split('\n').map((line) => `  ${line}`.trimEnd()));
        }
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

// Everything one render of one artifact needs. `holes` is the set of labels already emitted into it,
// so a collision is suffixed rather than silently producing two regions that address the same body.
type RenderContext = {
    unit: EmitUnit;
    hintbooks: HintbookData[];
    holes: Set<string>;
};

// The address of a block within its file. A declared `{#id}` wins outright and stands alone, because
// an id is unique by construction and survives a rename — and a hole body is the one thing in the
// artifact that cannot be regenerated, so its address has to be the most stable one available.
function blockKey(hint: HintData, parentKey: string): string {
    if (hint.id) {
        return `#${hint.id}`;
    }

    const segment = hint.name ? `${hint.keyword} ${hint.name}` : hint.keyword;

    return parentKey ? `${parentKey} > ${segment}` : segment;
}

// A hole is addressed by the block that owns it, never by the label its template happens to use.
// Every `func` in a file renders the same `{hole:body}`, so an unqualified label made two functions
// address the same body — and re-emission then wrote one implementation into both, reporting success.
function holeLabel(context: RenderContext, key: string, label: string): string {
    const base = key ? `${key}:${label}` : label;

    let unique = base;
    let suffix = 2;

    while (context.holes.has(unique)) {
        unique = `${base}#${suffix++}`;
    }

    context.holes.add(unique);

    return unique;
}

function renderBlock(hint: HintData, key: string, context: RenderContext): string {
    const { unit, hintbooks } = context;
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

        const rendered = matched.map((child) => renderBlock(child, blockKey(child, key), context)).filter(Boolean);
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
                        constraints: collectConstraints(unit, hintbooks, hint),
                        comment: unit.emitter.comment,
                        label: holeLabel(context, key, placeholder.argument ?? 'body'),
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
    const context: RenderContext = { unit, hintbooks, holes: new Set() };

    const blocks = unit.node.children
        .filter((child) => !isScope(child))
        .map((child) => renderBlock(child, blockKey(child, ''), context))
        .filter(Boolean);

    return blocks.join('\n\n');
}
