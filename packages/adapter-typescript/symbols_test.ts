import { collectSymbols } from './symbols.js';

function symbols(source: string) {
    return collectSymbols('src/a.ts', source);
}

describe('collectSymbols', () => {
    it('reports a function with its written annotations', () => {
        expect(symbols('export function settle(invoice: Invoice, options): Receipt { return null!; }')).toEqual([
            {
                kind: 'function',
                name: 'settle',
                params: [
                    { name: 'invoice', type: 'Invoice' },
                    { name: 'options', type: undefined },
                ],
                returns: 'Receipt',
            },
        ]);
    });

    // A `const f = () => …` is a function in every way that matters to a spec.
    it('reports an arrow function assigned to a const', () => {
        expect(symbols('export const settle = (invoice: Invoice): Receipt => null!;')).toEqual([
            { kind: 'function', name: 'settle', params: [{ name: 'invoice', type: 'Invoice' }], returns: 'Receipt' },
        ]);
    });

    it('reports interface fields', () => {
        expect(symbols('export interface Invoice { id: string; total: Decimal; settle(): void; }')).toEqual([
            {
                kind: 'interface',
                name: 'Invoice',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'total', type: 'Decimal' },
                ],
            },
        ]);
    });

    it('reports a type alias to a literal, and its fields', () => {
        expect(symbols('export type Invoice = { id: string };')).toEqual([{ kind: 'type', name: 'Invoice', fields: [{ name: 'id', type: 'string' }] }]);
    });

    it('reports a class and its properties', () => {
        expect(symbols('export class BadInvoice extends Error { code: string = "x"; run() {} }')).toEqual([
            { kind: 'class', name: 'BadInvoice', fields: [{ name: 'code', type: 'string' }] },
        ]);
    });

    it('reports an enum and its members', () => {
        expect(symbols('export enum Status { Ok, Failed }')).toEqual([
            {
                kind: 'enum',
                name: 'Status',
                fields: [
                    { name: 'Ok' },
                    { name: 'Failed' },
                ],
            },
        ]);
    });

    it('reports a plain const with its annotation', () => {
        expect(symbols('export const MAX_RETRIES: number = 3;')).toEqual([{ kind: 'const', name: 'MAX_RETRIES', returns: 'number' }]);
    });

    // The annotation is reported as written. Resolving `Invoice` to its structural shape would make
    // every comparison against a human-written spec fail for a reason nobody asked about.
    it('collapses whitespace inside an annotation but does not resolve it', () => {
        expect(symbols('export function f(a: {\n  id: string;\n}): void {}')[0]!.params).toEqual([{ name: 'a', type: '{ id: string; }' }]);
    });

    it('skips a parameter with no name a spec could have declared', () => {
        expect(symbols('export function f({ a, b }: Options, c: number): void {}')[0]!.params).toEqual([{ name: 'c', type: 'number' }]);
    });

    it('finds declarations nested inside a namespace', () => {
        expect(symbols('export namespace billing { export function settle(): void {} }').map((symbol) => symbol.name)).toContain('settle');
    });

    it('returns nothing for a file that declares nothing', () => {
        expect(symbols('import "./side-effect.js";')).toEqual([]);
    });
});
