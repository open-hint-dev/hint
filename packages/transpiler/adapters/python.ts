// The built-in Python adapter.
//
// Python's own parser, through the `ast` module in its standard library — so this needs nothing
// installed anywhere beyond a `python3` the machine already has, and it cannot be confidently wrong
// the way a hand-written parser would be. The script is passed on the command line rather than
// written to disk: there is no file to leave behind, and nothing to keep in sync with a cache.
//
// Types are reported as the annotation the author wrote (`ast.unparse`), never inferred — the same
// bargain every adapter here makes, because the spec it is compared against was written by a person.

import type { AdapterReading } from './contract.js';
import { runAdapter } from './run.js';

const SCRIPT = `
import ast, json, sys

def ann(node):
    return ast.unparse(node) if node is not None else None

def members(args):
    out = []
    for a in list(args.posonlyargs) + list(args.args) + list(args.kwonlyargs):
        # A method's receiver is not a parameter any spec would declare.
        if a.arg in ('self', 'cls'):
            continue
        out.append({'name': a.arg, 'type': ann(a.annotation)})
    return out

def fields(body):
    out = []
    for s in body:
        if isinstance(s, ast.AnnAssign) and isinstance(s.target, ast.Name):
            out.append({'name': s.target.id, 'type': ann(s.annotation)})
        elif isinstance(s, ast.Assign):
            for t in s.targets:
                if isinstance(t, ast.Name):
                    out.append({'name': t.id})
    return out

def declaration(node):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return {'kind': 'function', 'name': node.name, 'params': members(node.args), 'returns': ann(node.returns)}
    if isinstance(node, ast.ClassDef):
        return {'kind': 'class', 'name': node.name, 'fields': fields(node.body)}
    return None

try:
    tree = ast.parse(open(sys.argv[1], encoding='utf-8').read())
except Exception as error:
    sys.stderr.write(str(error))
    sys.exit(2)

symbols = []

for node in tree.body:
    found = declaration(node)
    if found is not None:
        symbols.append(found)
    elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        symbols.append({'kind': 'const', 'name': node.target.id, 'returns': ann(node.annotation)})
    elif isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name):
                symbols.append({'kind': 'const', 'name': target.id})

json.dump({'symbols': symbols}, sys.stdout)
`;

export async function pythonSymbols(projectRootPath: string, file: string): Promise<AdapterReading> {
    return runAdapter(
        'python3',
        [
            '-c',
            SCRIPT,
            file,
        ],
        projectRootPath,
    );
}
