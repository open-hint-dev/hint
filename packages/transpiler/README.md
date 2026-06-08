# @openhint/transpiler

Parse HINT specification files and compile them into implementation prompts for AI coding agents.

**Requirements:** Node.js 22 or newer, ESM only. Not compatible with CommonJS or browser environments — the parser and compiler use Node.js filesystem APIs.

## Installation

```sh
npm install @openhint/transpiler
```

## Usage

### Parse and compile

The standard pipeline: parse one or more HINT specification files, then compile the result into a prompt string.

```js
import { parse, compile } from '@openhint/transpiler';

const result = await parse(['src/auth/login.ts.hint']);

const prompt = await compile({
    projectRoot: result.projectRoot,
    targetPaths: result.targetPaths,
    ignore: result.config.ignore,
    blocks: result.blocks,
    reads: result.reads,
});

console.log(prompt);
```

### Programmatic compiler input

Construct `CompilerInput` directly when you have your own block source:

```js
import { compile } from '@openhint/transpiler';

const prompt = await compile({
    projectRoot: '/path/to/project',
    targetPaths: ['src/auth/login.ts.hint'],
    ignore: [],
    blocks: [
        {
            directive: 'lang',
            name: undefined,
            body: 'TypeScript (Node.js 22+ / ESM)',
            sourcePath: '_.hint',
            sourceKind: 'baseline',
        },
    ],
    reads: new Map(),
});
```

### Error handling

```js
import { is, ErrorCode, serialize } from '@openhint/transpiler';

try {
    await parse(['missing.hint']);
} catch (error) {
    if (is(error, ErrorCode.IO_ERROR)) {
        console.error('File not found:', serialize(error));
    } else if (is(error, ErrorCode.PARSE_ERROR)) {
        console.error('Malformed specification:', serialize(error));
    } else {
        throw error;
    }
}
```

## Entry points

| Import path | Contents |
|---|---|
| `@openhint/transpiler` | Parser, compiler, error utilities, and keyword registry |
| `@openhint/transpiler/keywords` | Keyword registry, directive list, render helpers |

## API

### Parser

- `parse(paths)` — parse HINT files and return a `ParseResult`
- `findProjectRoot(startDir)` — locate the `hint.yml` / `hint.yaml` project root
- `normalizeInputPaths(paths)` — append `.hint` where missing
- `createIgnoreMatcher(projectRoot, patterns)` — build a gitignore-style path filter

### Compiler

- `compile(input)` — render a `CompilerInput` into a complete prompt string
- `filterIgnored(input)` — apply project ignore patterns before rendering
- `buildRepositoryContext(input)` — build the path manifest section
- `renderRepositoryContext(context)` — render the XML context block
- `renderSourceMarker(sourceIds)` — render a `<source_ref>` tag

### Errors

- `ErrorCode` — `PARSE_ERROR | REFERENCE_ERROR | IO_ERROR | UNKNOWN_ERROR`
- `create(code, message, options?)` — create a structured `AppError`
- `wrap(raw, code?, meta?)` — wrap any caught value into an `AppError`
- `is(value, code?)` — type-guard check for `AppError`
- `serialize(error)` — convert to a plain loggable object
- `fire(code, message, options?)` — create and throw immediately

### Keywords

- `keywordRegistry` — `Map<Directive, KeywordDefinition>` of all registered directives
- `keywordOrder` — canonical rendering order for directive groups
- `normalizeDirective(value)` — resolve aliases to canonical directive names
- `renderKeyword(block, body, reads)` — render one block to a markdown section
- `getKeyword(directive)` — look up a `KeywordDefinition` by directive
- `validateKeyword(definition, block)` — enforce name and body policies
- `interpolate(template, fields)` — Mustache-style `{{field}}` substitution
- `splitSubBlocks(body)` — extract `## kind label` sub-sections from a block body
- `header` / `footer` — static prompt wrapper strings

### Types

`ParseResult`, `ParsedFile`, `ProjectConfig`, `IgnoreMatcher`, `CompilerInput`, `FilteredCompilerInput`, `RepositoryContext`, `AppError`, `SerializedError`, `ErrorCode`, `RawBlock`, `ReadRef`, `Directive`, `SourceKind`, `KeywordDefinition`, `KeywordInput`, `NamePolicy`, `MergePolicy`, `SubBlock`

---

For HINT syntax documentation, directive reference, and CLI usage see the [repository README](https://github.com/open-hint/hint#readme).

MIT License — Copyright (c) 2026 Andrei Neprel
