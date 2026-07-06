# HINT CLI Reference

The `hint` binary is the primary interface to the HINT transpiler. It compiles `.hint` specifications into AI-ready prompts, initializes projects, and manages hintbooks.

---

## Installation

**Global install** (recommended for daily use):

```bash
npm install -g @openhint/cli
hint --help
```

**Ad hoc** without installing:

```bash
npx @openhint/cli <paths...>
```

All commands locate the project root by walking up from the current directory to the nearest `hint.yml` / `hint.yaml`.

---

## `hint <paths...>` — compile

The default command. Compiles the given specs and writes the prompt to **stdout** (all diagnostics go to stderr), so output pipes cleanly into agents and files:

```bash
hint src/billing/invoice.ts | claude -p
hint 'src/**/*.hint' > prompt.md
```

### Path arguments

| You pass            | Compiles                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| `src/login.ts.hint` | that hint file                                                                |
| `src/login.ts`      | its companion `src/login.ts.hint` — even if `src/login.ts` does not exist yet |
| `src`               | the folder's `src/_.hint`                                                     |
| `'src/**/*.hint'`   | every glob match (quote globs to keep your shell out of it)                   |

Every compiled file is wrapped in its folder-hint chain down from the project root, so inherited context is part of the output. By default the closure of files it references (its `# read` targets) is compiled in the same pass, with shared folder/root context deduplicated — so an agent gets everything in one prompt instead of re-invoking `hint` per referenced file.

When a [`hint.lock`](#hint-lock-paths--record-generated-work) is present, compiling **skips** any file whose spec (with its inherited context) is unchanged **and** whose generated output still matches what was recorded at lock time. An unchanged run therefore produces no output and costs no tokens; a note on stderr reports what was skipped. Drift is bidirectional: editing the spec *or* editing the generated code underneath an unchanged spec both mark the file stale, so hand-edited output is recompiled rather than silently skipped. (Entries recorded before an output existed fall back to checking existence only.)

### Options

| Option          | Effect                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--mode <mode>` | Compile with the given hintbook mode (e.g. `fix`, `review`). Defaults to the implementation mode, `compile`. Instructions missing from the mode fall back to the default mode. |
| `--dry-run`     | Fail with a non-zero exit on hint files that cannot be resolved, instead of skipping them silently. Use it to validate specs in CI.                                            |
| `--force`       | Recompile every named file even if a `hint.lock` marks it unchanged.                                                                                                          |
| `--no-refs`     | Compile only the named specs; do not pull in the specs they reference. References are included by default.                                                                    |
| `--standalone`  | Prepend the hintbook's tag glossary (`__system__`) to the output, so the prompt explains its own tags for an agent that never loaded `AGENTS.md` (e.g. a subagent).            |

```bash
hint --mode review src/billing | claude -p     # audit code against the spec
hint --dry-run 'src/**/*.hint'                 # validate that every spec resolves
hint --force src/billing/invoice.ts            # ignore the lock and recompile
hint --standalone src/billing/invoice.ts       # include the tag glossary in the prompt
```

Compiling broadly — the repo root, a top-level folder, or a wide glob — pulls the whole project spec into one prompt and usually means the paths were cast wider than the task needs. When a run crosses roughly 25 file targets or ~20k estimated tokens, `hint` prints a one-line notice on **stderr** (never stdout, which the agent consumes as the spec) reporting the target count and token estimate; narrow the paths or add `--no-refs`. Scope compiles to the specific files a task touches — a folder path compiles only that folder's own `_.hint`, so use a glob (`hint 'src/billing/**'`) when you deliberately want a whole subtree.

When the mode defines a drift instruction (the software-engineer book's `fix` mode does) and a `hint.lock` exists, the compiled prompt carries a block-level drift report — see [`hint diff`](#hint-diff-paths--show-what-drifted).

---

## `hint search <query...>` — find the specs closest to an intent

Ranks every `.hint` file in the project against a free-text query and prints the closest matches as JSON — a fast, offline way for an agent to discover which specs are relevant to a task before it knows their paths, then compile them:

```bash
hint search grpc server
```

```json
{
  "query": "grpc server",
  "count": 2,
  "results": [
    { "hint": "src/rpc/server.ts.hint", "score": 7.104 },
    { "hint": "src/rpc/client.ts.hint", "score": 2.318 }
  ]
}
```

Each result is a **hint file path** (relative to the project root, ready to pass to `hint <path>`) and a relevance **score**; results are ordered closest-first and only positive scores are returned. The typical flow is `hint search <intent>` to locate the specs, then `hint <path...>` to compile the top hits.

Matching is deterministic and needs no model, service, or network — it scans the parsed specs directly and ranks them with BM25F over weighted zones (a spec's target path and declared names count for more than its prose). It splits identifiers so `grpcServer` / `grpc_server` / `rpc/server` all match `grpc`, `server`; bridges a small set of software synonyms and acronyms so `database` reaches a spec that only says `db`; and falls back to fuzzy matching for typos. Malformed specs (a broken `@include`, a cycle) are skipped rather than failing the search.

`--limit <n>` caps the number of results (default `20`; a negative value returns all). An empty query, or one no spec matches, yields an empty `results` array. Fails with `No hint.yml found` outside an initialized project.

---

## `hint lock <paths...>` — record generated work

Fingerprints the given specs and writes them to `hint.lock` in the project root, marking those targets as generated. Run it after an agent implements or drafts what a spec defines:

```bash
hint lock src/billing/invoice.ts
```

Afterwards, a plain `hint` run skips each recorded target while its spec — including inherited folder/root context — stays unchanged **and** its generated output is untouched, keeping repeated runs cheap and their output stable. The lock is deterministic and diff-friendly (sorted keys, no timestamps), so it reviews cleanly in version control. Each entry's hash folds in three things: the target's spec blocks, its inherited context, and the **vocabulary it uses** — the resolved instruction content of every keyword in its chain, plus the mode wrappers. So changing what a keyword *compiles to* invalidates exactly the files that use that keyword, and nothing else. This replaces the older hintbook-version fingerprint, which was both too broad (any book release invalidated every file) and too narrow (an in-place edit to a `file://` book with no version bump invalidated nothing). A separate `target` field records a content hash of the generated output, so a file edited underneath an unchanged spec is detected as drifted rather than skipped. Changes to a keyword's `description`, `synonyms`, or `surface` flag do **not** invalidate anything — they never affect compiled output.

Locking is scoped to the paths you pass and merges into any existing `hint.lock`, so you can lock files as you finish them. Fails with `No hint.yml found` outside an initialized project.

Pass `--strict` to gate recording on structural verification: each target is checked with the same rules as [`hint verify`](#hint-verify-paths--structurally-check-generated-output), and any file that fails (its output is missing, or a declared surface is absent from the code) is **not** recorded and is reported on stderr, with the command exiting non-zero. Passing files are still locked. Plain `hint lock` records unconditionally — verification is opt-in, so an unverified target never silently becomes "generated".

```bash
hint lock --strict src/billing/invoice.ts   # only record it if it structurally matches its spec
```

---

## `hint verify <paths...>` — structurally check generated output

Deterministically checks each generated target against its spec, with **no** LLM call and no language-specific parsing: every **surface** a spec declares must appear by name in the output. It is the token-free, deterministic counterpart to the semantic `hint --mode review` audit — a presence lint that catches a whole surface omitted (a stubbed or forgotten function, an unhandled error type, an unused defined term), not a subtly wrong implementation.

```bash
hint verify src/billing/invoice.ts
```

A **surface** is any keyword a hintbook marks with `surface: true` in its instruction front matter — the declarations whose name must manifest in the output (e.g. `func`, `entity`, `error`, `party`, `clause`). Constraint, scratch, and input keywords (`bad`, `rule`, `notes`, `read`) are never surfaces, so their names are not expected in the code. If the active hintbooks declare no surface keywords, verification is a no-op and the command says so on stderr rather than reporting a hollow pass.

Each file is reported as verified, **missing-output** (the target does not exist on disk), or **missing-surfaces** (the output exists but named declarations are absent — each one is listed). Failing files print to stdout and the command **exits non-zero**, so an agent loop or CI step can gate on structural conformance. `--mode <mode>` resolves keywords for a specific hintbook mode. Fails with `No hint.yml found` outside an initialized project.

---

## `hint diff <paths...>` — show what drifted

Compares the given specs against `hint.lock` and reports, per file, exactly which blocks changed since they were generated — a token-free way to scope a fix before running `hint --mode fix`:

```bash
hint diff src/billing/invoice.ts
```

Each file is reported as up to date, **new** (never locked), **inherited** (only its ancestor `_.hint` context changed), **output changed** (the spec is unchanged but the generated code was edited since it was locked — re-verify against the spec, then re-lock), or with the precise list of **changed / added / removed** blocks. Output goes to stdout; with no `hint.lock` it reports on stderr that nothing is being tracked yet. Fails with `No hint.yml found` outside an initialized project.

---

## `hint config` — initialize the project

```bash
hint config
```

If no `hint.yml` exists, writes one in the current folder and proceeds. In a terminal it asks for a project name and description and offers to register the default hintbook (`npm://@openhint/hintbook-software-engineer`); when stdin is not a terminal it uses those defaults silently. If `hint.yml` already exists, it reports that and does nothing else.

`hint config` only manages `hint.yml` — it does **not** touch the agent files. After initializing (and after any `hint add`/`hint remove`), run `hint apply` to write `AGENTS.md` / `CLAUDE.md` (or `hint instruct | claude -p` to have an agent do it):

```bash
hint config   # create hint.yml
hint apply    # then write the agent files
```

---

## `hint instruct` — set up the agent context files

Prints an **AI agent prompt** to stdout that instructs an agent to maintain a single `<hint>...</hint>` block in `AGENTS.md` and `CLAUDE.md`, built from the current `hint.yml`. The block wraps the base HINT workflow instructions plus each registered hintbook's `__system__` glossary and `__mode__.<mode>.md` usage guidance in `<system_instructions_from_<hintbook-id>>` tags. The agent creates the files if needed, appends the block if missing, and otherwise replaces the existing `<hint>` block wholesale — so updated, added, or removed hintbooks propagate on every run. The prompt states explicitly that these are the only HINT instructions allowed in the files; anything HINT-related outside the block is removed.

The command never edits `AGENTS.md` / `CLAUDE.md` itself. Apply the printed prompt with your agent, and re-run it whenever `hint.yml` changes:

```bash
hint instruct | claude -p --permission-mode acceptEdits
```

Warnings (e.g. an unresolved hintbook) go to stderr, so the pipe stays clean. Fails with `No hint.yml found` outside an initialized project.

Because applying the prompt **writes** `AGENTS.md` / `CLAUDE.md`, a headless agent needs permission to edit files or it will stall asking for approval. With Claude Code, `--permission-mode acceptEdits` auto-approves those edits (`--dangerously-skip-permissions` bypasses all checks). See [Agent stalls on write approval](troubleshooting/11-agent-write-approval.md). To skip the agent entirely, use [`hint apply`](#hint-apply--write-the-agent-files-directly).

---

## `hint apply` — write the agent files directly

```bash
hint apply
```

Does what `hint instruct` asks an agent to do, but as a deterministic find-and-replace performed by the CLI itself — no agent, no piping, no permission prompt. Because the block is delimited by `<hint>...</hint>` tags, the CLI can locate and update it exactly. For each of `AGENTS.md` and `CLAUDE.md`:

- If the file does not exist, it is created with the `<hint>` block as its content.
- If it has no `<hint>` block, the block is appended after the existing content.
- If it already has a `<hint>...</hint>` block, that block is replaced wholesale (re-running is idempotent and picks up added/removed/updated hintbooks).
- If `CLAUDE.md` only `@AGENTS.md`-includes it, the block is written to `AGENTS.md` and any copy in `CLAUDE.md` is stripped to avoid duplication.

It prints one short status line per file (`Created…`, `Updated the HINT block in…`, `…already up to date`). Use `hint instruct | claude -p` instead when you would rather an agent apply the changes. Fails with `No hint.yml found` outside an initialized project.

---

## `hint modes` — list available modes

```bash
hint modes
```

Lists modes declared by registered hintbooks through `__mode__.<mode>.md` files. The `mode` column is the value to pass to `hint --mode <mode>`. If a mode file starts with YAML front matter containing `name` and `description`, those are shown; otherwise the name falls back to the mode extracted from the file name.

Warnings for unresolved hintbooks go to stderr. Fails with `No hint.yml found` outside an initialized project.

---

## `hint author [paths...]` — prompt an agent to write hints

Prints an **AI agent prompt** to stdout that teaches an agent to author `.hint` specifications: the file kinds and naming rules, the heading/body/nesting syntax, and — built from the registered hintbooks — the full **keyword vocabulary** with each keyword's synonyms and `description`. Pipe it to your agent, which then writes the `.hint` files:

```bash
hint author src/billing/invoice.ts | claude -p --permission-mode acceptEdits
hint author                                          # vocabulary only, no specific target
```

Pass one or more target paths to scope the prompt to writing those specs; omit them for the vocabulary and rules alone. The descriptions come from each keyword instruction's `description` front matter, so a well-documented hintbook produces a richer prompt. The command never writes files itself — the agent does.

This is the authoring counterpart to the default compile command: `hint author` helps create a spec, `hint <path...>` compiles an existing one. Warnings for unresolved hintbooks go to stderr. Fails with `No hint.yml found` outside an initialized project, or when no hintbooks are registered.

---

## `hint add <books...>` — install hintbooks

Fetches each book, validates that it actually contains a hintbook (a `hintbook.json` must be discoverable), and registers it in the `books` array of `hint.yml`. Run `hint apply` afterwards to refresh `AGENTS.md` / `CLAUDE.md`:

```bash
hint add @openhint/hintbook-software-engineer
hint add --local @openhint/hintbook-lawyer
hint add https://github.com/acme/hintbooks-platform.git
hint add git@github.com:acme/hintbooks-platform.git
hint add file://hintbooks/team-conventions
hint apply
```

The source type is detected from the argument:

| Argument                                               | Action                                                                          | Registered as                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------ |
| `file://<path>`                                        | validated only — nothing is fetched                                             | `file://<path>`                |
| git URL (`git@…`, `ssh://…`, `git://…`, `http(s)://…`) | cloned into `hintbooks/<repo-name>` at the project root                         | `file://hintbooks/<repo-name>` |
| anything else                                          | `npm install --global <name>` (or into the `hintbooks/` store with `--local`)   | `npm://<name>`                 |

A book that installs but contains no `hintbook.json` fails with `No hintbook found` and is not registered. Entries are deduplicated — adding the same book twice is safe.

**Where npm books are installed.** By default npm books are installed **globally** (`npm install --global`), so a single copy is shared across all your projects and your repository stays clean. Pass `--local` to install into a project-local store at `hintbooks/node_modules/` instead — useful for pinning a specific version per project or working offline from a checked-in copy. The local install uses an isolated npm prefix (`hintbooks/` gets its own private `package.json`), so the CLI never touches your project's `package.json`, lockfile, or `node_modules`; `hint add --local` therefore works the same in a plain project and inside a **yarn or pnpm workspace** — npm is never asked to parse the workspace's `workspace:*` dependencies, and you don't need yarn or pnpm installed. The `hintbooks/` folder is managed by HINT; add it to `.gitignore` if you don't want fetched books committed.

`npm://` books are resolved from the project-local `hintbooks/node_modules/` first, then the project's `node_modules/`, then the global npm root (`npm root -g`) — so both `--local` and the default global install are picked up.

---

## `hint remove <books...>` — unregister hintbooks

Removes each book from the `books` array of `hint.yml`. Nothing is uninstalled — npm packages and cloned folders stay on disk. Run `hint apply` afterwards to refresh `AGENTS.md` / `CLAUDE.md`:

```bash
hint remove @openhint/hintbook-lawyer    # npm:// prefix may be omitted
hint remove npm://@openhint/hintbook-lawyer
hint remove file://hintbooks/team-conventions
hint apply
```

A book that is not registered fails with `Hintbook not registered` and leaves `hint.yml` untouched.

---

## `hint version` — show versions

Prints the CLI version, followed by each hintbook registered in `hint.yml` and its installed version:

```
@openhint/cli 1.0.1
npm://@openhint/hintbook-lawyer 1.0.1
file://hintbooks/team-conventions (version unknown)
npm://@openhint/hintbook-chef (not installed)
```

The hintbook version is read from the book's `package.json` (or a `version` field in `hintbook.json`). Outside a HINT project only the CLI version is printed.

---

## `hint help` — show usage

Prints the command overview with usage examples. The same text is available via `hint --help`, and `hint <command> --help` shows the options of a single command.

---

## Exit codes and streams

- **stdout** carries the command's primary output: the compiled prompt (`hint`), the drift report (`hint diff`), the verification report (`hint verify`), the search results (`hint search`, as JSON), the agent prompt to pipe to your agent (`hint instruct`, `hint author`), status lines (`hint config`, `hint apply`, `hint add`, `hint remove`), listings (`hint list`, `hint modes`), or the version report (`hint version`). Only `hint`, `hint instruct`, and `hint author` are meant to be piped into an agent. `hint lock` writes only `hint.lock` and reports how many files it recorded on stderr.
- **stderr** carries interactive prompts, subprocess (git/npm) output, warnings, and errors.
- Exit code `0` on success, `1` on any failure (unresolvable specs under `--dry-run`, missing project, failed installs, invalid hintbooks) — and, additionally, when `hint verify` finds a target that fails structural verification or `hint lock --strict` refuses one.
