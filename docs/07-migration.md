# Migrating to 1.4

## Additive changes in 1.4

Knowledge repositories are now a first-class profile. Set `repo: knowledge` only for a repository where `.hint` is the maintained artifact: target-less specs stop appearing as pending, code-oriented staleness is suppressed, and missing paths gain local search suggestions without changing exit code 2. Existing projects with no `repo` field remain code repositories and retain their output.

Hintbooks may provide `__authoring__`, `__config__`, and manifest-level search synonym groups. Reference closure remains unlimited unless `refs_depth` is set. `hint lint --graph` adds advisory cross-file checks; `--strict-graph` promotes them for CI. See [Knowledge repositories](09-knowledge-repos.md).

No migration is required for existing projects or hintbooks.

## What shipped in 1.3

## Breaking changes in 1.3

CLI path arguments now resolve from the current working directory, matching git, grep, and tsc. Internal and lock-file keys remain project-relative and use `/` on every platform.

```diff
  cd src/auth
- hint ../../src/auth/token.ts   # old root-relative habit
+ hint token.ts                  # 1.3: cwd-relative
```

`hint lint` reports near-miss keywords, broken includes, duplicate ids, and empty specs; `--strict-vocab` turns intentional unknown headings into findings. `hint emit --check` now works without paths and checks the whole project. Contract commands consistently expand folder arguments to their file specs.

CI-facing `verify`, `diff`, and `emit --check` now offer stable JSON output, while `apply --check` verifies generated agent instructions without writing. `status` is more tolerant of broken individual specs and substantially reduces Git subprocess work on large repositories. Search tokenization now handles Unicode scripts and canonical equivalence.

The `@openhint/transpiler` package root now has an explicit curated export list. Code that imported incidental constants, tree internals, or interpolation helpers must move that logic behind the documented pipeline and contract APIs. The package name remains unchanged for 1.x: renaming “transpiler” to “engine” was considered, but is deferred to a future major release to avoid a second migration.

New optional integrations do not change existing projects: `hint mcp` exposes read-only context, search, status, and authoring tools without another package; the VS Code extension under `editors/vscode` adds `.hint` highlighting, installed-vocabulary completion, hover, context lookup, and near-miss diagnostics.

## What shipped in 1.2

1.2 folded nine deterministic emit/adapter packs into the software-engineer hintbook (TypeScript, JavaScript, Go, Python, Ruby, SQL, YAML, TOML, and their symbol adapters) and added the lawyer hintbook's Markdown document emitter. `hint extract`, shape-aware `hint verify`, guarded generated regions, preserved holes, and bidirectional output drift are available when those packs are registered.

## Migrating to 1.1

1.1 repositions HINT from "a spec transpiler that emits an implementation prompt" to **spec-as-source without the generator**: the `.hint` files are the source of truth, and `hint` returns the part of that spec which governs the path you are about to touch — rather than a prompt that regenerates it. Your `.hint` files do not change. What changes is what `hint` prints by default, what it says when it cannot answer, and how much CLI there is.

Despite the minor version number, **1.1 contains breaking changes** — the default output of `hint <path>`, several removed commands, a renamed flag, and stricter exit codes. Read this page before upgrading.

Run `hint apply` after upgrading, so your agent files carry the new instruction block.

---

## 1. `hint <path>` returns knowledge, not a prompt

**Before:** every invocation was wrapped in a persona header and a verification/reporting footer, roughly 2.7 KB of fixed scaffolding. On a small spec that was over 90% of the output.

**Now:** the default output is the compiled knowledge alone. The framing moved behind `--prompt`.

```bash
hint src/auth/token.ts             # knowledge only — cheap enough to run before an edit
hint --prompt src/auth/token.ts    # 1.x output: persona header + footer
```

**Migrate:** anywhere you pipe HINT into a fresh agent, add `--prompt`.

```diff
- hint src/auth/login.ts | claude -p
+ hint --prompt src/auth/login.ts | claude -p
```

Leave it off for the far more common case of loading context mid-session. `--standalone` now implies `--prompt`.

Because the tag glossary no longer ships with every render, an agent needs it once from `AGENTS.md` — that is what `hint apply` installs. For a subagent that never loaded those files, use `--standalone`.

## 2. Modes are gone

`--mode`, `hint modes`, `review` mode, and the `__mode__.<mode>.md` / `__header__.<mode>.md` file convention are all removed. Across six independently reported production sessions, `--mode fix` and `--mode review` were used zero times.

- **`--mode review`** — deleted. `hint verify` covers the mechanical half deterministically and for zero tokens; the semantic half is a normal request to your agent.
- **`--mode fix`** — the *behaviour* survives, triggered mechanically instead of selected by hand. When a `hint.lock` exists and blocks have drifted, `hint --prompt <path>` renders the reconciliation guidance automatically.
- **An unknown option now fails.** `hint --mode fix <path>` used to render default-mode output at exit 0; it now errors.

**Migrate — hintbook authors:** flatten your book. A hintbook is a folder of `<keyword>.md` files.

```diff
- keywords/__header__.fix.md      keywords/__header__.review.md
- keywords/__footer__.fix.md      keywords/__footer__.review.md
- keywords/__mode__.fix.md        keywords/__mode__.review.md
- keywords/__changes__.fix.md
+ keywords/__changes__.md
```

Files with a second extension are ignored rather than misread, so an unmigrated book still loads its base vocabulary — but its `__changes__.fix.md` will stop rendering until renamed.

## 3. Commands and flags removed

| Removed | Use instead |
| ------- | ----------- |
| removed instruction-generation command | `hint apply` — the same bytes, written deterministically, no agent and no permission prompt |
| `hint modes` | — (modes are gone) |
| `hint list` | `hint version` — now prints the CLI version, every registered hintbook, its version, and where it resolved from |
| `hint lock --strict` | `hint verify <path> && hint lock <path>` — composable, and gets the exit code right |
| `--with-refs` | nothing; it was already a no-op (references are on by default) |
| `--mode <mode>` | see above |

## 4. `--dry-run` is now `--strict`

It never meant "simulate, change nothing" — it meant "fail if a named path has no spec of its own". It now says so. `--dry-run` remains as a hidden alias, so existing scripts keep working.

```diff
- hint --dry-run 'src/**/*.hint'
+ hint --strict 'src/**/*.hint'
```

## 5. Exit codes are meaningful, and success is no longer reported over nothing

| Code | Meaning |
| ---- | ------- |
| `0` | the operation ran and succeeded |
| `1` | the operation ran and a check failed |
| `2` | nothing you asked for could be resolved |

This is the breaking change most likely to surface a latent problem in an existing repository. In 1.x these all exited `0`:

| Command | 1.0.x | 1.1 |
| ------- | --- | --- |
| `hint no/such/file.ts` | 10 KB of the root spec, empty stderr | same knowledge, but stderr says the path does not exist; exit `2` |
| `hint lock <folder>` | `locked 0 file(s).` | names what it resolved and why it was skipped; exit `2`; no lock file written |
| `hint diff` with an empty lock | `everything up to date.` | `hint.lock tracks 0 files — nothing to compare`; exit `2` |
| `hint verify <folder>` | `verified 0 file(s) — every declared surface is present.` | `no file spec matched — nothing to verify`; exit `2` |

**If your CI starts failing at exit 2, it was passing on an operation that did nothing.** The usual cause is a repository whose knowledge lives entirely in folder `_.hint` files: `lock`, `diff`, and `verify` have never been able to act there, and now say so instead of reporting green. That is a supported and normal shape — those commands simply do not apply to it.

`hint <path>` on a path that exists but declares nothing of its own stays exit `0`: inheriting ancestor knowledge is a successful lookup, not a failure.

## 6. The generated agent block was rewritten

`hint apply` now writes a shorter block built around the actual workflow. Two changes matter:

- **Authoring is permitted.** 1.x said *"Do not read `.hint` files directly"* with no carve-out, which made editing one impossible — every reported session broke the rule. The rule now applies only to *consuming* knowledge.
- **`hint verify` is documented, and the block points at `hint --help`** rather than pretending to be an exhaustive CLI reference.

Re-run `hint apply` to pick it up.

## 7. `hint search` results gained two fields

```diff
  {
    "hint": "src/auth/_.hint",
+   "target": "src/auth",
    "score": 6.12,
+   "weak": false
  }
```

`target` is the path that knowledge governs — pass it straight to `hint <path>`. `weak` marks a result that matched under half your query terms. Weak results are **never** filtered out; when all of them are weak, a note goes to stderr. Existing parsers are unaffected: both fields are additive.

## 8. `hint.lock` no longer gates a plain read

**Before:** with a lock present, `hint <path>` returned *nothing* for a target whose spec and output were unchanged. That made sense while `hint` existed to regenerate code; it does not while `hint` exists to answer "what does this repository know about this path?" — it withheld knowledge precisely when the code was stable, and made what an agent learned about a path depend on the state of `hint.lock`.

**Now:** the freshness gate applies to `--prompt` only. A plain read always returns everything that applies.

```bash
hint src/billing/invoice.ts             # always the full applicable knowledge
hint --prompt src/billing/invoice.ts    # skipped while the spec and its output are unchanged
hint --prompt src/billing/invoice.ts --force   # regenerate regardless
```

**Migrate:** if you scripted `hint <path>` expecting empty output to mean "up to date", use `hint diff <path>` — that is the question it actually answers. `--force` on a plain read is now a no-op and can be dropped.

## 9. New: staleness and `hint status`

Additive; nothing to migrate.

`hint <path>` now checks the hint governing each path you name against git, and writes one advisory stderr line when the code beneath it has moved substantially since that hint was last committed. It never changes stdout or the exit code, and stays silent outside git, for a hint that has never been committed, and for one with uncommitted changes.

`hint status` inventories the whole repository: `stale`, `orphan` (target deleted or renamed), `drifted` / `unlocked` (against `hint.lock`), and `pending` (a spec written ahead of its target). `--json` for machines, `--exit-code` to gate CI.

Two thresholds apply, from the hintbooks' existing `surface: true` flag: a scope that declares surfaces restates the shape of the code and is flagged past a fifth of its files; one that only explains it is flagged past half. See [`docs/06-cli.md`](06-cli.md#hint-status--what-has-come-loose).

## 10. New: `hint emit`

Additive; nothing to migrate. Nothing changes for a project that installs no emitter.

`hint emit` renders the artifact a spec produces, through `<keyword>.tmpl` templates supplied by an **emit pack** — a hintbook carrying a `target` field. Because hintbook resolution already globs `**/hintbook.json` recursively, registering a vocabulary package also registers every emitter it ships.

`hint emit --check` asserts in CI that what is committed equals what the spec produces. See [`docs/08-emit.md`](08-emit.md).

## 11. `hint verify` checks shape when an adapter is installed

Additive. Without an adapter, `verify` behaves exactly as it did.

An **adapter** is an emit pack that declares a `symbols` command — an external process reporting the file's real symbols as JSON. When one covers a target, `verify` compares the declared parameters, their types, the return type, and a structure's fields instead of only checking that the name appears somewhere in the file.

Only what the spec stated is checked, so no existing spec becomes stricter by installing an adapter. An adapter that is missing or fails degrades to the presence lint, never to a pass.

## 12. New: `hint extract`

Additive. Requires an emit pack declaring both a `symbols` adapter and an `extract` map; without one the command says so and exits `2`.

Drafts a `.hint` from the symbols a source file declares, so a repository that did not start spec-first has a way in. The draft records shape only and says so — the rationale is the half no parser can recover.

## 13. Library API (`@openhint/transpiler`)

Only relevant if you embed the engine.

| Before | After |
| ------ | ----- |
| `compileHints(hints, books, mode, changes, standalone)` | `renderContext(hints, books)` and `renderPrompt(context, books, { changes, standalone })` |
| `findInstruction(books, mode, keyword)` | `findInstruction(books, keyword)` |
| `HintbookData.modes[mode].instructions` | `HintbookData.instructions` |
| `HintbookData.runningModes` | removed |
| `parseHints(root, paths, dryRun)` | `parseHints(root, paths)`; strictness is decided by the caller from `resolveRequests` |
| `parseHintFile(root, path, dryRun)` | `parseHintFile(root, path)` |
| `verifyTargets(root, hints, books, mode)` | `verifyTargets(root, hints, books)` |
| `collectSurfaces(node, books, mode)` / `countSurfaceKeywords(books, mode)` | same without `mode` |
| `resolveClosurePaths(root, paths)` | takes resolved hint paths (from `resolveRequests(...).hintPaths`) |
| — | new: `resolveRequests`, `resolvedNothing`, `matchedNothing`, `findNearestFolderHint`, `hintTargetName`, `parseHintFiles`, `countScopes`, `collectScopeNodes`, `collectIncludedPaths` |
| — | new (staleness): `readGitSnapshot`, `measureStaleness`, `collectContractScopes`, `inspectProject`, `formatStatus` |
| — | new (emit): `selectEmitter`, `planEmit`, `renderArtifact`, `mergeArtifact`, `renderTemplate`; `HintbookData` gained `target` / `match` / `comment` / `symbols` |
| — | new (conformance): `readSymbols`, `collectExpectations`, `compareExpectations`, `inspectHoles` |
| — | new (extraction): `extractMap`, `draftSpec`; `HintbookData` gained `extract` |

The pipeline is now explicit — `resolve → parse → select → render` — so a different renderer (structured output, a different framing) can be added without touching resolution.
