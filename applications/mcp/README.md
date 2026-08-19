# @openhint/mcp

Read-only stdio MCP access to a HINT project. It exposes `hint_context`, `hint_search`, `hint_status`, and `hint_author`; all answers come from the same deterministic engine as the CLI.

```json
{
  "mcpServers": {
    "hint": { "command": "npx", "args": ["-y", "@openhint/mcp"] }
  }
}
```

Run the server with the project as its working directory. It never writes specs, artifacts, locks, or configuration.
