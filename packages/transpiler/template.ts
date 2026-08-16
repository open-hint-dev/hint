// The emit template language. It is the same `{placeholder}` shape hintbook authors already write in
// instruction templates, plus the three things code needs and prose does not: picking children by
// keyword, degrading gracefully when the spec left something unstated, and marking a region the
// deterministic emitter cannot fill.
//
// Everything here is pure string work over a resolver callback — it knows nothing about hints,
// hintbooks, or languages, which is what keeps the emitter itself small and testable.

// One parsed placeholder. `kind` is the leading word, `argument` the part after a colon
// (`children:arg` -> `arg`), `separator` the `sep="..."` option, `fallback` the `|literal` tail.
export type Placeholder = {
    kind: string;
    argument: string | null;
    separator: string | null;
    fallback: string | null;
};

// What a resolver hands back. `value` is the text; `empty` says the spec had nothing to say here,
// which is what an enclosing optional group reacts to. The two are distinct: a resolver may return a
// deliberate empty string that should NOT collapse its group.
export type Resolved = {
    value: string;
    empty: boolean;
};

// Returning null means "this is not a placeholder" — the braces and everything between them are
// emitted verbatim. Code templates are full of literal braces, and the resolver is the only party
// that knows which names its target actually defines, so it gets the final say.
export type Resolver = (placeholder: Placeholder) => Resolved | null;

const SEPARATOR = /\bsep\s*=\s*"((?:[^"\\]|\\.)*)"/;

function unescape(value: string): string {
    return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(.)/g, '$1');
}

export function parsePlaceholder(source: string): Placeholder {
    let rest = source.trim();
    let fallback: string | null = null;

    // The fallback is taken from the tail so a `sep="a|b"` earlier in the expression cannot be
    // mistaken for one.
    const separatorMatch = SEPARATOR.exec(rest);
    const separator = separatorMatch ? unescape(separatorMatch[1]!) : null;

    if (separatorMatch) {
        rest = `${rest.slice(0, separatorMatch.index)}${rest.slice(separatorMatch.index + separatorMatch[0].length)}`.trim();
    }

    const pipe = rest.indexOf('|');

    if (pipe !== -1) {
        fallback = rest.slice(pipe + 1).trim();
        rest = rest.slice(0, pipe).trim();
    }

    const colon = rest.indexOf(':');
    const kind = colon === -1 ? rest.trim() : rest.slice(0, colon).trim();
    const argument = colon === -1 ? null : rest.slice(colon + 1).trim() || null;

    return { kind, argument, separator, fallback };
}

// Finds the `}` closing the `{` at `open`, counting nested braces so an optional group may contain
// placeholders. Returns -1 when the template is unbalanced, which the caller reports as literal text
// rather than throwing — a malformed template should degrade, not take the run down.
function findClosing(template: string, open: number): number {
    let depth = 0;

    for (let index = open; index < template.length; index++) {
        if (template[index] === '{') {
            depth += 1;
        } else if (template[index] === '}') {
            depth -= 1;

            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

// The whitespace prefix of the line `index` sits on, when nothing but whitespace precedes it. A
// multi-line expansion is re-indented to match, so `{hole:body}` written one tab in emits a block
// that is one tab in rather than flush against the margin.
function lineIndent(template: string, index: number): string | null {
    const start = template.lastIndexOf('\n', index - 1) + 1;
    const prefix = template.slice(start, index);

    return /^[ \t]*$/.test(prefix) ? prefix : null;
}

function indentLines(value: string, indent: string): string {
    if (!indent || !value.includes('\n')) {
        return value;
    }

    return value
        .split('\n')
        .map((line, position) => (position === 0 || line === '' ? line : `${indent}${line}`))
        .join('\n');
}

type Rendered = {
    text: string;
    // True when at least one placeholder reported that the spec said nothing. An optional group
    // collapses on this, which is how a missing type removes the annotation instead of emitting a
    // dangling colon.
    empty: boolean;
};

// A brace opens a placeholder only when a well-formed expression closes it on the same line. Emit
// templates are code, and code is full of braces that mean themselves: `func f() {` opens a block,
// not a substitution. Requiring a leading letter and forbidding a newline separates the two without
// the template author having to escape anything.
function placeholderEnd(template: string, open: number): number {
    if (!/^[A-Za-z]/.test(template.slice(open + 1, open + 2))) {
        return -1;
    }

    for (let index = open + 1; index < template.length; index++) {
        const char = template[index];

        if (char === '\n' || char === '{') {
            return -1;
        }

        if (char === '}') {
            return index;
        }
    }

    return -1;
}

function render(template: string, resolve: Resolver): Rendered {
    let text = '';
    let empty = false;
    let cursor = 0;

    while (cursor < template.length) {
        const open = template.indexOf('{', cursor);

        if (open === -1) {
            text += template.slice(cursor);
            break;
        }

        text += template.slice(cursor, open);

        const indent = lineIndent(template, open);

        // An optional group may span lines and nest, so it is scanned by balanced braces.
        if (template.startsWith('{?', open)) {
            const close = findClosing(template, open);

            if (close === -1) {
                text += '{';
                cursor = open + 1;
                continue;
            }

            const group = render(template.slice(open + 2, close), resolve);

            // The whole segment disappears if anything inside had nothing to say. This is where an
            // unstated type stops being a problem for the author and becomes one for the template.
            if (!group.empty) {
                text += indentLines(group.text, indent ?? '');
            }

            cursor = close + 1;
            continue;
        }

        const close = placeholderEnd(template, open);
        const resolved = close === -1 ? null : resolve(parsePlaceholder(template.slice(open + 1, close)));

        if (resolved === null) {
            text += '{';
            cursor = open + 1;
            continue;
        }

        if (resolved.empty) {
            empty = true;
        }

        text += indentLines(resolved.value, indent ?? '');
        cursor = close + 1;
    }

    return { text, empty };
}

export function renderTemplate(template: string, resolve: Resolver): string {
    return render(template, resolve).text;
}

// Applies a fallback and reports emptiness uniformly, so every resolver treats "the spec did not say"
// the same way. A resolver calls this rather than assembling `Resolved` by hand.
export function resolvedValue(value: string, placeholder: Placeholder): Resolved {
    if (value !== '') {
        return { value, empty: false };
    }

    return placeholder.fallback === null ? { value: '', empty: true } : { value: placeholder.fallback, empty: false };
}

// Wraps text in the target's comment form. `comment` is a `{text}` pattern — `// {text}`,
// `# {text}`, `<!-- {text} -->` — applied per line so a multi-paragraph body stays commented.
export function commentBlock(comment: string | undefined, text: string): string {
    const trimmed = text.trim();

    if (!trimmed) {
        return '';
    }

    if (!comment) {
        return trimmed;
    }

    return trimmed
        .split('\n')
        .map((line) => comment.replace('{text}', line).trimEnd())
        .join('\n');
}
