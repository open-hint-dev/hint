// The built-in adapters for structured data: JSON, YAML, TOML.
//
// A configuration file has surfaces a spec can meaningfully declare — "there is a `database` section
// and it has a `host`" — and they are exactly as checkable as a function signature. Each top-level
// key becomes a symbol whose `kind` is the type of its value, and a mapping's own keys become its
// fields. That is the whole mapping, and it is deliberately shallow: a spec declares a shape, not a
// whole document.
//
// Types here are the *value's* type as it appears in the file — `string`, `number`, `boolean`,
// `array`, `object`, `null`. A spec that wrote no type still asserts the key exists, which is the
// same bargain every other adapter makes.
//
// All three share one mapping. JSON and YAML are parsed in process — Node parses one, and the engine
// already depends on a YAML parser for `hint.yml`. TOML is handed to Python's `tomllib`, which prints
// the document as JSON: still a real parser, still nothing to install beyond a python3 the machine
// has anyway.

import { parse as parseYaml } from 'yaml';

import { readFile } from '../helper.js';
import type { AdapterReading, CodeSymbol, SymbolMember } from './contract.js';
import { runText } from './run.js';

function typeName(value: unknown): string {
    if (value === null) {
        return 'null';
    }

    if (Array.isArray(value)) {
        return 'array';
    }

    return typeof value;
}

function fieldsOf(value: unknown): SymbolMember[] | undefined {
    if (typeName(value) !== 'object') {
        return undefined;
    }

    return Object.entries(value as Record<string, unknown>).map(
        ([
            name,
            nested,
        ]) => ({ name, type: typeName(nested) }),
    );
}

// A document that is not a mapping — a bare array, a scalar — declares no named surfaces at all. That
// is an empty symbol table rather than a failure: the file parsed, it simply names nothing.
export function documentSymbols(document: unknown): CodeSymbol[] {
    if (typeName(document) !== 'object') {
        return [];
    }

    return Object.entries(document as Record<string, unknown>).map(
        ([
            name,
            value,
        ]) => ({
            kind: typeName(value),
            name,
            fields: fieldsOf(value),
        }),
    );
}

async function fromText(projectRootPath: string, file: string, parse: (text: string) => unknown): Promise<AdapterReading> {
    const content = await readFile(`${projectRootPath}/${file}`);

    if (content === null) {
        return { symbols: null, failure: `cannot read ${file}` };
    }

    try {
        return { symbols: documentSymbols(parse(content)) };
    } catch (error: unknown) {
        // A file that does not parse is not a file with no keys, and reporting it as empty would make
        // every declared surface look missing because of one stray comma.
        return { symbols: null, failure: `could not parse ${file}: ${(error as Error).message}` };
    }
}

export async function jsonSymbols(projectRootPath: string, file: string): Promise<AdapterReading> {
    return fromText(projectRootPath, file, (text) => JSON.parse(text));
}

export async function yamlSymbols(projectRootPath: string, file: string): Promise<AdapterReading> {
    return fromText(projectRootPath, file, (text) => parseYaml(text));
}

// `tomllib` landed in Python 3.11. An older interpreter fails on the import and says so, which is the
// right answer — better than a TOML reader written here that would be quietly wrong on a corner.
const TOML_SCRIPT = `
import json, sys

try:
    import tomllib
except ModuleNotFoundError:
    sys.stderr.write('python 3.11+ is needed for TOML (tomllib)')
    sys.exit(2)

with open(sys.argv[1], 'rb') as handle:
    json.dump(tomllib.load(handle), sys.stdout)
`;

export async function tomlSymbols(projectRootPath: string, file: string): Promise<AdapterReading> {
    const { stdout, failure } = await runText(
        'python3',
        [
            '-c',
            TOML_SCRIPT,
            file,
        ],
        projectRootPath,
    );

    if (stdout === null) {
        return { symbols: null, failure };
    }

    try {
        return { symbols: documentSymbols(JSON.parse(stdout)) };
    } catch {
        return { symbols: null, failure: 'produced no readable document' };
    }
}
