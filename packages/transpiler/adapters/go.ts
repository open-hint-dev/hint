// The built-in Go adapter.
//
// Go's own parser, through `go/ast` in its standard library. Unlike Python there is no way to hand a
// program to the toolchain on stdin, so the helper is materialized into a cache directory and run
// with `go run`. It imports nothing outside the standard library, so it compiles offline, and Go's
// own build cache makes every run after the first one take milliseconds.
//
// The cache directory is keyed by a hash of the program, so an upgraded HINT writes a new one instead
// of running a stale helper, and nothing has to be invalidated by hand.

import * as Crypto from 'node:crypto';
import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import type { AdapterReading } from './contract.js';
import { describeFailure, runAdapter } from './run.js';

const MODULE = 'module hintgo\n\ngo 1.21\n';

const PROGRAM = `package main

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
)

type member struct {
	Name string \`json:"name"\`
	Type string \`json:"type,omitempty"\`
}

type symbol struct {
	Kind    string   \`json:"kind"\`
	Name    string   \`json:"name"\`
	Params  []member \`json:"params,omitempty"\`
	Returns string   \`json:"returns,omitempty"\`
	Fields  []member \`json:"fields,omitempty"\`
}

// The type exactly as written in the source. Reconstructing it from the AST would normalize away the
// spelling a person chose, and the spec it is compared against was written by that person.
func typeText(fset *token.FileSet, src []byte, expr ast.Expr) string {
	if expr == nil {
		return ""
	}

	return string(src[fset.Position(expr.Pos()).Offset:fset.Position(expr.End()).Offset])
}

func main() {
	if len(os.Args) < 2 {
		os.Exit(2)
	}

	src, err := os.ReadFile(os.Args[1])

	if err != nil {
		os.Stderr.WriteString(err.Error())
		os.Exit(2)
	}

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, os.Args[1], src, 0)

	if err != nil {
		os.Stderr.WriteString(err.Error())
		os.Exit(2)
	}

	symbols := []symbol{}

	for _, decl := range file.Decls {
		switch node := decl.(type) {
		case *ast.FuncDecl:
			found := symbol{Kind: "function", Name: node.Name.Name}

			// A method is addressed by its own name: a spec declaring 'func Settle' means the method
			// as readily as the function, and nothing here can know which the author meant.
			if node.Type.Params != nil {
				for _, param := range node.Type.Params.List {
					for _, name := range param.Names {
						found.Params = append(found.Params, member{Name: name.Name, Type: typeText(fset, src, param.Type)})
					}
				}
			}

			// Go returns a tuple; a spec's single '## result' can only be about the first of them,
			// which by convention is the value and not the error.
			if node.Type.Results != nil && len(node.Type.Results.List) > 0 {
				found.Returns = typeText(fset, src, node.Type.Results.List[0].Type)
			}

			symbols = append(symbols, found)
		case *ast.GenDecl:
			for _, spec := range node.Specs {
				switch declared := spec.(type) {
				case *ast.TypeSpec:
					found := symbol{Kind: "type", Name: declared.Name.Name}

					if structure, ok := declared.Type.(*ast.StructType); ok {
						found.Kind = "struct"

						for _, field := range structure.Fields.List {
							for _, name := range field.Names {
								found.Fields = append(found.Fields, member{Name: name.Name, Type: typeText(fset, src, field.Type)})
							}
						}
					}

					if _, ok := declared.Type.(*ast.InterfaceType); ok {
						found.Kind = "interface"
					}

					symbols = append(symbols, found)
				case *ast.ValueSpec:
					for index, name := range declared.Names {
						found := symbol{Kind: "const", Name: name.Name, Returns: typeText(fset, src, declared.Type)}

						_ = index

						symbols = append(symbols, found)
					}
				}
			}
		}
	}

	json.NewEncoder(os.Stdout).Encode(map[string][]symbol{"symbols": symbols})
}
`;

function cacheDir(): string {
    const fingerprint = Crypto.createHash('sha256').update(PROGRAM).digest('hex').slice(0, 12);

    return Path.join(Os.tmpdir(), `hint-adapter-go-${fingerprint}`);
}

// Written once per version of the program. Concurrent `hint` runs may race here, and both write
// identical bytes, so the loser of the race is harmless.
async function materialize(): Promise<string> {
    const directory = cacheDir();

    await FsPromises.mkdir(directory, { recursive: true });
    await FsPromises.writeFile(Path.join(directory, 'go.mod'), MODULE, 'utf8');
    await FsPromises.writeFile(Path.join(directory, 'main.go'), PROGRAM, 'utf8');

    return directory;
}

export async function goSymbols(projectRootPath: string, file: string): Promise<AdapterReading> {
    let directory: string;

    try {
        directory = await materialize();
    } catch (error: unknown) {
        return { symbols: null, failure: `could not prepare the Go helper: ${describeFailure(error)}` };
    }

    // Run from the helper's own module so the project's `go.mod` — or its absence — has no say, and
    // pass the target as an absolute path because the working directory is no longer the project's.
    return runAdapter(
        'go',
        [
            'run',
            '.',
            Path.resolve(projectRootPath, file),
        ],
        directory,
    );
}
