# Hintbook not found

## Symptom

Fatal, from `hint <paths...>`:

```
Hintbook not found: <book>
```

Warning, from `hint instruct` (the command continues, but the generated agent prompt is missing that hintbook's system instructions — do not apply it to `AGENTS.md`/`CLAUDE.md` until resolved):

```
Skipping hintbook '<book>': not found
```

## Cause

`hint.yml` registers a hintbook that cannot be resolved on disk. For `npm://` books the CLI looks in the project's `node_modules` and the global npm root; for `file://` books it resolves the path against the project root. Typical reasons: a fresh clone where dependencies were never installed, a deleted `node_modules`, or a moved/renamed local folder.

## Fix (safe to autofix)

- `npm://` book: run `npm install` in the project root (if it is a declared dependency), or reinstall it explicitly:

  ```bash
  hint add <book>
  ```

- `file://` book: check that the path (relative to the project root) exists and contains a `hintbook.json`. If the folder moved, update the entry in `hint.yml` or remove it with `hint remove <book>`.

If the warning came from `hint instruct`, re-run `hint instruct` after fixing.
