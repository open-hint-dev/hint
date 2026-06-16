# @openhint/cli

The `hint` command — compile [HINT](https://github.com/open-hint-dev/hint#readme) specifications into AI-ready prompts.

HINT is a markdown-native specification language for professionals who want structured, strict AI collaboration with predictable results. `.hint` files live next to the work they define (`src/auth/login.ts.hint` defines `src/auth/login.ts`; `contracts/nda.md.hint` defines `contracts/nda.md`), declare intent and constraints in plain markdown, and compile into deterministic prompts for AI agents. The keyword vocabulary is supplied by installable **hintbooks** — one per profession or team: [software engineering](https://www.npmjs.com/package/@openhint/hintbook-software-engineer), [legal drafting](https://github.com/open-hint-dev/hintbook-lawyer), or your own.

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

# 3. Wire up AGENTS.md / CLAUDE.md from hint.yml (or: hint instruct | claude -p)
hint apply

# 4. Write specs — a root _.hint and companion <file>.hint files — then compile
hint src/billing/invoice.ts | claude -p
```

## Commands

### `hint <paths...>` — compile

Compiles specs to stdout, wrapped in their folder-context chain plus the active mode's role header and verification footer:

```bash
hint src/login.ts.hint            # a hint file
hint src/login.ts                 # its companion hint — even if login.ts doesn't exist yet
hint src                          # a folder's _.hint
hint 'src/**/*.hint'              # globs
```

| Option          | Effect                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--mode <mode>` | Compile for a hintbook mode, e.g. `--mode fix` (repair against spec) or `--mode review` (audit against spec). Default is the implementation mode. |
| `--dry-run`     | Fail on unresolvable hint files instead of skipping them — use in CI to validate specs.                                                           |

### `hint config` — initialize the project

Creates `hint.yml` in the project root (interactively, if missing). Prints a status line and points you to `hint apply` / `hint instruct` — it does not touch the agent files itself:

```bash
hint config
```

### `hint apply` — write the agent files directly

Writes the `<hint>` block from `hint.yml` straight into `AGENTS.md` and `CLAUDE.md` as a deterministic find-and-replace on the `<hint>` tags — no agent, no piping, no permission prompt. Creates the files if missing, replaces an existing `<hint>` block in place (idempotent), and strips a duplicate block from `CLAUDE.md` when it only `@AGENTS.md`-includes the instructions. Re-run after `hint add`/`hint remove`:

```bash
hint apply
```

### `hint instruct` — set up the agent context files via an agent

Prints the same content as an AI agent prompt instead of writing the files. Pipe it to your agent to apply; the files are never modified by the CLI in this mode. `--permission-mode acceptEdits` lets a headless Claude write the files without stopping for approval:

```bash
hint instruct | claude -p --permission-mode acceptEdits
```

### `hint add <books...>` — install hintbooks

Fetches hintbooks, validates them (a `hintbook.json` must be present), and registers them in `hint.yml`. npm packages install globally by default; pass `--local` to install into a project-local `hintbooks/` store instead (works inside yarn/pnpm workspaces). Run `hint instruct | claude -p --permission-mode acceptEdits` afterwards to refresh the agent files:

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

## License

MIT
