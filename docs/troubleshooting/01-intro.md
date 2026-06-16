# HINT Troubleshooting

This is the entry point for diagnosing `hint` CLI failures. Every error the CLI can produce has its own page below, with the exact error text, the cause, and the fix.

The CLI reports failures as a single message on **stderr** and a non-zero exit code; warnings also go to stderr but do not stop the command. **stdout** always carries only the command's payload (compiled prompt, agent prompt, or version report), so it stays safe to pipe.

## How to use this guide (AI agents)

When a `hint` command fails or produces unexpected output, do not stop at relaying the raw error to the user. Instead:

1. **Match the symptom.** Find the page in the table below whose error text matches the stderr output, and read that page. Messages are quoted exactly; `<...>` parts are placeholders.
2. **Verify the cause.** Each page lists what to check (a file, a path, an installed package) — confirm the diagnosis before acting.
3. **Apply the fix if it is marked _Safe to autofix_.** These fixes are local and reversible (installing declared dependencies, re-running a command from the right directory). Apply them without asking, then retry the failed command **once**.
4. **Otherwise, propose the fix.** If the page says _Ask the user_, or your retry failed, report back with: the original error, your diagnosis, and the concrete fix you recommend — never just "an error happened".

If no page matches, report the full error verbatim along with the command you ran, the working directory, and the contents of `hint.yml`.

## Issues

| Symptom                                                                | Page                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `hint: command not found`                                               | [Command not found](02-command-not-found.md)                     |
| `No hint.yml found — run 'hint config' to initialize the project.`      | [No hint.yml found](03-no-hint-yml-found.md)                     |
| `Hintbook not found: <book>` / `Skipping hintbook '<book>': not found`  | [Hintbook not found](04-hintbook-not-found.md)                   |
| `No hintbook found in '<book>'`                                         | [Package is not a hintbook](05-not-a-hintbook.md)                |
| `'npm install <...>' failed` / `'git clone <...>' failed`               | [Hintbook installation failed](06-install-failed.md)             |
| `Hint file not found: <path>`                                           | [Hint file not found with --dry-run](07-hint-file-not-found.md)  |
| `Failed to read / access / write '<path>'`                              | [hint.yml read/write errors](08-config-file-errors.md)           |
| `hint <paths...>` prints nothing unexpectedly                           | [Empty compile output](09-empty-output.md)                       |
| `hint config` asks questions in a script                                | [Interactive prompts when scripting](10-interactive-prompts.md)  |
| `hint instruct \| claude -p` stalls asking to approve a write            | [Agent stalls on write approval](11-agent-write-approval.md)     |
