# @openhint/cli

**A context compiler for coding agents.** Ask what your repository already knows about a path or a task, and get back only the part that applies.

Knowledge lives in markdown-native `.hint` files next to the code they describe, versioned in git, inherited from the project root down. Agent-neutral: Claude Code, Codex, OpenCode, Cline, or anything that can run a command consumes the same output.

```text
repository knowledge → .hint → scope + inheritance → retrieval → minimal relevant context → your agent
```

Project home → [github.com/open-hint-dev/hint](https://github.com/open-hint-dev/hint#readme)

---

## For humans

### Why

Every coding agent starts each session knowing nothing about your repository, so teams write it down in a `CLAUDE.md` or `AGENTS.md`. Those files grow without bound, apply everywhere at once, and get loaded whole on every task — most of it irrelevant to what the agent is about to touch. The knowledge isn't wrong; the scoping is. HINT keeps it per-path and returns only what applies.

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
hint --prompt src/billing/invoice.ts \
  | claude -p                            # hand it to a fresh agent, with framing
```

### When it pays off

Repositories where the same facts get re-explained every session; conventions true in one subsystem and wrong in another; knowledge with a *reason* attached. **Not** worth it for a small repo one person holds in their head, or facts already obvious from the code.

---

## For coding agents

*If you are an LLM agent reading this package: here is what it does for you.*

**The problem it removes.** You lose context to re-deriving facts the repository already settled, to reading instruction files where most lines do not apply to the file you are editing, and to losing what you worked out by the next session.

**Check whether it is available:**

```bash
hint --version && cat hint.yml
```

**The three commands you will use:**

```bash
hint <path...>            # knowledge that applies to these paths (own + every folder above)
hint search "<intent>"    # JSON: {hint, target, score, weak} — local BM25F, no model, no network
hint author <path...>     # the keyword vocabulary, before you write or edit a .hint
```

Cost is proportional to how much applies — a path nothing governs returns nothing — so run it **before** you edit, not only when stuck.

**Reading the result.** stdout is the knowledge; stderr is the verdict and its first line is written first because output gets truncated. Exit `0` succeeded, `1` a check failed, `2` nothing you asked for could be resolved. `no spec of its own for X; returning inherited context from Y` is **success** — most paths inherit, and that inherited knowledge is the answer.

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
