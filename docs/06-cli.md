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

If no `hint.yml` exists, writes one in the current folder and proceeds. In a terminal it asks for a project name and description and offers to register the default hintbook (`npm://@openhint/hintbook-software-engineer`); when stdin is not a terminal it uses those defaults silently. If `hint.yml` already exists, it reports that and does nothing else.

`hint config` only manages `hint.yml` — it does **not** touch the agent files. After initializing (and after any `hint add`/`hint remove`), run `hint apply` to write `AGENTS.md` / `CLAUDE.md` (or `hint instruct | claude -p` to have an agent do it):

```bash
hint config   # create hint.yml
hint apply    # then write the agent files
```

---

## `hint instruct` — set up the agent context files

Prints an **AI agent prompt** to stdout that instructs an agent to maintain a single `<hint>...</hint>` block in `AGENTS.md` and `CLAUDE.md`, built from the current `hint.yml`. The block wraps the base HINT workflow instructions plus each registered hintbook's `__system__` glossary in `<system_instructions_from_<hintbook-id>>` tags. The agent creates the files if needed, appends the block if missing, and otherwise replaces the existing `<hint>` block wholesale — so updated, added, or removed hintbooks propagate on every run. The prompt states explicitly that these are the only HINT instructions allowed in the files; anything HINT-related outside the block is removed.

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

- **stdout** carries the command's primary output: the compiled prompt (`hint`), the agent prompt to pipe to your agent (`hint instruct`), status lines (`hint config`, `hint apply`, `hint add`, `hint remove`), or the version report (`hint version`). Only `hint` and `hint instruct` are meant to be piped into an agent.
- **stderr** carries interactive prompts, subprocess (git/npm) output, warnings, and errors.
- Exit code `0` on success, `1` on any failure (unresolvable specs under `--dry-run`, missing project, failed installs, invalid hintbooks).
