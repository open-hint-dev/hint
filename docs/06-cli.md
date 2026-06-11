# HINT CLI Reference

The `hint` binary is the primary interface to the HINT transpiler. It compiles `.hint` specifications into AI-ready prompts, initializes projects, and installs hintbooks.

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

Every compiled file is wrapped in its folder-hint chain down from the project root, so inherited context is part of the output.

### Options

| Option          | Effect                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--mode <mode>` | Compile with the given hintbook mode (e.g. `fix`, `review`). Defaults to the implementation mode, `compile`. Instructions missing from the mode fall back to the default mode. |
| `--dry-run`     | Fail with a non-zero exit on hint files that cannot be resolved, instead of skipping them silently. Use it to validate specs in CI.                                            |

```bash
hint --mode review src/billing | claude -p     # audit code against the spec
hint --dry-run 'src/**/*.hint'                 # validate that every spec resolves
```

---

## `hint config` — initialize the project

```bash
hint config
```

1. If no `hint.yml` exists, asks for a project name and description and offers to register the default hintbook (`npm://@openhint/hintbook-software-engineer`), then writes `hint.yml`.
2. Prints an **AI agent prompt** to stdout that instructs an agent to add the HINT workflow instructions — and each registered hintbook's `__system__` glossary — to `AGENTS.md` and `CLAUDE.md`, creating them if needed and skipping blocks already present.

The command never edits `AGENTS.md` / `CLAUDE.md` itself. Apply the printed prompt with your agent:

```bash
hint config | claude -p
```

Interactive questions and status messages go to stderr, so the pipe stays clean.

---

## `hint install <books...>` — install hintbooks

Fetches each book, validates that it actually contains a hintbook (a `hintbook.json` must be discoverable), and registers it in the `books` array of `hint.yml`:

```bash
hint install @openhint/hintbook-software-engineer
hint install -g @openhint/hintbook-lawyer
hint install https://github.com/acme/hintbooks-platform.git
hint install git@github.com:acme/hintbooks-platform.git
hint install file://hintbooks/team-conventions
```

The source type is detected from the argument:

| Argument                                               | Action                                                                               | Registered as                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------ |
| `file://<path>`                                        | validated only — nothing is fetched                                                  | `file://<path>`                |
| git URL (`git@…`, `ssh://…`, `git://…`, `http(s)://…`) | cloned into `hintbooks/<repo-name>` at the project root                              | `file://hintbooks/<repo-name>` |
| anything else                                          | `npm install <name>` in the project (or `npm install --global` with `-g`/`--global`) | `npm://<name>`                 |

A book that installs but contains no `hintbook.json` fails with `No hintbook found` and is not registered. Entries are deduplicated — installing the same book twice is safe.

---

## Exit codes and streams

- **stdout** carries exactly one thing per command: the compiled prompt (`hint`), or the agent prompt (`hint config`).
- **stderr** carries prompts, progress, warnings, and errors.
- Exit code `0` on success, `1` on any failure (unresolvable specs under `--dry-run`, missing project, failed installs, invalid hintbooks).
