import * as Ts from 'typescript';

import { collectSymbols, loadTypeScript, loadTypeScriptModule } from './typescript.js';

// The adapter is handed the TypeScript module rather than importing it, because at run time it comes
// from the project being checked. Here the workspace's own copy stands in for that.
function symbols(source: string) {
    return collectSymbols(Ts, 'src/a.ts', source);
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

describe('loadTypeScript', () => {
    // Not merely non-null: `typescript` is CommonJS, and the module namespace an `import()` produces
    // carries some members directly and the rest only under `default`. A test that stopped at
    // non-null passed while every parse failed on an undefined enum.
    it('resolves a module that can actually parse', async () => {
        const loaded = await loadTypeScript(process.cwd());

        expect(loaded).not.toBeNull();
        expect(typeof loaded!.createSourceFile).toBe('function');
        expect(loaded!.ScriptTarget?.Latest).toBeDefined();
        expect(loaded!.ScriptKind?.TSX).toBeDefined();
        expect(collectSymbols(loaded!, 'a.ts', 'export function f(a: string): void {}')).toEqual([
            { kind: 'function', name: 'f', params: [{ name: 'a', type: 'string' }], returns: 'void' },
        ]);
    });

    // The failure that must never be silent: a project with no TypeScript gets no symbol table, and
    // `verify` reports the weaker check it actually ran instead of a pass it never established.
    it('returns null rather than throwing when the project has none', async () => {
        expect(await loadTypeScript('/nonexistent-project-root')).toBeNull();
    });
});

// TypeScript 7 — the native port — no longer exports the classic syntactic API from the package root.
// Resolving the project's own copy is what makes that reachable, so it has to be reported as a
// version problem rather than as a missing install or as a crash halfway through a walk.
describe('a typescript this adapter cannot drive', () => {
    it('separates "not installed" from "installed but wrong API"', async () => {
        const absent = await loadTypeScriptModule('/nonexistent-project-root');

        expect(absent.ts).toBeNull();
        expect(absent.incompatible).toBeUndefined();
    });

    it('finds a usable API in this workspace', async () => {
        const found = await loadTypeScriptModule(process.cwd());

        expect(found.incompatible).toBeUndefined();
        expect(found.ts).not.toBeNull();
    });
});
