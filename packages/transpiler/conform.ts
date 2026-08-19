// Conformance: does the file actually contain what its spec declared?
//
// This replaces asking "does this name appear somewhere in the file", which is what `verify` could do
// before an adapter existed and which — by the measured experience of running it — caught almost
// nothing. With a symbol table it can compare shape: the declared parameters, their types, the return.
//
// One rule governs the whole comparison: **only what the spec stated is checked.** `## arg invoice`
// is a spec a person wrote, and it asserts that a parameter called `invoice` exists — nothing about
// its type. Strictness is proportional to how much the author chose to write down, which is the same
// bargain the rest of the tool makes.

import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import type { CodeSymbol, SymbolMember } from './symbols.js';
import { findInstruction } from './compiler.js';
import { canonicalKeyword, splitName } from './emit.js';
import { RESULT_KEYWORDS } from './result-keywords.js';
import { isScopeNode as isScope } from './tree.js';

// The keywords whose blocks describe a member of the surface they are nested under. Resolved through
// the vocabulary's own synonyms, so `# argument` reaches the same expectation as `# arg`.
const PARAM_KEYWORDS = [
    'arg',
    'param',
    'parameter',
];
const FIELD_KEYWORDS = [
    'field',
    'column',
    'property',
];
// What a spec declared about one surface, reduced to the parts a symbol table can be compared with.
// Everything here is optional because everything in the spec is: an empty `params` means the author
// declared no parameters, not that the function must take none.
export type Expectation = {
    keyword: string;
    name: string;
    params: SymbolMember[];
    fields: SymbolMember[];
    returns?: string;
};

export type FindingKind = 'missing-symbol' | 'missing-param' | 'wrong-param-type' | 'missing-field' | 'wrong-field-type' | 'wrong-return';

export type Finding = {
    kind: FindingKind;
    surface: string;
    detail: string;
};

function matches(hintbooks: HintbookData[], keyword: string, wanted: string[]): boolean {
    const canonical = canonicalKeyword(hintbooks, keyword) ?? keyword;

    return wanted.includes(canonical.toLowerCase());
}

// A member as the spec declared it: the identifier always, the type only when the author wrote one.
function member(hint: HintData): SymbolMember {
    const { ident, type } = splitName(hint.name);

    return { name: ident, type: type || undefined };
}

// Every surface a file spec declares, with the members nested under it. A surface is any block whose
// keyword the hintbooks flag `surface: true` — the same definition the presence lint already uses, so
// nothing new has to be declared to opt in.
export function collectExpectations(fileNode: HintData, hintbooks: HintbookData[]): Expectation[] {
    const expectations: Expectation[] = [];

    const walk = (nodes: HintData[]): void => {
        for (const node of nodes) {
            if (isScope(node)) {
                continue;
            }

            if (!findInstruction(hintbooks, node.keyword)?.metadata?.surface || !node.name.trim()) {
                walk(node.children);

                continue;
            }

            const { ident } = splitName(node.name);
            const params: SymbolMember[] = [];
            const fields: SymbolMember[] = [];
            // A member of a surface is not a surface of its own. `## field total` under `# entity
            // Invoice` describes a property of Invoice, and vocabularies do flag `field` itself as a
            // surface — so without this, every field would additionally be looked for as a top-level
            // symbol and reported missing from a file that contains it perfectly well.
            const consumed = new Set<HintData>();

            let returns: string | undefined;

            for (const child of node.children) {
                if (matches(hintbooks, child.keyword, PARAM_KEYWORDS)) {
                    params.push(member(child));
                    consumed.add(child);
                } else if (matches(hintbooks, child.keyword, FIELD_KEYWORDS)) {
                    fields.push(member(child));
                    consumed.add(child);
                } else if (matches(hintbooks, child.keyword, RESULT_KEYWORDS)) {
                    const declared = splitName(child.name);

                    returns = declared.type || declared.ident || undefined;
                    consumed.add(child);
                }
            }

            expectations.push({ keyword: node.keyword, name: ident, params, fields, returns });

            walk(node.children.filter((child) => !consumed.has(child)));
        }
    };

    walk(fileNode.children);

    return expectations;
}

// Type comparison is exact after trimming, and only runs when both sides stated one. Anything cleverer
// — normalizing `string[]` against `Array<string>`, resolving an alias — needs a type system, which is
// the adapter's job and not this module's. A false mismatch is a bug report; a false pass is a lie.
function sameType(declared: string | undefined, actual: string | undefined): boolean {
    if (!declared || !actual) {
        return true;
    }

    return declared.trim() === actual.trim();
}

function findMember(members: SymbolMember[] | undefined, name: string): SymbolMember | undefined {
    return (members ?? []).find((candidate) => candidate.name === name);
}

export function compareExpectations(expectations: Expectation[], symbols: CodeSymbol[]): Finding[] {
    const findings: Finding[] = [];
    const byName = new Map(
        symbols.map((symbol) => [
            symbol.name,
            symbol,
        ]),
    );

    for (const expectation of expectations) {
        const label = `${expectation.keyword} ${expectation.name}`;
        const symbol = byName.get(expectation.name);

        if (!symbol) {
            findings.push({ kind: 'missing-symbol', surface: label, detail: 'declared by the spec, absent from the file' });

            continue;
        }

        for (const declared of expectation.params) {
            const actual = findMember(symbol.params, declared.name);

            if (!actual) {
                findings.push({ kind: 'missing-param', surface: label, detail: `parameter '${declared.name}' is missing` });
            } else if (!sameType(declared.type, actual.type)) {
                findings.push({
                    kind: 'wrong-param-type',
                    surface: label,
                    detail: `parameter '${declared.name}' is ${actual.type}, spec says ${declared.type}`,
                });
            }
        }

        for (const declared of expectation.fields) {
            const actual = findMember(symbol.fields, declared.name);

            if (!actual) {
                findings.push({ kind: 'missing-field', surface: label, detail: `field '${declared.name}' is missing` });
            } else if (!sameType(declared.type, actual.type)) {
                findings.push({
                    kind: 'wrong-field-type',
                    surface: label,
                    detail: `field '${declared.name}' is ${actual.type}, spec says ${declared.type}`,
                });
            }
        }

        if (!sameType(expectation.returns, symbol.returns)) {
            findings.push({ kind: 'wrong-return', surface: label, detail: `returns ${symbol.returns}, spec says ${expectation.returns}` });
        }
    }

    return findings;
}

export function formatFindings(target: string, findings: Finding[]): string {
    const lines = [`- ${target}: ${findings.length} conformance failure(s):`];

    for (const finding of findings) {
        lines.push(`    - ${finding.surface} — ${finding.detail}`);
    }

    return lines.join('\n');
}
