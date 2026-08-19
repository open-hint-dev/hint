# Integrations

HINT stays agent-neutral: `.hint` files are the authority, the CLI is the universal fallback, and `@openhint/mcp` exposes the same read-only engine over stdio.

## MCP clients

Run the server from the repository working directory:

```json
{
  "mcpServers": {
    "hint": { "command": "npx", "args": ["-y", "@openhint/mcp"] }
  }
}
```

This is the project-level `.mcp.json` shape used by Claude Code. Cursor uses the same server entry under its MCP settings; GitHub Copilot in VS Code accepts it in `.vscode/mcp.json`. The server offers `hint_context`, `hint_search`, `hint_status`, and `hint_author` and never writes the repository.

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

Keep `.cursor/rules` or Copilot instructions for their local conventions; `hint apply` maintains the canonical `<hint>` block for plain-CLI agents.

## CI gates

```bash
hint lint '**/*.hint' --strict-vocab
hint emit --check
hint status --exit-code
hint verify 'src/**'
hint apply --check
```

Exit 1 means a check found work; exit 2 means the command resolved no subject. Do not turn either into a green build without deciding why the operation was empty.
