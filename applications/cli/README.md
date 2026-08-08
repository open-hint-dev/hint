# @openhint/cli

The `hint` command — a context compiler for coding agents. See [HINT](https://github.com/open-hint-dev/hint#readme).

Given a path or an intent, `hint` returns the repository knowledge that applies to it. Knowledge lives in markdown-native `.hint` files next to the code they describe, versioned in git, inherited from the project root down. It is agent-neutral: Claude Code, Codex, OpenCode, Cline, or anything else that can run a command consumes the same output. The keyword vocabulary comes from installable **hintbooks** — [software engineering](https://www.npmjs.com/package/@openhint/hintbook-software-engineer), [legal drafting](https://github.com/open-hint-dev/hintbook-lawyer), or your own.

## Installation

```bash
npm install -g @openhint/cli
```

Or ad hoc: `npx @openhint/cli <paths...>`.

## Quick start

```bash
# 1. Initialize: creates hint.yml in the project root
hint config

# 2. Install a keyword vocabulary (registered in hint.yml automatically)
hint add @openhint/hintbook-software-engineer

# 3. Tell your agent how to query HINT (writes a short block into AGENTS.md / CLAUDE.md)
hint apply

# 4. Record what the repo knows in _.hint files, then ask what applies
hint src/billing/invoice.ts
```

## Commands

### `hint <paths...>` — what applies here

Prints the knowledge that applies to the given paths, inherited from the project root down. Knowledge only — no persona, no workflow instructions, no reporting format — so the cost is proportional to how much applies:

```bash
hint src/login.ts.hint            # a hint file
hint src/login.ts                 # its companion hint — even if login.ts doesn't exist yet
hint src                          # a folder's _.hint
hint 'src/**/*.hint'              # globs
```

| Option         | Effect                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--prompt`     | Wrap the knowledge in a standalone implementation prompt, for piping to a fresh agent.                            |
| `--strict`     | Exit 2 when a named path has no spec of its own — use in CI to validate specs.                                    |
| `--no-refs`    | Only the named specs, not the ones they reference.                                                                |
| `--force`      | Ignore `hint.lock` and include unchanged files.                                                                   |
| `--standalone` | Implies `--prompt`, and prepends the tag glossary.                                                                |

Exit codes: `0` succeeded, `1` a check failed, `2` nothing you asked for matched.

### `hint search <query...>` — find the specs closest to an intent

Ranks every `.hint` in the project against a free-text query and prints JSON — each result the hint file, the `target` path it governs, a relevance score, and a `weak` flag for hits matching under half the query terms. Weak results are flagged, never hidden. Deterministic and fully offline (no model, service, or network):

```bash
hint search grpc server           # → results: [{hint, target, score, weak}]
hint search payment --limit 5     # cap the number of results (default 20)
```

### `hint config` — initialize the project

Creates `hint.yml` in the project root (interactively, if missing). It does not touch the agent files — run `hint apply` next:

```bash
hint config
```

### `hint apply` — write the agent files directly

Writes the `<hint>` block from `hint.yml` straight into `AGENTS.md` and `CLAUDE.md` as a deterministic find-and-replace on the `<hint>` tags — no agent, no piping, no permission prompt. Creates the files if missing, replaces an existing `<hint>` block in place (idempotent), and strips a duplicate block from `CLAUDE.md` when it only `@AGENTS.md`-includes the instructions. Re-run after `hint add`/`hint remove`:

```bash
hint apply
```

### `hint add <books...>` — install hintbooks

Fetches hintbooks, validates them (a `hintbook.json` must be present), and registers them in `hint.yml`. npm packages install globally by default; pass `--local` to install into a project-local `hintbooks/` store instead (works inside yarn/pnpm workspaces). Run `hint apply` afterwards to refresh the agent files:

```bash
hint add @openhint/hintbook-software-engineer           # npm package, installed globally
hint add --local @openhint/hintbook-software-engineer   # npm package, into project-local hintbooks/
hint add https://github.com/acme/hintbooks-platform     # git repo → cloned into hintbooks/
hint add file://hintbooks/team-conventions              # local folder
```

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
