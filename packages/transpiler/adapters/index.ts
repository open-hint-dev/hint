// Built-in language adapters.
//
// An emit pack names one with `"symbols": "hint:<name>"`. Anything else in that field is still an
// external command, unchanged — the two live side by side, and a pack can override a built-in by
// naming a command instead. A built-in costs no install and no network; an external one can be
// written in any language and lives outside this repository. Neither replaces the other.
//
// Every built-in here parses with the language's *own* parser — the project's `typescript`, Python's
// `ast`, Go's `go/ast`. None of them is a parser we wrote. That is the entry requirement: a
// hand-rolled parser that is subtly wrong produces confident, wrong conformance findings, which is
// worse than having no adapter at all, and the whole point of this layer is to be trustworthy enough
// to gate CI on.

import { readFile } from '../helper.js';
import type { AdapterReading } from './contract.js';
import { jsonSymbols, tomlSymbols, yamlSymbols } from './data.js';
import { goSymbols } from './go.js';
import { pythonSymbols } from './python.js';
import { rubySymbols } from './ruby.js';
import { sqlSymbols } from './sql.js';
import { collectSymbols, loadTypeScript, loadTypeScriptModule } from './typescript.js';

// `hint:` rather than a bare name, so a pack that means to run a program called `typescript` still
// can, and so a reader can tell at a glance which of the two kinds a manifest is asking for.
export const BUILTIN_PREFIX = 'hint:';

// The same contract an external adapter has: symbols, or null with the reason there is no answer. A
// built-in gets no license to be vaguer about failing than a subprocess is.
export type BuiltinAdapter = (projectRootPath: string, file: string) => Promise<AdapterReading>;

const TYPESCRIPT: BuiltinAdapter = async (projectRootPath, file) => {
    const { ts, incompatible } = await loadTypeScriptModule(projectRootPath);

    // Found but unusable is a different problem from absent, and has a different fix. TypeScript 7
    // dropped the classic syntactic API from the package root; until this adapter speaks the new one,
    // saying which version is in the way beats a generic "did not answer".
    if (incompatible) {
        return {
            symbols: null,
            failure:
                `typescript ${incompatible} in this project does not expose the classic parser API this adapter uses ` +
                `— pin 5.x or 6.x for shape checking, or declare a "symbols" command on the emit pack`,
        };
    }

    if (!ts) {
        return {
            symbols: null,
            failure: 'typescript is not resolvable from this project — this adapter parses with the project’s own copy, so add it as a devDependency',
        };
    }

    const content = await readFile(`${projectRootPath}/${file}`);

    // An unreadable target is not a target with no symbols. Reporting it as empty would turn every
    // missing output into a wall of conformance failures that all say the same useless thing.
    if (content === null) {
        return { symbols: null, failure: `cannot read ${file}` };
    }

    try {
        return { symbols: collectSymbols(ts, file, content) };
    } catch (error: unknown) {
        return { symbols: null, failure: `could not parse ${file}: ${(error as Error).message}` };
    }
};

const BUILTINS: Record<string, BuiltinAdapter> = {
    // One parser, told which dialect it is reading. `.js`, `.jsx` and `.tsx` are decided per file.
    typescript: TYPESCRIPT,
    javascript: TYPESCRIPT,
    python: pythonSymbols,
    go: goSymbols,
    ruby: rubySymbols,
    json: jsonSymbols,
    yaml: yamlSymbols,
    toml: tomlSymbols,
    // Reads SQLite-dialect DDL. Another dialect wants an external command — see the note in sql.ts.
    sql: sqlSymbols,
};

export function builtinNames(): string[] {
    return Object.keys(BUILTINS).sort();
}

// Null when `command` does not address a built-in at all, which is how the caller knows to run it as
// an external command instead.
export function findBuiltinAdapter(command: string): BuiltinAdapter | null {
    if (!command.startsWith(BUILTIN_PREFIX)) {
        return null;
    }

    return BUILTINS[command.slice(BUILTIN_PREFIX.length).trim()] ?? null;
}

export {
    collectSymbols,
    goSymbols,
    jsonSymbols,
    loadTypeScript,
    loadTypeScriptModule,
    pythonSymbols,
    rubySymbols,
    sqlSymbols,
    tomlSymbols,
    yamlSymbols,
};
