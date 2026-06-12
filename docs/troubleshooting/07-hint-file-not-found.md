# Hint file not found with --dry-run

## Symptom

From `hint --dry-run <paths...>`:

```
Hint file not found: <path>
```

## Cause

`--dry-run` makes compilation fail on any requested path that has no corresponding `.hint` file, instead of skipping it silently. This is the expected behavior for validating specs in CI.

## Fix (ask the user)

Either the spec is genuinely missing (create `<path>`) or the path/glob in the command is wrong (correct it). Without `--dry-run` the same path is skipped silently.
