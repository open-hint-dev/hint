# @openhint/transpiler

The engine behind [HINT](https://github.com/open-hint-dev/hint#readme) — a markdown-native specification language for professionals who want to work with AI in a structured, strict way and get predictable results. It compiles human intent into deterministic, high-density prompts for AI agents; software code and legal documents are two of its vocabularies.

This package is the library; the command-line interface lives in [`@openhint/cli`](https://www.npmjs.com/package/@openhint/cli).

## What it does

The transpiler has no built-in keyword vocabulary. It implements the structural pipeline —

```
paths ──► findHints ──► parseHints ──► compileHints ──► prompt string
                                            ▲
                            loadHintbooks ──┘
```

— and renders every block through instruction templates supplied by **hintbooks**, installable keyword vocabularies such as [`@openhint/hintbook-software-engineer`](https://www.npmjs.com/package/@openhint/hintbook-software-engineer).

## Usage

```ts
import { compileHints, findProjectRoot, loadConfig, loadHintbooks, parseHints } from '@openhint/transpiler';

const projectRootPath = await findProjectRoot(process.cwd());
const config = await loadConfig(projectRootPath);

const hintbooks = await loadHintbooks(projectRootPath, config?.books ?? []);
const hints = await parseHints(projectRootPath, ['src/billing/invoice.ts'], false);

const prompt = await compileHints(hints, hintbooks, 'compile');
```

## API

### Pipeline

| Export                                       | Purpose                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `findHints(projectRootPath, paths)`          | Resolve paths (companions, folders, globs) into a `HintFileData` tree rooted at the project's `_.hint`, synthesizing missing folder hints.                                                                                                       |
| `parseHints(projectRootPath, paths, dryRun)` | Read and parse the tree into typed `HintData` blocks: heading keyword/name/`{#id}`, markdown bodies, nesting by heading depth, `@include` expansion. `dryRun` turns missing hint files into errors instead of skips.                             |
| `compileHints(hints, hintbooks, mode)`       | Render blocks through hintbook keywords (mode lookup with fallback to `compile`, synonym matching, `exclude` handling, `{id}` / `{name}` / `{body}` / `{children}` interpolation) and wrap the result in the mode's `__header__` / `__footer__`. |

### Hintbooks

| Export                                        | Purpose                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveHintbookPaths(projectRootPath, book)` | Resolve a book reference (`file://` path, `npm://` package, or bare path) to every contained folder holding a `hintbook.json`.           |
| `loadHintbook(path)`                          | Load one instruction folder into `HintbookData` — keywords keyed by file name, modes by `.{mode}.md` suffix, metadata from front matter. |
| `loadHintbooks(projectRootPath, books)`       | Resolve and load a `books` list; throws on entries that resolve to nothing.                                                              |

### Project configuration

| Export                                   | Purpose                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `findProjectRoot(startPath)`             | Walk up to the nearest `hint.yml` / `hint.yaml`.                                               |
| `findConfig`, `loadConfig`, `saveConfig` | Locate, read, and write the project's `ConfigData` (`name`, `description`, `books`, `ignore`). |
| `CONFIG_INSTRUCTION`                     | The AGENTS.md / CLAUDE.md workflow instruction block emitted by `hint instruct`.               |

Constants for the running vocabulary (`RUNNING_FILE`, `RUNNING_FOLDER`, `RUNNING_HEADER`, `RUNNING_FOOTER`, `RUNNING_SYSTEM`), placeholders (`PLACEHOLDER_ID`, `PLACEHOLDER_NAME`, `PLACEHOLDER_BODY`, `PLACEHOLDER_CHILDREN`), book prefixes (`URL_FILE_PREFIX`, `URL_NPM_PREFIX`), and the default mode (`INSTRUCTION_MODE_DEFAULT`) are exported alongside the types `HintData`, `HintFileData`, `HintbookData`, `InstructionData`, `ModeData`, and `ConfigData`.

## Documentation

- [Introduction](https://github.com/open-hint-dev/hint/blob/main/docs/01-intro.md)
- [Syntax specification](https://github.com/open-hint-dev/hint/blob/main/docs/03-syntax.md)
- [How the pipeline works](https://github.com/open-hint-dev/hint/blob/main/docs/04-how-it-works.md)
- [Authoring hintbooks](https://github.com/open-hint-dev/hint/blob/main/docs/05-hintbooks.md)

## License

MIT
