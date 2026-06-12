# No hint.yml found

## Symptom

```
No hint.yml found — run 'hint config' to initialize the project.
```

## Cause

The command searched the current directory and every parent up to the filesystem root and found no `hint.yml` (or `hint.yaml`). Either you are outside the project, or the project was never initialized.

## Fix

- If the project has a `hint.yml` somewhere, re-run the command from inside that directory tree (**safe to autofix**).
- If the project was never initialized, run `hint config` from the project root to create `hint.yml` (**ask the user** — it creates a file and registers the default hintbook).
