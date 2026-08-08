# HINT CLI Reference

The `hint` binary answers one question: **what does this repository already know about this path or this intent?** It returns that knowledge for any coding agent to consume, and manages the `.hint` files it comes from.

---

## Installation

```bash
npm install -g @openhint/cli
hint --help
```

Ad hoc, without installing: `npx @openhint/cli <paths...>`.

All commands locate the project root by walking up from the current directory to the nearest `hint.yml` / `hint.yaml`.

---

## Exit codes and streams

Uniform across every command that takes paths:

| Code | Meaning |
| ---- | ------- |
| `0` | The operation ran and succeeded. |
| `1` | The operation ran and a check failed (a declared surface is missing; the project is not initialized). |
| `2` | Nothing you asked for could be resolved — a path that is not in this repository, a glob that matched nothing, or a contract command with no target to work on. |

**No command reports success over an empty set.** `hint lock` on a path with no lockable target, `hint diff` with nothing tracked, and `hint verify` with no file spec all exit `2` and say why.

- **stdout** carries the answer: the compiled knowledge (`hint`), the drift report (`hint diff`), the verification report (`hint verify`), JSON results (`hint search`), the authoring guidance (`hint author`), status lines (`hint config`, `hint apply`, `hint add`, `hint remove`, `hint version`).
- **stderr** carries the verdict, warnings, prompts, and subprocess output. **The first stderr line is the one that matters** — agents commonly truncate command output, so the most important message is emitted first.

---

## `hint <paths...>` — what applies here

The default command. Prints the repository knowledge that applies to the given paths:

```bash
hint src/auth/token.ts
hint src/auth src/billing
hint 'src/auth/**'
```

Output is the compiled knowledge and nothing else — no persona, no workflow instructions, no reporting format. **The cost is proportional to how much applies**: a path with a lot of governing knowledge returns a lot, a path with none returns nothing at all. That is what makes it cheap enough to run before an ordinary edit.

### Path arguments

| You pass | You get |
| -------- | ------- |
| `src/login.ts` | its companion `src/login.ts.hint`, plus every folder `_.hint` above it |
| `src/login.ts.hint` | the same, addressed by the hint file directly |
| `src` | that folder's own `src/_.hint`, plus its ancestors — **not** the specs beneath it |
| `'src/**'` | every hint beneath `src`, ancestors emitted once |

Knowledge is **inherited**: a path always picks up the folder `_.hint` chain from the project root down. A repository whose knowledge lives entirely in folder `_.hint` files — no companion specs at all — is a normal, fully supported setup.

### What it tells you about the path

| Situation | stderr | Exit |
| --------- | ------ | ---- |
| The path has knowledge of its own | *(silent)* | `0` |
| The path exists but declares nothing of its own | `no spec of its own for <path>; returning inherited context from <ancestor>` | `0` |
| The path is not in this repository | `<path> does not exist in this repository and has no spec; …` | `2` |
| A glob matched nothing | `'<pattern>' matched no .hint files` | `2` |

Inheriting is a **successful** lookup — the ancestor knowledge is the answer for that path. Only a path that names nothing in the repository is a failure. This is what stops the common case from looking like an error.

### Options

| Option | Effect |
| ------ | ------ |
| `--prompt` | Wrap the knowledge in a standalone implementation prompt (persona header, verification footer) for piping to a fresh agent. Not needed mid-session. |
| `--strict` | Exit `2` when any named path has no spec of its own, instead of returning inherited context. Use it to validate specs in CI. |
| `--force` | Ignore `hint.lock` and include every file, even unchanged ones. |
| `--no-refs` | Return only the named specs, not the specs they reference. References are included by default. |
| `--standalone` | Implies `--prompt`, and prepends the hintbook's tag glossary for an agent that never loaded `AGENTS.md`. |

```bash
hint --prompt src/auth/login.ts | claude -p    # a fresh agent implements against it
hint --strict 'src/**/*.hint'                  # CI: every named spec must resolve
```

Referenced specs (a spec's `# read` targets and path links) are pulled in automatically with shared ancestors emitted once, so you never need a second call for a path the first one pointed at.

**Breadth guard.** A run crossing roughly 25 scopes or ~20k estimated tokens prints a one-line notice on stderr with the scope count and token estimate. Both file and folder scopes count, so the guard works in a folder-knowledge-only repository too.

**Reconciliation.** When a `hint.lock` exists and blocks have drifted, `--prompt` output carries a block-level drift report automatically — there is no mode to select. See [`hint diff`](#hint-diff-paths--show-what-drifted).

---

## `hint search <query...>` — which knowledge covers this intent

Ranks every `.hint` in the project against a free-text query and prints JSON:

```bash
hint search "service account authentication"
```

```json
{
  "query": "service account authentication",
  "count": 2,
  "results": [
    { "hint": "src/auth/_.hint", "target": "src/auth", "score": 6.12, "weak": false },
    { "hint": "src/identity/_.hint", "target": "src/identity", "score": 1.84, "weak": true }
  ]
}
```

| Field | Meaning |
| ----- | ------- |
| `hint` | the hint file, relative to the project root |
| `target` | the path that knowledge governs — pass this to `hint <path>` next |
| `score` | BM25F relevance, closest first; only positive scores are returned |
| `weak` | the result matched under half your query terms |

**`weak` is advisory and never filters.** Scores are corpus-relative, so a high score says nothing about whether a hit is on topic; term coverage is the honest signal. A result flagged `weak` is still returned — a false `weak` costs a glance, a hidden result costs the knowledge. When every result is weak, a `no strong match` note goes to stderr.

Matching is deterministic and local: no model, service, or network. It splits identifiers so `grpcServer` / `grpc_server` / `rpc/server` all match `grpc`, `server`; bridges a small set of software synonyms so `database` reaches a spec that only says `db`; and falls back to edit-distance-1 for typos. Malformed specs are skipped rather than failing the search.

`--limit <n>` caps results (default `20`; negative returns all).

---

## `hint author [paths...]` — how to write it down

Prints the guidance for authoring `.hint` knowledge: the **keyword vocabulary** of the registered hintbooks first, then the file kinds, the syntax, and the full per-keyword reference.

```bash
hint author src/auth/token.ts
hint author                      # vocabulary and rules alone
```

The vocabulary comes first and fits on a screen, because picking a legal keyword is the decision an author actually has to make — truncating the output still leaves the part you came for. Extended descriptions and examples follow the index as `### keyword` sections, so multi-line content can never corrupt the table.

Agents **may** read `.hint` files directly when authoring or editing them. The prohibition in the generated instruction block applies only to *consuming* knowledge, where `hint <path>` gives it to you with inheritance resolved.

Fails outside an initialized project, or when no hintbooks are registered.

---

## `hint config` — initialize the project

```bash
hint config   # create hint.yml
hint apply    # then write the agent bootstrap
```

If no `hint.yml` exists, writes one in the current folder. In a terminal it asks for a project name and description; when stdin is not a terminal it uses defaults silently. If `hint.yml` already exists it reports that and does nothing else. It never touches the agent files.

---

## `hint apply` — install the agent bootstrap

```bash
hint apply
```

Writes a single `<hint>...</hint>` block into `AGENTS.md` and `CLAUDE.md`, as a deterministic find-and-replace by the CLI itself — no agent, no piping, no permission prompt.

The block is deliberately **small**: it teaches an agent how to query HINT and how to record what it learns, plus each hintbook's tag glossary. Repository knowledge itself stays in `.hint` and is never duplicated into agent files.

- If the file does not exist, it is created with the block.
- If it has no `<hint>` block, the block is appended.
- If it already has one, that block is replaced wholesale (idempotent; picks up added/removed hintbooks).
- If `CLAUDE.md` only `@AGENTS.md`-includes it, the block goes to `AGENTS.md` and any copy in `CLAUDE.md` is stripped.

Re-run it after any `hint add` / `hint remove`. Other agent runtimes can be pointed at HINT the same way — the block is plain markdown and the `.hint` files are the source of truth.

---

## `hint add <books...>` — install hintbooks

Fetches each book, validates that it contains a `hintbook.json`, and registers it in `hint.yml`. Run `hint apply` afterwards.

```bash
hint add @openhint/hintbook-software-engineer
hint add --local @openhint/hintbook-lawyer
hint add https://github.com/acme/hintbooks-platform.git
hint add file://hintbooks/team-conventions
```

| Argument | Action | Registered as |
| -------- | ------ | ------------- |
| `file://<path>` | validated only — nothing is fetched | `file://<path>` |
| git URL (`git@…`, `ssh://…`, `git://…`, `http(s)://…`) | cloned into `hintbooks/<repo-name>` | `file://hintbooks/<repo-name>` |
| anything else | `npm install --global <name>` (or into `hintbooks/` with `--local`) | `npm://<name>` |

npm books install globally by default, so one copy is shared across projects. `--local` installs into a project-local store at `hintbooks/node_modules/` using an isolated npm prefix, so the CLI never touches your project's `package.json`, lockfile, or `node_modules` — it works identically in a plain project and inside a yarn or pnpm workspace. Resolution order: project-local `hintbooks/node_modules/`, then the project's `node_modules/`, then the global npm root.

---

## `hint remove <books...>` — unregister hintbooks

Removes each book from `hint.yml`. Nothing is uninstalled. Run `hint apply` afterwards.

```bash
hint remove @openhint/hintbook-lawyer     # npm:// prefix may be omitted
```

---

## `hint version` — environment

Prints the CLI version, then every registered hintbook with its version and where it resolved from:

```
@openhint/cli 1.1.0
npm://@openhint/hintbook-software-engineer 1.0.6 — /usr/local/lib/node_modules/@openhint/…/keywords
file://hintbooks/team-conventions (version unknown) — hintbooks/team-conventions
npm://@openhint/hintbook-chef (not installed)
```

Versions come from the book's `package.json` (or a `version` field in `hintbook.json`). Outside a HINT project only the CLI version is printed.

---

# Contracts

The commands below are an **optional specialization**. They apply only to companion `<file>.hint` specs that *declare* surfaces the code must contain. Folder knowledge has no single generated file to check, so these commands say so and exit `2` rather than reporting a hollow success. A repository that never uses them gets the full value of everything above.

## `hint verify <paths...>` — is every declared surface present

```bash
hint verify src/billing/invoice.ts
```

Deterministically checks each generated target against its spec: every **surface** it declares must appear by name in the output. No model call, no language-specific parsing.

A surface is any keyword a hintbook marks `surface: true` (e.g. `func`, `entity`, `error`, `party`, `clause`). Constraint and scratch keywords (`bad`, `rule`, `notes`, `read`) are never surfaces.

| Result | Exit |
| ------ | ---- |
| every declared surface present | `0` |
| a target is missing, or a declared surface is absent | `1`, with the specifics on stdout |
| no file spec matched, or the books declare no surface keywords | `2`, with the reason on stderr |

It is a presence lint — it catches a whole surface omitted (a stubbed function, an unhandled error type), not a subtly wrong implementation. Compose it: `hint verify <path> && hint lock <path>`.

## `hint lock <paths...>` — record a contract snapshot

```bash
hint lock src/billing/invoice.ts
```

Fingerprints the given specs into `hint.lock`. Afterwards a plain `hint` run skips each recorded target while its spec, its inherited context, and the vocabulary it uses all stay unchanged **and** its generated output is untouched.

Each entry's hash folds in the target's own blocks, its inherited context, and the resolved instruction content of every keyword in its chain — so changing what a keyword *renders to* invalidates exactly the files using it. A separate `target` hash records the generated output, so code edited underneath an unchanged spec is detected as drifted rather than skipped. Changes to a keyword's `description`, `synonyms`, or `surface` flag invalidate nothing, because they never affect output.

**Only companion `<file>.hint` specs are lockable.** Passing a folder, a `_.hint`, or a nonexistent path reports what it resolved to and why it was skipped, and exits `2` if nothing at all was lockable. The lock file is not written when it could not be populated. It is deterministic and diff-friendly (sorted keys, no timestamps).

## `hint diff <paths...>` — show what drifted

```bash
hint diff src/billing/invoice.ts
```

Reports, per file, which blocks changed since they were generated: **new** (never locked), **inherited** (only ancestor context or vocabulary changed), **output changed** (spec unchanged, code edited), or the precise **changed / added / removed** block list.

A clean comparison says how many files it checked (`3 file(s) compared — all up to date`). With no lock, an empty lock, or no tracked file matching the given paths, it says so and exits `2` — it never claims everything is up to date about a set it did not populate.

---

## Migrating to 1.1

See [`docs/07-migration.md`](07-migration.md).
