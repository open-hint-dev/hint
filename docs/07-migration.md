# Migrating to 1.1

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
| `hint instruct` | `hint apply` — the same bytes, written deterministically, no agent and no permission prompt |
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

## 11. Library API (`@openhint/transpiler`)

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

The pipeline is now explicit — `resolve → parse → select → render` — so a different renderer (structured output, a different framing) can be added without touching resolution.
