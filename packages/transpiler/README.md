# @openhint/transpiler

The engine behind [HINT](https://github.com/open-hint-dev/hint#readme) — a context compiler for coding agents. It resolves a path or a query to the markdown-native repository knowledge that applies to it, with folder-to-root inheritance, and renders it for any agent to consume. Software code and legal documents are two of its vocabularies.

This package is the library; the command-line interface lives in [`@openhint/cli`](https://www.npmjs.com/package/@openhint/cli).

## What it does

The transpiler has no built-in keyword vocabulary. It implements the structural pipeline —

```
paths ──► resolveRequests ──► parseHintFiles ──► renderContext ──► scoped knowledge
              (resolve)          (parse)           (render)             │
                                                        ▲              └─► renderPrompt ──► standalone prompt
                                        loadHintbooks ──┘                     (optional framing)
```

Resolution, parsing, and rendering are separate stages. `renderContext` is the core artifact; prompt framing is one wrapper around it, and contract checking (`verify` / `lock` / `diff`) consumes the same parsed tree rather than defining it — so another renderer can be added without touching resolution.

— and renders every block through instruction templates supplied by **hintbooks**, installable keyword vocabularies such as [`@openhint/hintbook-software-engineer`](https://www.npmjs.com/package/@openhint/hintbook-software-engineer).

## Usage

```ts
import { findProjectRoot, loadConfig, loadHintbooks, parseHintFiles, renderContext, renderPrompt, resolveRequests } from '@openhint/transpiler';

const projectRootPath = await findProjectRoot(process.cwd());
const config = await loadConfig(projectRootPath);
const hintbooks = await loadHintbooks(projectRootPath, config?.books ?? []);

// resolve → know what each requested path actually matched
const resolution = await resolveRequests(projectRootPath, ['src/billing/invoice.ts']);

// parse → render
const hints = await parseHintFiles(projectRootPath, resolution.hintPaths);
const context = renderContext(hints, hintbooks);

// optional: wrap as a standalone implementation prompt
const prompt = renderPrompt(context, hintbooks);
```

## API

### Pipeline

| Export                                       | Purpose                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolveRequests(projectRootPath, paths)`    | Resolve each requested path and report what it matched: `spec` (declares its own knowledge), `inherited` (exists, inherits only), or `missing` (names nothing here). Returns the hint paths to parse alongside the per-request verdict. |
| `resolvedNothing(resolution)` / `matchedNothing(resolution)` | Whether any request named nothing in the repository / whether none declared knowledge of its own. The basis for exit code `2`.                                                        |
| `parseHintFiles(projectRootPath, hintPaths)` | Read and parse into typed `HintData` blocks: heading keyword/name/`{#id}`, markdown bodies, nesting by heading depth, `@include` expansion. `parseHints(root, paths)` resolves first as a convenience.                                  |
| `renderContext(hints, hintbooks)`            | Render blocks through hintbook keywords (synonym matching, `exclude` handling, `{id}` / `{name}` / `{body}` / `{children}` interpolation, empty-wrapper elision). The core artifact — no framing.                                       |
| `renderPrompt(context, hintbooks, options)`  | Wrap rendered context in `__header__` / `__footer__`, optionally the `__system__` glossary (`standalone`) and the `__changes__` drift section (`changes`).                                                                              |
| `countScopes(hints)`                         | File and folder scope counts in a parsed tree — what a breadth guard needs in a repository with no companion specs.                                                                                                                    |

### Hintbooks

| Export                                        | Purpose                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveHintbookPaths(projectRootPath, book)` | Resolve a book reference (`file://` path, `npm://` package, or bare path) to every contained folder holding a `hintbook.json`.           |
| `loadHintbook(path)`                          | Load one instruction folder into `HintbookData` — a flat `instructions` list keyed by file name, metadata from front matter. Files with a second extension (1.x mode variants) are ignored. |
| `loadHintbooks(projectRootPath, books)`       | Resolve and load a `books` list; throws on entries that resolve to nothing.                                                              |

### Project configuration

| Export                                   | Purpose                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `findProjectRoot(startPath)`             | Walk up to the nearest `hint.yml` / `hint.yaml`.                                               |
| `findConfig`, `loadConfig`, `saveConfig` | Locate, read, and write the project's `ConfigData` (`name`, `description`, `books`, `ignore`). |
| `CONFIG_INSTRUCTION`                     | The AGENTS.md / CLAUDE.md bootstrap block installed by `hint apply`.                           |

Constants for the running vocabulary (`RUNNING_FILE`, `RUNNING_FOLDER`, `RUNNING_HEADER`, `RUNNING_FOOTER`, `RUNNING_SYSTEM`, `RUNNING_CHANGES`), placeholders (`PLACEHOLDER_ID`, `PLACEHOLDER_NAME`, `PLACEHOLDER_BODY`, `PLACEHOLDER_CHILDREN`), and book prefixes (`URL_FILE_PREFIX`, `URL_NPM_PREFIX`) are exported alongside the types `HintData`, `HintFileData`, `HintbookData`, `InstructionData`, `Resolution`, `PathRequest`, and `ConfigData`.

Migrating to 1.1 → [`docs/07-migration.md`](https://github.com/open-hint-dev/hint/blob/main/docs/07-migration.md).

## Documentation

- [Introduction](https://github.com/open-hint-dev/hint/blob/main/docs/01-intro.md)
- [Syntax specification](https://github.com/open-hint-dev/hint/blob/main/docs/03-syntax.md)
- [How the pipeline works](https://github.com/open-hint-dev/hint/blob/main/docs/04-how-it-works.md)
- [Authoring hintbooks](https://github.com/open-hint-dev/hint/blob/main/docs/05-hintbooks.md)

## License

MIT
