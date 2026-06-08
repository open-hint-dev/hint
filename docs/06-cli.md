# HINT CLI Reference

The `hint` binary is the primary interface to the HINT transpiler. It accepts one or more `.hint` files (or source files with companion `.hint` files), runs the full four-stage compilation pipeline, and dispatches output based on the active sub-command.

---

## Installation

**Global install** (recommended for daily use):

```bash
npm install -g @openhint/cli
hint --version
```

**Run without installing** (npx):

```bash
npx @openhint/cli src/domain/auth/login.ts.hint
```

**Workspace install** (monorepos, CI):

```bash
# package.json devDependencies
"@openhint/cli": "latest"

# then run via package manager
yarn hint src/domain/auth/login.ts.hint
```

---

## Synopsis

```
hint [command] [file ...]
```

| Token | Required | Description |
|---|---|---|
| `command` | No | Optional sub-command name. Omit for default compile-and-output behavior. |
| `file` | Conditional | One or more paths to `.hint` files or source files with companion `.hint` files. Accepts standard shell glob patterns. Not required for the `config` command. |

---

## Commands

### Default — compile and output

```bash
hint <file> [file ...]
```

Runs the full compilation pipeline and writes the resulting prompt to **stdout**. This is the primary command — no sub-command name needed.

```bash
# Single file
hint src/domain/auth/login.ts

# Multiple files
hint src/domain/auth/login.ts src/domain/auth/session.ts

# Glob
hint src/domain/**/*.hint
```

The compiled output is a self-contained markdown prompt ready to paste into any LLM context window, pipe to a file, or forward to an agent CLI. Nothing other than the prompt is written to stdout; all diagnostics go to stderr.

---

### `validate` — spec review before implementation

```bash
hint validate <file> [file ...]
```

Compiles the specification files and prepends a structured review directive in place of the default implementation directive. The LLM receives the same compiled spec body but with instructions to critique it rather than implement it — surfacing underspecified clauses, contradictions, missing error conditions, unclear cross-references, and scope gaps.

```bash
hint validate src/domain/auth/login.ts.hint
```

**Recommended workflow:** run `validate` first whenever a spec is new or has changed. The output is a structured report with cited findings and a `## OPEN QUESTIONS` block. Resolve the open questions in the `.hint` file, then compile with the default command for implementation.

`validate` writes to **stdout** in the same way as the default command — you can pipe, redirect, or send the output anywhere.

---

### `claude` — compile and send to Claude

```bash
hint claude <file> [file ...]
```

Compiles the specification and pipes the resulting prompt directly to the Anthropic `claude` CLI in non-interactive print mode (`--print`). Claude's response streams to your terminal in real time.

```bash
hint claude src/domain/auth/login.ts.hint
```

**Prerequisite:** the `claude` binary must be on PATH.

```bash
npm install -g @anthropic-ai/claude-code
```

The compiled prompt is sent as stdin to `claude --print`. Claude's exit code is forwarded — if Claude exits non-zero, `hint` exits with the same code and emits the error to stderr.

---

### `codex` — compile and send to Codex

```bash
hint codex <file> [file ...]
```

Compiles the specification and pipes the resulting prompt to the OpenAI `codex` CLI via stdin. Codex's response streams to your terminal in real time.

```bash
hint codex src/domain/auth/login.ts.hint
```

**Prerequisite:** the `codex` binary must be on PATH.

```bash
npm install -g @openai/codex
```

---

### `config` — register HINT with AI agent files

```bash
hint config [projectRoot]
```

Locates the project root (by walking upward until `hint.yml` or `hint.yaml` is found) and appends a short HINT CLI integration instruction block to both `AGENTS.md` and `CLAUDE.md` at that root. After running this command, AI coding agents that read these configuration files will automatically know to run `hint <file>` when they encounter `.hint` files instead of reading the raw specification directly.

```bash
# Run from anywhere inside the project
hint config

# Or specify an explicit project root
hint config /path/to/project
```

The command is **idempotent** — running it multiple times produces the same result as running it once. It skips any file that already contains the `## HINT` section marker.

If neither `AGENTS.md` nor `CLAUDE.md` exists, the command creates them with the instruction as their sole content.

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success. For `validate`/default, the prompt was compiled and written. For `claude`/`codex`, the agent process exited cleanly. For `config`, all target files were updated. |
| `1` | Failure. The error message is printed to stderr before exit. Covers: missing files, parse errors, reference errors, agent binary not found, agent process non-zero exit, no `hint.yml` found (`config`), or no file paths supplied. |

---

## Target File Resolution

The CLI accepts three forms of file argument:

| Argument form | How it resolves |
|---|---|
| `src/auth/login.ts.hint` | Compiles that exact `.hint` file. |
| `src/auth/login.ts` | Looks for `src/auth/login.ts.hint` next to it. |
| `src/auth/*.hint` | Expands the glob and compiles every matched file. |

Paths are resolved relative to the current working directory. Multiple arguments are compiled together as a single logical unit — the cascade context for each file is determined independently, and the results are merged in argument order.

---

## Composing with Shell Tools

Because the default command writes only the prompt to stdout and nothing else, the output is safe to pipe:

```bash
# Save compiled prompt to a file
hint src/domain/auth/login.ts > prompt.md

# Copy to clipboard (macOS)
hint src/domain/auth/login.ts | pbcopy

# Pipe to any LLM CLI that reads from stdin
hint src/domain/auth/login.ts | llm prompt

# Chain: validate first, then implement
hint validate src/domain/auth/login.ts.hint > review.md
# ... review and fix the spec ...
hint src/domain/auth/login.ts | claude --print
```

---

## Project Configuration (`hint.yml`)

Every HINT project requires a `hint.yml` (or `hint.yaml`) at its root. This file marks the project boundary and may declare paths to exclude from compilation:

```yaml
ignore:
    - node_modules/
    - dist/
    - '*.generated.hint'
    - '!src/contracts/generated.hint'
```

Patterns follow gitignore semantics and are evaluated relative to the project root. The last matching pattern wins. Ignored paths apply to all compilation targets, `@include` directives, and `# read` glob matches.

The CLI discovers the project root by walking upward from each target file's directory until `hint.yml` is found. If no marker is found, the CLI exits with an error.

---

## Error Reference

| Error type | When it occurs | Typical cause |
|---|---|---|
| `ParseError` | During cascade resolution or file reading | Unreadable or missing `.hint` file |
| `ReferenceError` | During token linking | `{Name}` used in a spec but never declared |
| `IOError` | During file system access | Permission denied, path does not exist |
| `AppError` (agent) | During `claude`/`codex` dispatch | Binary not on PATH, or agent process exited non-zero |
| `AppError` (config) | During `config` execution | No `hint.yml` found walking upward from cwd |

All error messages include the originating file path and a description of the condition. No partial output is written to stdout when an error occurs.
