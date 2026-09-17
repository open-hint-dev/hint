# Troubleshooting

## Command not found

Use Node.js 24 or newer and install `@openhint/cli` globally, or run the packed
CLI through your package manager. `hint --version` confirms the executable.

## Unresolved path (exit 2)

Reads require an existing target or an existing companion. Writes may target
a future file; use an existing directory or a trailing slash for folder scope.
Paths and symlinks may not escape the nearest Git root, nearest `.hintrc`
root, or cwd fallback.

## Validation finding (exit 1)

Run `hint check <path>`. Diagnostics include the HINT file and line. Fix the
format version, duplicate or malformed IDs, statuses, required sections,
links, replacement pair, or quality evidence named by the first finding.

## Revision conflict

Another writer changed the file after it was read. Read or prepare the command
again, merge against the current record, then retry with the new revision.
HINT never resolves this by last-write-wins.

## Busy write lock

HINT does not break a lock automatically because it cannot prove that the
other writer is dead. Confirm no HINT process is writing that exact file
before removing a leftover `*.write-lock` manually.

## Legacy configuration warning

`hint.yml` and `hint.yaml` are ignored. Remove them after migrating; the only
supported configuration is optional `.hintrc` with a boolean
`high-quality-mode` key.
