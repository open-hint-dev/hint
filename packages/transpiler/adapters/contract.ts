// The symbol table every adapter — built-in or external — speaks in.
//
// It lives below both of them so neither has to import the other: `symbols.ts` chooses an adapter,
// the adapters produce readings, and both need this shape. Putting it in either one would make the
// dependency a cycle.

// One declared name in a symbol: a parameter, or a field of a structure. `type` is absent when the
// adapter could not determine one — which is treated exactly like a spec that did not state one.
export type SymbolMember = {
    name: string;
    type?: string;
};

// A symbol a file actually contains. `kind` is the adapter's own word for it (`function`,
// `interface`, `struct`, `class`); nothing here interprets it, so a new language needs no changes.
export type CodeSymbol = {
    kind: string;
    name: string;
    params?: SymbolMember[];
    returns?: string;
    fields?: SymbolMember[];
};

// What an adapter had to say. `symbols` is null whenever there is no honest answer; `failure` is the
// reason, and its absence means "no adapter was asked", not "the adapter succeeded".
export type AdapterReading = {
    symbols: CodeSymbol[] | null;
    failure?: string;
};

function parseMembers(value: unknown): SymbolMember[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const members: SymbolMember[] = [];

    for (const entry of value) {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';

        if (name) {
            members.push({ name, type: typeof entry?.type === 'string' && entry.type.trim() ? entry.type.trim() : undefined });
        }
    }

    return members;
}

// Parses an adapter's stdout. Anything malformed yields null rather than a partial reading: a
// half-understood symbol table would produce confident, wrong verification findings, which is worse
// than falling back to the presence lint.
export function parseSymbols(stdout: string): CodeSymbol[] | null {
    let data: unknown;

    try {
        data = JSON.parse(stdout);
    } catch {
        return null;
    }

    const list = (data as { symbols?: unknown })?.symbols;

    if (!Array.isArray(list)) {
        return null;
    }

    const symbols: CodeSymbol[] = [];

    for (const entry of list) {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';

        if (!name) {
            continue;
        }

        symbols.push({
            kind: typeof entry?.kind === 'string' ? entry.kind.trim() : '',
            name,
            params: parseMembers(entry?.params),
            returns: typeof entry?.returns === 'string' && entry.returns.trim() ? entry.returns.trim() : undefined,
            fields: parseMembers(entry?.fields),
        });
    }

    return symbols;
}
