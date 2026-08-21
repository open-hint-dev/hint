# Integrations

HINT stays agent-neutral: `.hint` files are the authority, the CLI is the universal interface, and `hint mcp` exposes the same read-only engine over stdio. There is no second package to install or version independently.

## One-line agent setup

Tell Claude Code, Codex, Cursor, VS Code / GitHub Copilot, or another coding agent:

> Run `npx -y @openhint/cli bootstrap` from the repository root and follow exactly what it prints.

`bootstrap` is safe to run before the repository has `hint.yml`: it only prints a self-contained prompt. The receiving agent initializes HINT, merges the project-level MCP entry for the client it is currently running in, verifies the result, and reports what changed. It is explicitly told not to replace unrelated MCP servers or invent starter `.hint` content before inspecting the repository.

The recipes below are the manual equivalent. They use `npx -y @openhint/cli mcp`, so the repository needs no global CLI or separate MCP package. If the CLI is already installed globally, `"command": "hint", "args": ["mcp"]` is equivalent.

## Claude Code

From the repository root:

```bash
claude mcp add --scope project hint -- npx -y @openhint/cli mcp
```

This creates or updates the shared project `.mcp.json`. The resulting server entry is:

```json
{
  "mcpServers": {
    "hint": {
      "command": "npx",
      "args": ["-y", "@openhint/cli", "mcp"]
    }
  }
}
```

## Codex

Merge this into the repository's `.codex/config.toml`:

```toml
[mcp_servers.hint]
command = "npx"
args = ["-y", "@openhint/cli", "mcp"]
```

Codex also supports `codex mcp add hint -- npx -y @openhint/cli mcp`, but that command writes user configuration. Use the checked-in `.codex/config.toml` form when the setup should travel with the repository. Codex loads project configuration for trusted projects.

## Cursor

Merge this into `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hint": {
      "command": "npx",
      "args": ["-y", "@openhint/cli", "mcp"]
    }
  }
}
```

Cursor rules can continue to carry client-specific conventions; HINT remains the path-scoped repository knowledge source.

## VS Code / GitHub Copilot

Merge this into `.vscode/mcp.json`:

```json
{
  "servers": {
    "hint": {
      "command": "npx",
      "args": ["-y", "@openhint/cli", "mcp"]
    }
  }
}
```

VS Code uses a top-level `servers` object, unlike the `mcpServers` object used by Claude Code and Cursor.

## Other MCP clients

Add a stdio server named `hint` with:

```text
command: npx
args: -y, @openhint/cli, mcp
working directory: repository root
```

The server offers `hint_context`, `hint_search`, `hint_status`, and `hint_author`. All four tools are read-only; writing `.hint` knowledge remains an ordinary repository edit by the agent. Some clients discover MCP servers only at startup, so restart the client after adding the configuration.

Verify the repository side independently:

```bash
npx -y @openhint/cli apply --check
npx -y @openhint/cli status
```

`status` exits `2` when the initialized repository has no `.hint` files yet; that is an empty inventory, not a broken MCP configuration.

## Claude Code hooks

Use the CLI when a lifecycle hook needs an exit code:

```json
{
  "hooks": {
    "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "hint \"$CLAUDE_FILE_PATH\" >/dev/null" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "hint status --exit-code" }] }]
  }
}
```

Plain-CLI agents do not need MCP: `hint apply` maintains the canonical `<hint>` instruction block in `AGENTS.md` and `CLAUDE.md`.

For just-in-time prefetch, use `PreToolUse` for `Edit|Write|MultiEdit`: run `hint "$CLAUDE_FILE_PATH"`, inject stdout into the tool context, and retain the first stderr line as the verdict note. Cursor and Copilot currently have no equivalent portable file-edit hook; call MCP `hint_context` before editing there.

At session end, lint only changed knowledge and print the write-back rule. The command is silent when no `.hint` changed:

```bash
changed=$(git diff --name-only --diff-filter=ACMR HEAD -- '*.hint')
test -z "$changed" || hint lint $changed
test -z "$changed" || printf '%s\n' 'record durable learnings in the most specific .hint; mark origin=agent'
```

For a plain git pre-commit hook:

```bash
staged=$(git diff --cached --name-only --diff-filter=ACMR -- '*.hint')
test -z "$staged" || hint lint $staged
hint status --exit-code
```

Equivalent `.pre-commit-config.yaml` entry:

```yaml
- repo: local
  hooks:
    - id: hint-lint
      name: HINT lint
      entry: hint lint
      language: system
      files: \\.hint$
```

PR review checklist: `unreviewed blocks: hint status`.

## CI gates

```bash
hint lint '**/*.hint' --strict-vocab
hint emit --check
hint status --exit-code
hint verify 'src/**'
hint apply --check
```

Exit `1` means a check found work; exit `2` means the command resolved no subject. Do not turn either into a green build without deciding why the operation was empty.
