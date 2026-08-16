// Drafting a spec from code that already exists.
//
// Every other part of HINT assumes the spec came first. A repository that did not start that way
// needs an on-ramp, or adoption means writing everything by hand — which is why most spec-driven
// tooling only ever gets used on greenfield work.
//
// This reads the same symbol table `verify` compares against, so a language costs one adapter and
// gets conformance checking and brownfield adoption together. What it cannot recover is the half that
// matters most — *why* the code is the way it is — so the draft says so rather than pretending to be
// finished knowledge.

import type { HintbookData } from './hintbook.js';
import type { CodeSymbol, SymbolMember } from './symbols.js';

// How this target's symbol kinds map onto the vocabulary's keywords, declared on the emit pack. It has
// to be declared rather than inferred: the engine knows no keywords, and a template cannot be read
// backwards. `param` / `field` / `result` name the keywords used for the members of a surface.
export type ExtractMap = Record<string, string>;

const MEMBER_ROLES = [
    'param',
    'field',
    'result',
];

export function extractMap(emitter: HintbookData | null): ExtractMap | null {
    const map = emitter?.extract;

    if (!map) {
        return null;
    }

    return Object.keys(map).some((key) => !MEMBER_ROLES.includes(key)) ? map : null;
}

// `name: Type`, or just the name when the adapter reported no annotation. The colon convention is the
// same one templates read with `{ident}` / `{type}`, and it stays optional in both directions.
function declared(member: SymbolMember): string {
    return member.type ? `${member.name}: ${member.type}` : member.name;
}

function block(level: number, keyword: string, name: string): string {
    return `${'#'.repeat(level)} ${keyword} ${name}`.trimEnd();
}

const PREAMBLE = [
    'Drafted by `hint extract` from the code as it stands. It records the shape that is already there;',
    'it does not yet record why any of it is the way it is.',
    '',
    'Before committing this: delete what is obvious from the code, and add the part no parser could',
    'recover — the decisions and their rationale, the invariants, the approaches that were tried and',
    'abandoned. A spec that only restates the code is a copy that will drift.',
].join('\n');

// Renders one file's symbols as a draft spec. Deterministic, so re-running on an unchanged file
// produces an unchanged draft and a reviewer can see exactly what moved.
export function draftSpec(symbols: CodeSymbol[], map: ExtractMap): string {
    const sections: string[] = [];

    for (const symbol of symbols) {
        const keyword = map[symbol.kind];

        // A kind this target has not mapped is skipped rather than guessed at. Inventing a keyword
        // would produce a spec whose blocks mean nothing to the vocabulary that has to render them.
        if (!keyword) {
            continue;
        }

        const lines = [block(1, keyword, symbol.name)];

        for (const param of symbol.params ?? []) {
            if (map.param) {
                lines.push('', block(2, map.param, declared(param)));
            }
        }

        for (const field of symbol.fields ?? []) {
            if (map.field) {
                lines.push('', block(2, map.field, declared(field)));
            }
        }

        // Written tight against the keyword — `## result: Receipt` — because that is how a person
        // annotates a type, and the parser normalizes the trailing colon back off the keyword.
        if (symbol.returns && map.result) {
            lines.push('', `## ${map.result}: ${symbol.returns}`);
        }

        sections.push(lines.join('\n'));
    }

    if (sections.length === 0) {
        return '';
    }

    return `${[
        PREAMBLE,
        ...sections,
    ].join('\n\n')}\n`;
}
