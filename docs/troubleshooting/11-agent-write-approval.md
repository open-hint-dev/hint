# Agent stalls on write approval

## Symptom

`hint instruct | claude -p` produces the prompt, but the agent stops and asks you to approve a file write instead of applying it — for example:

```
The write needs your approval to proceed. Once granted, this will set up AGENTS.md with the <hint> block.
```

The same happens for any setup pipe, e.g. after `hint add` / `hint config` when you run the suggested `hint instruct | claude -p`.

## Cause

This is not a `hint` error. `hint instruct` only prints a prompt to stdout; applying it means the agent has to **write** `AGENTS.md` / `CLAUDE.md`. In headless / print mode (`claude -p`) the agent cannot show an interactive approval dialog, so when its `Write`/`Edit` tool needs permission it surfaces the request as text and stops. The pipe delivered the prompt correctly — the agent just is not allowed to touch files without being told it can.

## Fix

Grant write permission on the agent side. For Claude Code:

```bash
# auto-accept file edits, keep other guardrails (recommended)
hint instruct | claude -p --permission-mode acceptEdits

# only allow the file tools, prompt for anything else
hint instruct | claude -p --allowedTools Edit Write

# bypass all permission checks (heaviest hammer — only if you trust the input)
hint instruct | claude -p --dangerously-skip-permissions
```

`--permission-mode acceptEdits` is the sweet spot: it auto-approves exactly the `AGENTS.md` / `CLAUDE.md` writes that `hint instruct` is designed to produce, while still gating anything unexpected.

This applies to any `| claude -p` that is meant to write files — including compiling a spec to implement code (`hint src/...| claude -p`). Other agents have equivalent flags; consult your agent's headless/permission documentation.
