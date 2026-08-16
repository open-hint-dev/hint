import * as Ts from 'typescript';

// The symbol contract HINT consumes. Kept structurally identical to `@openhint/transpiler`'s reader
// rather than imported from it: an adapter is a standalone process on the far side of a JSON
// boundary, and coupling it to the engine's build would defeat the point of keeping languages out of
// the engine.
export type SymbolMember = {
    name: string;
    type?: string;
};

export type CodeSymbol = {
    kind: string;
    name: string;
    params?: SymbolMember[];
    returns?: string;
    fields?: SymbolMember[];
};

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

function memberName(node: Ts.PropertyName | Ts.BindingName | undefined): string {
    if (!node) {
        return '';
    }

    if (Ts.isIdentifier(node) || Ts.isPrivateIdentifier(node)) {
        return node.text;
    }

    if (Ts.isStringLiteral(node) || Ts.isNumericLiteral(node)) {
        return node.text;
    }

    // A destructured or computed parameter has no single name a spec could have declared, so it is
    // reported as unnamed rather than as a guess.
    return '';
}

function parameters(node: Ts.SignatureDeclarationBase): SymbolMember[] {
    const params: SymbolMember[] = [];

    for (const parameter of node.parameters) {
        const name = memberName(parameter.name);

        if (name) {
            params.push({ name, type: typeText(parameter.type) });
        }
    }

    return params;
}

function properties(members: Ts.NodeArray<Ts.TypeElement | Ts.ClassElement>): SymbolMember[] {
    const fields: SymbolMember[] = [];

    for (const member of members) {
        if (Ts.isPropertySignature(member) || Ts.isPropertyDeclaration(member)) {
            const name = memberName(member.name);

            if (name) {
                fields.push({ name, type: typeText(member.type) });
            }
        }
    }

    return fields;
}

// A `const f = (…) => …` or `const f = function (…) {}` is a function declaration in every way that
// matters to a spec, so it is reported as one rather than being invisible.
function functionInitializer(node: Ts.VariableDeclaration): Ts.ArrowFunction | Ts.FunctionExpression | null {
    if (!node.initializer) {
        return null;
    }

    if (Ts.isArrowFunction(node.initializer) || Ts.isFunctionExpression(node.initializer)) {
        return node.initializer;
    }

    return null;
}

// Parses one file syntactically — no program, no type checker, no tsconfig resolution. The question
// "what does this file declare?" is answerable from the file alone, and keeping it that way means the
// adapter costs milliseconds and cannot fail because some unrelated file does not compile.
export function collectSymbols(fileName: string, content: string): CodeSymbol[] {
    const source = Ts.createSourceFile(fileName, content, Ts.ScriptTarget.Latest, true, Ts.ScriptKind.TS);
    const symbols: CodeSymbol[] = [];

    const visit = (node: Ts.Node): void => {
        if (Ts.isFunctionDeclaration(node) && node.name) {
            symbols.push({ kind: 'function', name: node.name.text, params: parameters(node), returns: typeText(node.type) });
        } else if (Ts.isInterfaceDeclaration(node)) {
            symbols.push({ kind: 'interface', name: node.name.text, fields: properties(node.members) });
        } else if (Ts.isClassDeclaration(node) && node.name) {
            symbols.push({ kind: 'class', name: node.name.text, fields: properties(node.members) });
        } else if (Ts.isEnumDeclaration(node)) {
            symbols.push({
                kind: 'enum',
                name: node.name.text,
                fields: node.members.map((member) => ({ name: memberName(member.name) })).filter((member) => member.name),
            });
        } else if (Ts.isTypeAliasDeclaration(node)) {
            const fields = Ts.isTypeLiteralNode(node.type) ? properties(node.type.members) : [];

            symbols.push({ kind: 'type', name: node.name.text, fields });
        } else if (Ts.isVariableStatement(node)) {
            for (const declaration of node.declarationList.declarations) {
                const name = memberName(declaration.name);
                const initializer = functionInitializer(declaration);

                if (!name) {
                    continue;
                }

                if (initializer) {
                    symbols.push({ kind: 'function', name, params: parameters(initializer), returns: typeText(initializer.type) });
                } else {
                    symbols.push({ kind: 'const', name, returns: typeText(declaration.type) });
                }
            }
        }

        Ts.forEachChild(node, visit);
    };

    visit(source);

    return symbols;
}
