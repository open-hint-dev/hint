# @openhint/cli

**Spec-as-Source for any repository.** The spec is the artifact you maintain; the implementation answers to it. Ask what governs a path or a task, and get back only the part that applies.

Intent lives in markdown-native `.hint` files next to what they govern, versioned in git, inherited from the project root down. Agent-neutral: Claude Code, Codex, OpenCode, Cline, or anything that can run a command consumes the same output. And not only for code — the keyword vocabulary is installed, not compiled in, so the same machinery specifies a law firm's matters.

```text
spec (.hint) → scope + inheritance → retrieval → the governing intent → whoever does the work
                     ↑                                                          │
                     └──────────── drift reported back ─────────────────────────┘
```

Project home → [github.com/open-hint-dev/hint](https://github.com/open-hint-dev/hint#readme)

---

## For humans

### Spec-as-Source, without the generator

Spec-as-source usually comes with a second clause attached — *and the code is regenerated from the spec* — and that clause is what has kept the idea impractical: generation from a language model is non-deterministic, so every upgrade is a re-roll and every hand edit fights the generator.

HINT drops the generator, not the source of truth. The `.hint` files hold the intent; humans and agents write the implementation; HINT couples the two with **retrieval before the work** (`hint <path>` returns exactly the spec that governs it) and **drift detection after it** (`hint status`, plus an advisory line on every read). No model call, no network, deterministic end to end.

Where a spec describes something machine-derivable, `hint emit` produces it from templates the hintbook supplies, and `hint emit --check` lets CI assert that what is committed still equals what the spec produces. What the emitter cannot derive becomes a hole carrying its inherited constraints; filled holes and hand-written code both survive re-emission.

The same reasoning applies to the older habit of one big `CLAUDE.md`: the knowledge isn't wrong, the scoping is. HINT keeps it per-path and returns only what applies.

### Install

```bash
npm install -g @openhint/cli     # or: npx @openhint/cli <paths...>
```

### Set up a project

```bash
hint config                                    # create hint.yml at the project root
hint add @openhint/hintbook-software-engineer  # a keyword vocabulary
hint apply                                     # teach your agent to query HINT
```

Then record what the repository knows. A folder's `_.hint` governs that folder and everything beneath it; the root `_.hint` is the project-wide baseline. **A repository whose knowledge lives entirely in folder hints is the normal case** — companion `<file>.hint` specs are optional.

```markdown
# decision Money is stored as integer minor units {#money_repr}

Every persisted amount is an integer count of the smallest currency unit, with the
currency alongside it. Rationale: decimal strings drifted across three services
before this. Consequence: format at the boundary, never in the domain.

# bad Retry loops around the payment gateway

The gateway is not idempotent below the charge-token layer. Retrying a failed
charge double-bills. Surface the failure instead.
```

Run `hint author` for the keyword vocabulary before writing.

### Use it

```bash
hint src/billing/invoice.ts              # what applies to this path
hint search "how are totals stored"      # which knowledge covers this task
hint status                              # what has come loose from the code it describes
hint emit src/billing/invoice.ts         # write the artifact this spec produces
hint --prompt src/billing/invoice.ts \
  | claude -p                            # hand it to a fresh agent, with framing
```

### Keeping it current

Recorded knowledge decays quietly — a spec not updated after a run, a `.hint` left behind by a rename. HINT does not address that by asking harder; anything depending on a step *after* the work is done gets skipped. The signal rides the read instead, on stderr, advisory only:

```
hint: 9 of 11 files under src/billing changed since src/billing/_.hint was last updated, and it
      records knowledge — re-check it against the code and update it if it no longer holds.
```

The measure is git — the share of a scope's files changed since the hint's last commit — with a tighter threshold for specs that declare surfaces (they restate the code) than for ones that only explain it (rationale survives refactoring). `hint status` applies it to the whole repository and also finds specs whose target was deleted; `hint status --exit-code` gates CI.

### Beyond code

The engine knows **no keywords at all** — it understands files, headings, nesting, and inheritance. What a `decision`, an `invariant`, a `clause`, or an `obligation` *means* comes from a **hintbook**: a flat folder of Markdown templates installed like a dependency. Swap the hintbook and the same machinery specifies a different profession — [`hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) works from `party`, `clause`, `obligation`, `redline`. Authoring one takes no programming.

### When it pays off

Repositories where the same facts get re-explained every session; conventions true in one subsystem and wrong in another; intent with a *reason* attached. **Not** worth it for a small repo one person holds in their head, or facts already obvious from the code.

---

## For coding agents

*If you are an LLM agent reading this package: here is what it does for you.*

**What this is.** The repository keeps its intent in `.hint` files and treats them as the source of truth: the spec is maintained, the implementation answers to it. `hint` hands you the part of that spec governing whatever you are about to touch, and tells you when the implementation has drifted from it. Nothing is generated for you — you do the work, against a stated intent instead of a guessed one.

**The problem it removes.** You lose context to re-deriving facts the repository already settled, to reading instruction files where most lines do not apply to the file you are editing, and to losing what you worked out by the next session.

**Check whether it is available:**

```bash
hint --version && cat hint.yml
```

**The commands you will use:**

```bash
hint <path...>            # knowledge that applies to these paths (own + every folder above)
hint search "<intent>"    # JSON: {hint, target, score, weak} — local BM25F, no model, no network
hint author <path...>     # the keyword vocabulary, before you write or edit a .hint
hint status               # what has come loose from the code it describes
```

Cost is proportional to how much applies — a path nothing governs returns nothing — so run it **before** you edit, not only when stuck.

**Reading the result.** stdout is the knowledge; stderr is the verdict and its first line is written first because output gets truncated. Exit `0` succeeded, `1` a check failed, `2` nothing you asked for could be resolved. `no spec of its own for X; returning inherited context from Y` is **success** — most paths inherit, and that inherited knowledge is the answer.

**If stderr says the knowledge is stale**, the code under that hint has moved a long way since anyone revisited it. Exit code and output are unchanged — it is an observation. Read the knowledge, decide whether it still holds, and if it does not, fix it in the change you are already making, then commit the `.hint` with the code.

**You may read `.hint` files directly when writing or editing them** — that is the only way to edit one. The convention against direct reads applies to *consuming* knowledge, where `hint <path>` gives you the same content with inheritance resolved.

**Write back what you learn.** A durable decision and its rationale, an invariant, an operational hazard, an approach that does not work and why — record it in the most specific `.hint` that applies. It is versioned with the code and every agent gets it, including you next session. Not session state or task progress.

`hint --help` is the complete surface; this section is only what you will use most.

---

## Command reference

### `hint <paths...>` — what applies here

```bash
hint src/login.ts                 # its companion hint plus every folder _.hint above it
hint src/login.ts.hint            # the same, addressed by the hint file
hint src                          # that folder's own _.hint — not the specs beneath it
hint 'src/**'                     # everything beneath src, ancestors emitted once
```

Knowledge only — no persona, no workflow instructions, no reporting format.

| Option | Effect |
| --- | --- |
| `--prompt` | Wrap the knowledge in a standalone implementation prompt, for piping to a fresh agent. |
| `--strict` | Exit 2 when a named path has no spec of its own — use in CI to validate specs. |
| `--no-refs` | Only the named specs, not the ones they reference. |
| `--force` | Ignore `hint.lock` and include unchanged files. |
| `--standalone` | Implies `--prompt`, and prepends the tag glossary. |

Exit codes: `0` succeeded, `1` a check failed, `2` nothing you asked for matched. **No command reports success over an empty set.**

### `hint search <query...>` — which knowledge covers this intent

Ranks every `.hint` in the project and prints JSON: the hint file, the `target` path it governs (pass it straight to `hint <path>`), a relevance score, and a `weak` flag for hits matching under half the query terms. Weak results are flagged, never hidden. Deterministic and fully offline — no model, service, or network.

```bash
hint search "service account authentication"
hint search payment --limit 5     # default 20; negative returns all
```

### `hint author [paths...]` — how to write it down

Prints the keyword vocabulary of the registered hintbooks first, then the file kinds, the syntax, and the per-keyword reference.

### `hint extract <paths...>` — draft specs from code that exists

Reads each source file through its target's language adapter and drafts a `.hint` from the symbols it declares — the on-ramp for a repository that did not start spec-first. An existing spec is left alone unless `--overwrite`. The draft records shape only and says so; the rationale is the half no parser can recover.

```bash
hint extract src/billing
hint extract --stdout src/billing/invoice.ts
```

### `hint status` — what has come loose

Walks every `.hint` in the project and reports what has drifted away from the code it describes: `stale` (the code moved substantially since the hint's last commit), `orphan` (the target was deleted or renamed), `outdated` / `unfilled` (a hole implemented against an older spec, or not implemented at all), `drifted` / `unlocked` (against `hint.lock`), and `pending` (a spec written ahead of its target — informational, counted on stderr, listed only under `--json`).

```bash
hint status                 # the inventory
hint status --json          # machine-readable
hint status --exit-code     # exit 1 on findings, for CI
```

Staleness and orphan detection need git; outside a repository they are skipped and stderr says so. Exit `2` when the project has no `.hint` files at all.

### `hint emit <paths...>` — produce the artifact a spec describes

Renders each spec through the emit templates of the registered hintbooks — deterministic, model-free, byte-identical for identical input. Only companion `<file>.hint` specs emit; a folder hint has no single output and never does. Code outside the `hint:begin` … `hint:end` region is preserved, and a filled hole body is never overwritten.

```bash
hint emit src/billing/invoice.ts    # write it
hint emit --check                   # CI: exit 1 when an artifact no longer matches its spec
hint emit --stdout src/billing      # preview
hint emit --target go src/svc       # force an emitter
```

Full reference → [`docs/08-emit.md`](https://github.com/open-hint-dev/hint/blob/main/docs/08-emit.md).

### `hint config` / `hint apply` — set up the project

`hint config` creates `hint.yml` and touches nothing else. `hint apply` writes the `<hint>` block into `AGENTS.md` and `CLAUDE.md` as a deterministic find-and-replace on the tags — creating the files if missing, replacing an existing block in place, and stripping a duplicate from `CLAUDE.md` when it only `@AGENTS.md`-includes it. Re-run after `hint add` / `hint remove`.

### `hint add <books...>` / `hint remove <books...>` — hintbooks

```bash
hint add @openhint/hintbook-software-engineer           # npm, installed globally
hint add --local @openhint/hintbook-software-engineer   # into project-local hintbooks/
hint add https://github.com/acme/hintbooks-platform     # git repo → cloned into hintbooks/
hint add file://hintbooks/team-conventions              # local folder
```

`--local` uses an isolated npm prefix, so it never touches your `package.json`, lockfile, or `node_modules` — it works the same in a plain project and inside a yarn or pnpm workspace.

### `hint version` — environment

CLI version, then every registered hintbook with its version and where it resolved from.

### Contracts — optional

For specs that *declare* surfaces the code must contain. `hint verify <path>` checks them deterministically and token-free, exiting non-zero on failure. `hint lock` / `hint diff` snapshot and track drift. These apply only to companion `<file>.hint` specs — in a folder-knowledge repository they say so and exit `2` rather than reporting a hollow pass.

---

## Project configuration

`hint.yml` marks the project root and registers the vocabulary:

```yaml
name: my-project
description: What this project is about
books:
    - npm://@openhint/hintbook-software-engineer
    - file://hintbooks/team-conventions
```

## Documentation

- [Introduction](https://github.com/open-hint-dev/hint/blob/main/docs/01-intro.md)
- [Quick Start](https://github.com/open-hint-dev/hint/blob/main/docs/02-quick-start.md)
- [Syntax](https://github.com/open-hint-dev/hint/blob/main/docs/03-syntax.md)
- [CLI Reference](https://github.com/open-hint-dev/hint/blob/main/docs/06-cli.md)
- [Migrating to 1.1](https://github.com/open-hint-dev/hint/blob/main/docs/07-migration.md)

## License

MIT
