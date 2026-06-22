# How HINT Works: The Compilation Pipeline

This document describes the internal mechanics of the HINT engine — how files are found, parsed, and compiled into the final prompt. The pipeline lives in [`@openhint/transpiler`](../packages/transpiler/README.md) and runs in three stages:

```
paths ──► find ──► HintFileData tree ──► parse ──► HintData tree ──► compile ──► prompt
                                                            ▲
                                              hintbooks ────┘
```

---

## Stage 1 — Find

`findHints(projectRootPath, paths)` turns the requested paths into a tree of hint files.

1. **Normalization.** Each argument is resolved against the project root (arguments escaping the root are dropped). Globs are expanded. A folder becomes its `_.hint`; a source file becomes its `<file>.hint` companion; a path that does not exist is still kept — specs can define files before they are created.
2. **Sorting.** Paths are ordered folder-first, parents before children, `_.hint` before its siblings — so the tree builds deterministically regardless of argument order. Duplicates are removed.
3. **Tree building.** Every file is attached to its folder's `_.hint` node, and missing intermediate folder hints are synthesized up to the project root. The result is always rooted at the project's `_.hint`, mirroring how context inherits.

## Stage 2 — Parse

`parseHints(projectRootPath, paths, dryRun)` reads each node of the tree and produces `HintData` — the typed block tree.

**Reading.** Existing files are read; a missing `_.hint` counts as empty (the folder still wraps its children); a missing companion hint is skipped silently, or throws if `dryRun` is set.

**Markdown processing.** `@include` directives are expanded first — each referenced file's raw text is inlined in place (quotes optional; leading `/` resolves from the project root, otherwise relative to the including file with a project-root fallback). The combined text then runs through a remark pipeline: parse → extract `{#id}` heading ids.

**Block extraction.** Top-level nodes are walked once with a heading stack:

- A heading becomes a `HintData` with `level` (heading depth), `keyword` (first word), `name` (the rest), `id`, and an empty body. It is pushed as a child of the nearest shallower heading.
- Non-heading nodes accumulate and flush as the **previous** heading's `body` when the next heading (of any level) or end of file arrives — serialized back to markdown.
- Content before the first heading becomes the file node's own body.

**Wrapping.** Each file becomes a `HintData` with a *running keyword*: `__file__` for companion hints, `__folder__` for `_.hint` — with `name` set to the target path relative to the project root (the `.hint` extension stripped; the folder path for folder hints; `.` for the root). Parsed headings come first in `children`, followed by recursively parsed child files.

## Stage 3 — Compile

`compileHints(hints, hintbooks, mode)` renders the block tree to the final prompt string.

**Instruction lookup.** For every block, the compiler searches the requested mode's instructions across all hintbooks in order, falling back to the default mode (`compile`). An instruction matches by `name` or by one of its `synonyms`. Running keywords (`__file__`, `__folder__`, `__header__`, `__footer__`) resolve through exactly the same lookup — they are ordinary instructions.

**Rendering.** Children are compiled first and joined with blank lines. Then the block's instruction template is interpolated:

| Placeholder | Value |
| --- | --- |
| `{id}` | the block's id |
| `{name}` | the block's name |
| `{body}` | the block's body markdown |
| `{children}` | the compiled children |

Special cases:

- An instruction with `exclude: true` front matter drops the block — and everything beneath it — from the output.
- A keyword with no instruction passes through: body and compiled children, no wrapper.

**Wrapping.** The compiled roots are joined and framed by the mode's `__header__` and `__footer__` instructions — the role definition and closing checklist that turn rendered specs into an actionable prompt.

## Hintbook resolution

Books listed in `hint.yml` resolve to instruction folders before compilation:

1. The prefix picks the **base directories**: `file://<path>` resolves relative to the project root; `npm://<name>` tries the project's `node_modules/<name>` first, then global installs. A bare path behaves like `file://`.
2. Within the first base that exists, every directory containing a `hintbook.json` is a hintbook — one book entry may therefore yield several (a package can ship a collection).
3. Each discovered folder is loaded: `hintbook.json` provides identity, every `*.md` file becomes an instruction, and a `.{mode}.md` suffix assigns it to a mode (no suffix means the default `compile` mode).

See [Hintbooks](05-hintbooks.md) for the authoring guide.

## Determinism

Every stage is deterministic: sorted traversal, stable tree synthesis, ordered hintbook lookup, and pure template interpolation. The same specs, hintbooks, and mode always produce byte-identical output — which makes compiled prompts reviewable and diffable artifacts.
