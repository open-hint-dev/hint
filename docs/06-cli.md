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

1. If no `hint.yml` exists, writes one in the current folder and proceeds. In a terminal it asks for a project name and description and offers to register the default hintbook (`npm://@openhint/hintbook-software-engineer`); when stdin is not a terminal it uses those defaults silently.
2. Prints an **AI agent prompt** to stdout that instructs an agent to maintain a single `<hint>...</hint>` block in `AGENTS.md` and `CLAUDE.md`. The block wraps the base HINT workflow instructions plus each registered hintbook's `__system__` glossary in `<system_instructions_from_<hintbook-id>>` tags. The agent creates the files if needed, appends the block if missing, and otherwise replaces the existing `<hint>` block wholesale — so updated, added, or removed hintbooks propagate on every run. The prompt states explicitly that these are the only HINT instructions allowed in the files; anything HINT-related outside the block is removed.

The command never edits `AGENTS.md` / `CLAUDE.md` itself. Apply the printed prompt with your agent:

```bash
hint config | claude -p
```

Interactive questions and status messages go to stderr, so the pipe stays clean.

---

## `hint add <books...>` — install hintbooks

Fetches each book, validates that it actually contains a hintbook (a `hintbook.json` must be discoverable), registers it in the `books` array of `hint.yml`, and prints the updated agent prompt to stdout — so one pipe installs the book and refreshes `AGENTS.md` / `CLAUDE.md`:

```bash
hint add @openhint/hintbook-software-engineer | claude -p
hint add -g @openhint/hintbook-lawyer | claude -p
hint add https://github.com/acme/hintbooks-platform.git | claude -p
hint add git@github.com:acme/hintbooks-platform.git | claude -p
hint add file://hintbooks/team-conventions | claude -p
```

The source type is detected from the argument:

| Argument                                               | Action                                                                               | Registered as                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------ |
| `file://<path>`                                        | validated only — nothing is fetched                                                  | `file://<path>`                |
| git URL (`git@…`, `ssh://…`, `git://…`, `http(s)://…`) | cloned into `hintbooks/<repo-name>` at the project root                              | `file://hintbooks/<repo-name>` |
| anything else                                          | `npm install <name>` in the project (or `npm install --global` with `-g`/`--global`) | `npm://<name>`                 |

A book that installs but contains no `hintbook.json` fails with `No hintbook found` and is not registered. Entries are deduplicated — adding the same book twice is safe.

`npm://` books are resolved through the project's `node_modules` first, then through the global npm root (`npm root -g`) — a book installed manually with `npm install -g` is picked up without re-adding it.

---

## `hint remove <books...>` — unregister hintbooks

Removes each book from the `books` array of `hint.yml` and prints the updated agent prompt to stdout. Nothing is uninstalled — npm packages and cloned folders stay on disk:

```bash
hint remove @openhint/hintbook-lawyer | claude -p    # npm:// prefix may be omitted
hint remove npm://@openhint/hintbook-lawyer
hint remove file://hintbooks/team-conventions
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

- **stdout** carries exactly one thing per command: the compiled prompt (`hint`), the agent prompt (`hint config`, `hint add`, `hint remove`), or the version report (`hint version`).
- **stderr** carries prompts, progress, warnings, and errors.
- Exit code `0` on success, `1` on any failure (unresolvable specs under `--dry-run`, missing project, failed installs, invalid hintbooks).
