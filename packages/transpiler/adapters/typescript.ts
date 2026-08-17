// The built-in TypeScript adapter.
//
// `typescript` is imported for *types only* — the value is resolved at run time from the project
// being checked, never from anything HINT ships. That is what lets this live in the engine without
// contradicting the engine being language-free:
//
//   - nothing is added to any install. A repository of legal matters pulls no compiler.
//   - the parse uses the project's own TypeScript version, which is more honest than one we pin.
//   - a project without TypeScript installed simply gets no answer, and `verify` says so out loud
//     rather than reporting a shape check it never ran.
//
// The `symbols: "<command>"` extension point is untouched: any other language is still an external
// command, and one can override this one. This is a battery included, not a door closed.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type * as Ts from 'typescript';

import type { CodeSymbol, SymbolMember } from './contract.js';

// Resolved from the project root, so a package in a monorepo gets whichever TypeScript its own tree
// provides. The specifier reaching `import()` is a runtime value on purpose: a bundler cannot follow
// it, which keeps the compiler out of the CLI bundle as well as out of its dependencies.
//
// Two entry points are tried, because the package has not always mapped `.` to the compiler.
const ENTRIES = [
    'typescript',
    'typescript/lib/typescript.js',
];

// What this adapter needs is the classic syntactic API. TypeScript 7 — the native port — no longer
// exports it from the package root: `.` resolves to a version stub, and the parser lives behind an
// API the project itself labels unstable. Checking for the members up front turns that into one
// clear sentence instead of `Cannot read properties of undefined` from somewhere inside a walk.
function usable(module: unknown): module is typeof Ts {
    const candidate = module as Partial<typeof Ts> | undefined;

    return typeof candidate?.createSourceFile === 'function' && candidate?.ScriptTarget !== undefined && candidate?.ScriptKind !== undefined;
}

export type TypeScriptLoad = {
    ts: typeof Ts | null;
    // Set when TypeScript was found but is not one this adapter can drive. Distinct from not finding
    // it at all, because the fix is different: one is an install, the other is a version.
    incompatible?: string;
};

export async function loadTypeScript(projectRootPath: string): Promise<typeof Ts | null> {
    return (await loadTypeScriptModule(projectRootPath)).ts;
}

export async function loadTypeScriptModule(projectRootPath: string): Promise<TypeScriptLoad> {
    const require = createRequire(pathToFileURL(`${projectRootPath}/`));

    let found = false;

    for (const entry of ENTRIES) {
        let resolved: string;

        try {
            resolved = require.resolve(entry);
        } catch {
            continue;
        }

        found = true;

        try {
            const loaded = (await import(pathToFileURL(resolved).href)) as { default?: unknown };

            // `typescript` is CommonJS, so the namespace object carries the module under `default`
            // and only some of its members alongside. Both shapes are checked.
            for (const candidate of [
                loaded.default,
                loaded,
            ]) {
                if (usable(candidate)) {
                    return { ts: candidate };
                }
            }
        } catch {
            continue;
        }
    }

    if (!found) {
        return { ts: null };
    }

    let version = 'unknown';

    try {
        version = (require('typescript/package.json') as { version?: string }).version ?? version;
    } catch {
        // A package that does not expose its own manifest still gets a useful message, just a vaguer one.
    }

    return {
        ts: null,
        incompatible: version,
    };
}

// Types are reported as the annotation the author *wrote*, not as a checker-resolved type. That is
// deliberate: the spec says `## arg invoice: Invoice`, written by a person, and the honest comparison
// is against the annotation a person wrote in the code. Resolving `Invoice` to its structural shape
// would make every such comparison fail for a reason nobody asked about — and it would require a
// full program build, turning a per-file question into a whole-project one.
function typeText(node: Ts.TypeNode | undefined): string | undefined {
    if (!node) {
        return undefined;
    }

    const text = node.getText().replace(/\s+/g, ' ').trim();

    return text || undefined;
}

function memberName(ts: typeof Ts, node: Ts.PropertyName | Ts.BindingName | undefined): string {
    if (!node) {
        return '';
    }

    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
        return node.text;
    }

    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return node.text;
    }

    // A destructured or computed parameter has no single name a spec could have declared, so it is
    // reported as unnamed rather than as a guess.
    return '';
}

function parameters(ts: typeof Ts, node: Ts.SignatureDeclarationBase): SymbolMember[] {
    const params: SymbolMember[] = [];

    for (const parameter of node.parameters) {
        const name = memberName(ts, parameter.name);

        if (name) {
            params.push({ name, type: typeText(parameter.type) });
        }
    }

    return params;
}

function properties(ts: typeof Ts, members: Ts.NodeArray<Ts.TypeElement | Ts.ClassElement>): SymbolMember[] {
    const fields: SymbolMember[] = [];

    for (const member of members) {
        if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
            const name = memberName(ts, member.name);

            if (name) {
                fields.push({ name, type: typeText(member.type) });
            }
        }
    }

    return fields;
}

// A `const f = (…) => …` or `const f = function (…) {}` is a function declaration in every way that
// matters to a spec, so it is reported as one rather than being invisible.
function functionInitializer(ts: typeof Ts, node: Ts.VariableDeclaration): Ts.ArrowFunction | Ts.FunctionExpression | null {
    if (!node.initializer) {
        return null;
    }

    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        return node.initializer;
    }

    return null;
}

// The TypeScript parser reads JavaScript too — it is the same parser, told which dialect it is
// looking at. So JavaScript costs no second adapter and no second implementation: `.jsx` needs the
// JSX dialect or every tag is a syntax error, and `.js` must not be read as TypeScript or a file
// using `<T>` as a cast would be misread.
function scriptKind(ts: typeof Ts, fileName: string): Ts.ScriptKind {
    if (fileName.endsWith('.tsx')) {
        return ts.ScriptKind.TSX;
    }

    if (fileName.endsWith('.jsx')) {
        return ts.ScriptKind.JSX;
    }

    if (/\.(js|mjs|cjs)$/.test(fileName)) {
        return ts.ScriptKind.JS;
    }

    return ts.ScriptKind.TS;
}

// Parses one file syntactically — no program, no type checker, no tsconfig resolution. The question
// "what does this file declare?" is answerable from the file alone, and keeping it that way means the
// adapter costs milliseconds and cannot fail because some unrelated file does not compile.
export function collectSymbols(ts: typeof Ts, fileName: string, content: string): CodeSymbol[] {
    const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKind(ts, fileName));
    const symbols: CodeSymbol[] = [];

    const visit = (node: Ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name) {
            symbols.push({ kind: 'function', name: node.name.text, params: parameters(ts, node), returns: typeText(node.type) });
        } else if (ts.isInterfaceDeclaration(node)) {
            symbols.push({ kind: 'interface', name: node.name.text, fields: properties(ts, node.members) });
        } else if (ts.isClassDeclaration(node) && node.name) {
            symbols.push({ kind: 'class', name: node.name.text, fields: properties(ts, node.members) });
        } else if (ts.isEnumDeclaration(node)) {
            symbols.push({
                kind: 'enum',
                name: node.name.text,
                fields: node.members.map((member) => ({ name: memberName(ts, member.name) })).filter((member) => member.name),
            });
        } else if (ts.isTypeAliasDeclaration(node)) {
            const fields = ts.isTypeLiteralNode(node.type) ? properties(ts, node.type.members) : [];

            symbols.push({ kind: 'type', name: node.name.text, fields });
        } else if (ts.isVariableStatement(node)) {
            for (const declaration of node.declarationList.declarations) {
                const name = memberName(ts, declaration.name);
                const initializer = functionInitializer(ts, declaration);

                if (!name) {
                    continue;
                }

                if (initializer) {
                    symbols.push({ kind: 'function', name, params: parameters(ts, initializer), returns: typeText(initializer.type) });
                } else {
                    symbols.push({ kind: 'const', name, returns: typeText(declaration.type) });
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    visit(source);

    return symbols;
}
