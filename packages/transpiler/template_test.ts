import type { Placeholder } from './template.js';
import { commentBlock, parsePlaceholder, renderTemplate, resolvedValue } from './template.js';

function resolverFrom(values: Record<string, string>) {
    return (placeholder: Placeholder) => {
        const key = placeholder.argument ? `${placeholder.kind}:${placeholder.argument}` : placeholder.kind;

        return key in values || placeholder.fallback !== null ? resolvedValue(values[key] ?? '', placeholder) : null;
    };
}

// A resolver that claims every name, for the tests about emptiness rather than about recognition.
function anyResolver(values: Record<string, string>) {
    return (placeholder: Placeholder) => resolvedValue(values[placeholder.kind] ?? '', placeholder);
}

describe('parsePlaceholder', () => {
    it('reads a bare name', () => {
        expect(parsePlaceholder('name')).toEqual({ kind: 'name', argument: null, separator: null, fallback: null });
    });

    it('reads an argument after the colon', () => {
        expect(parsePlaceholder('children:arg')).toEqual({ kind: 'children', argument: 'arg', separator: null, fallback: null });
    });

    it('reads a separator and unescapes it', () => {
        expect(parsePlaceholder('children:arg sep=", "').separator).toBe(', ');
        expect(parsePlaceholder('children:field sep="\\n"').separator).toBe('\n');
    });

    it('reads a fallback', () => {
        expect(parsePlaceholder('type|any')).toEqual({ kind: 'type', argument: null, separator: null, fallback: 'any' });
    });

    // The fallback is taken from the tail, so a pipe inside a separator is not mistaken for one.
    it('does not read a pipe inside a separator as a fallback', () => {
        expect(parsePlaceholder('children:arg sep=" | "')).toEqual({ kind: 'children', argument: 'arg', separator: ' | ', fallback: null });
    });
});

describe('renderTemplate', () => {
    it('substitutes plain placeholders', () => {
        expect(renderTemplate('function {name}()', anyResolver({ name: 'validateInvoice' }))).toBe('function validateInvoice()');
    });

    it('leaves an unbalanced brace as literal text rather than throwing', () => {
        expect(renderTemplate('function {name(', anyResolver({ name: 'x' }))).toBe('function {name(');
    });

    it('emits a name the resolver does not claim verbatim', () => {
        expect(renderTemplate('a{nope}b', resolverFrom({}))).toBe('a{nope}b');
    });
});

// Emit templates are code, and code is full of braces that mean themselves. Getting this wrong
// swallows the body of every function in the artifact.
describe('literal braces', () => {
    it('leaves a block brace alone', () => {
        expect(renderTemplate('func {name}() {\n    return nil\n}', resolverFrom({ name: 'f' }))).toBe('func f() {\n    return nil\n}');
    });

    it('leaves a brace followed by a newline alone', () => {
        expect(renderTemplate('x {\n}', resolverFrom({}))).toBe('x {\n}');
    });

    it('leaves a spaced object literal alone', () => {
        expect(renderTemplate('type X = { id: string }', resolverFrom({ id: 'nope' }))).toBe('type X = { id: string }');
    });

    it('leaves a template literal alone', () => {
        expect(renderTemplate('`${x}`', resolverFrom({}))).toBe('`${x}`');
    });
});

// The heart of "a type is optional": the template, not the author, decides how to cope.
describe('optional groups', () => {
    const template = '{ident}{?: {type}}';

    it('renders the group when the spec stated a type', () => {
        expect(renderTemplate(template, anyResolver({ ident: 'invoice', type: 'Invoice' }))).toBe('invoice: Invoice');
    });

    it('drops the whole group when the spec did not', () => {
        expect(renderTemplate(template, anyResolver({ ident: 'invoice' }))).toBe('invoice');
    });

    it('nests', () => {
        expect(renderTemplate('f({?{a}{?, {b}}})', anyResolver({ a: '1', b: '2' }))).toBe('f(1, 2)');
        expect(renderTemplate('f({?{a}{?, {b}}})', anyResolver({ a: '1' }))).toBe('f(1)');
        expect(renderTemplate('f({?{a}{?, {b}}})', anyResolver({}))).toBe('f()');
    });

    // A fallback satisfies the group, because the value is no longer missing.
    it('does not collapse a group whose placeholder has a fallback', () => {
        expect(renderTemplate('{ident} {?{type|any}}', anyResolver({ ident: 'invoice' }))).toBe('invoice any');
    });
});

describe('fallbacks', () => {
    it('substitutes the literal when the spec said nothing', () => {
        expect(renderTemplate('{ident} {type|any}', anyResolver({ ident: 'invoice' }))).toBe('invoice any');
    });

    it('prefers the stated value', () => {
        expect(renderTemplate('{ident} {type|any}', anyResolver({ ident: 'invoice', type: 'Invoice' }))).toBe('invoice Invoice');
    });
});

// Without this every emitted body lands flush against the margin, which no formatter forgives.
describe('indentation', () => {
    it('re-indents a multi-line expansion to the placeholder’s own column', () => {
        expect(renderTemplate('f() {\n    {body}\n}', anyResolver({ body: 'one\ntwo' }))).toBe('f() {\n    one\n    two\n}');
    });

    it('leaves a single-line expansion alone', () => {
        expect(renderTemplate('    {body}', anyResolver({ body: 'one' }))).toBe('    one');
    });

    it('does not indent when something else precedes the placeholder on the line', () => {
        expect(renderTemplate('x = {body}', anyResolver({ body: 'one\ntwo' }))).toBe('x = one\ntwo');
    });
});

describe('commentBlock', () => {
    it('applies the pattern per line', () => {
        expect(commentBlock('// {text}', 'one\ntwo')).toBe('// one\n// two');
    });

    it('handles a wrapping pattern', () => {
        expect(commentBlock('<!-- {text} -->', 'one')).toBe('<!-- one -->');
    });

    it('returns the text unchanged when the target declares no comment form', () => {
        expect(commentBlock(undefined, 'one')).toBe('one');
    });

    it('returns nothing for empty text', () => {
        expect(commentBlock('// {text}', '   ')).toBe('');
    });
});
