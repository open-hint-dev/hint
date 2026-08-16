import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { collectExpectations, compareExpectations } from './conform.js';
import { RUNNING_FILE } from './hintbook.js';
import { adapterCommand, parseSymbols } from './symbols.js';

function block(keyword: string, name: string, children: HintData[] = []): HintData {
    return { level: 1, keyword, id: '', name, body: '', children };
}

function file(children: HintData[]): HintData {
    return { level: 0, keyword: RUNNING_FILE, id: '', name: 'src/a.ts', body: '', children };
}

const hintbooks: HintbookData[] = [
    {
        instructions: [
            { name: 'func', content: '', metadata: { surface: true } },
            { name: 'entity', content: '', metadata: { surface: true } },
            { name: 'arg', content: '', metadata: { synonyms: ['argument'] } },
            { name: 'field', content: '' },
            { name: 'result', content: '', metadata: { synonyms: ['return'] } },
            { name: 'decision', content: '' },
        ],
    },
];

describe('collectExpectations', () => {
    it('reads the members declared under a surface', () => {
        const node = file([
            block('func', 'validateInvoice', [
                block('arg', 'invoice: Invoice'),
                block('arg', 'options'),
                block('result', ': Invoice'),
            ]),
        ]);

        expect(collectExpectations(node, hintbooks)).toEqual([
            {
                keyword: 'func',
                name: 'validateInvoice',
                params: [
                    { name: 'invoice', type: 'Invoice' },
                    { name: 'options', type: undefined },
                ],
                fields: [],
                returns: 'Invoice',
            },
        ]);
    });

    it('resolves member keywords through the vocabulary’s synonyms', () => {
        const node = file([block('func', 'run', [block('argument', 'x: number')])]);

        expect(collectExpectations(node, hintbooks)[0]!.params).toEqual([{ name: 'x', type: 'number' }]);
    });

    // Vocabularies flag `field` as a surface in its own right. Without consuming it as a member of the
    // structure it sits under, every field would also be looked for as a top-level symbol and reported
    // missing from a file that contains it perfectly well.
    it('does not promote a member to a surface of its own', () => {
        const node = file([
            block('entity', 'Invoice', [
                block('field', 'id: string'),
                block('field', 'total: Decimal'),
            ]),
        ]);

        const expectations = collectExpectations(node, [
            { instructions: [...hintbooks[0]!.instructions.filter((i) => i.name !== 'field'), { name: 'field', content: '', metadata: { surface: true } }] },
        ]);

        expect(expectations.map((expectation) => expectation.name)).toEqual(['Invoice']);
        expect(expectations[0]!.fields).toEqual([
            { name: 'id', type: 'string' },
            { name: 'total', type: 'Decimal' },
        ]);
    });

    it('ignores a block whose keyword is not a surface', () => {
        expect(collectExpectations(file([block('decision', 'Use integers')]), hintbooks)).toEqual([]);
    });
});

describe('compareExpectations', () => {
    const expectation = collectExpectations(
        file([
            block('func', 'validateInvoice', [
                block('arg', 'invoice: Invoice'),
                block('arg', 'options'),
                block('result', ': Invoice'),
            ]),
        ]),
        hintbooks,
    );

    it('passes when the file matches what the spec declared', () => {
        expect(
            compareExpectations(expectation, [
                {
                    kind: 'function',
                    name: 'validateInvoice',
                    params: [
                        { name: 'invoice', type: 'Invoice' },
                        { name: 'options', type: 'RunOptions' },
                    ],
                    returns: 'Invoice',
                },
            ]),
        ).toEqual([]);
    });

    // The whole bargain: `## arg options` asserts a parameter exists, and nothing about its type.
    // Checking a type the author never wrote would turn authoring back into programming.
    it('never checks a type the spec did not state', () => {
        const findings = compareExpectations(expectation, [
            { kind: 'function', name: 'validateInvoice', params: [{ name: 'invoice', type: 'Invoice' }, { name: 'options' }], returns: 'Invoice' },
        ]);

        expect(findings).toEqual([]);
    });

    it('reports a surface the file does not contain', () => {
        const findings = compareExpectations(expectation, [{ kind: 'function', name: 'somethingElse' }]);

        expect(findings).toEqual([{ kind: 'missing-symbol', surface: 'func validateInvoice', detail: 'declared by the spec, absent from the file' }]);
    });

    it('reports a missing parameter', () => {
        const findings = compareExpectations(expectation, [
            { kind: 'function', name: 'validateInvoice', params: [{ name: 'invoice', type: 'Invoice' }], returns: 'Invoice' },
        ]);

        expect(findings).toEqual([{ kind: 'missing-param', surface: 'func validateInvoice', detail: "parameter 'options' is missing" }]);
    });

    // This is what a presence lint could never catch: the name is there, the shape is wrong.
    it('reports a parameter whose type contradicts the spec', () => {
        const findings = compareExpectations(expectation, [
            {
                kind: 'function',
                name: 'validateInvoice',
                params: [
                    { name: 'invoice', type: 'string' },
                    { name: 'options' },
                ],
                returns: 'Invoice',
            },
        ]);

        expect(findings).toEqual([
            { kind: 'wrong-param-type', surface: 'func validateInvoice', detail: "parameter 'invoice' is string, spec says Invoice" },
        ]);
    });

    it('reports a return type that contradicts the spec', () => {
        const findings = compareExpectations(expectation, [
            {
                kind: 'function',
                name: 'validateInvoice',
                params: [
                    { name: 'invoice', type: 'Invoice' },
                    { name: 'options' },
                ],
                returns: 'void',
            },
        ]);

        expect(findings).toEqual([{ kind: 'wrong-return', surface: 'func validateInvoice', detail: 'returns void, spec says Invoice' }]);
    });

    it('checks the fields of a declared structure', () => {
        const entity = collectExpectations(
            file([
                block('entity', 'Invoice', [
                    block('field', 'id: string'),
                    block('field', 'total: Decimal'),
                ]),
            ]),
            hintbooks,
        );

        const findings = compareExpectations(entity, [{ kind: 'interface', name: 'Invoice', fields: [{ name: 'id', type: 'string' }] }]);

        expect(findings).toEqual([{ kind: 'missing-field', surface: 'entity Invoice', detail: "field 'total' is missing" }]);
    });
});

describe('parseSymbols', () => {
    it('reads a well-formed symbol table', () => {
        const symbols = parseSymbols('{"symbols":[{"kind":"function","name":"f","params":[{"name":"x","type":"number"}],"returns":"void"}]}');

        expect(symbols).toEqual([{ kind: 'function', name: 'f', params: [{ name: 'x', type: 'number' }], returns: 'void', fields: undefined }]);
    });

    // A half-understood symbol table produces confident, wrong findings — worse than falling back.
    it('returns null for anything malformed rather than a partial reading', () => {
        expect(parseSymbols('not json')).toBeNull();
        expect(parseSymbols('{"symbols":"nope"}')).toBeNull();
        expect(parseSymbols('{}')).toBeNull();
    });

    it('drops an entry with no usable name', () => {
        expect(parseSymbols('{"symbols":[{"kind":"function"},{"kind":"function","name":"f"}]}')).toEqual([
            { kind: 'function', name: 'f', params: undefined, returns: undefined, fields: undefined },
        ]);
    });
});

describe('adapterCommand', () => {
    // Not a shell: the path reaches the adapter as one argument whatever it contains.
    it('substitutes the file into argv without splitting it', () => {
        expect(adapterCommand('npx --yes @openhint/adapter-typescript {file}', 'src/my file.ts')).toEqual([
            'npx',
            '--yes',
            '@openhint/adapter-typescript',
            'src/my file.ts',
        ]);
    });
});
