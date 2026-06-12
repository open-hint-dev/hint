# Package is not a hintbook

## Symptom

From `hint add`:

```
No hintbook found in '<book>'
```

## Cause

The npm package or git repository was fetched successfully, but it contains no `hintbook.json` anywhere inside it — it is not a hintbook, or the name/URL points to the wrong package.

## Fix (ask the user)

Verify the package name or repository URL. The official starting point is `@openhint/hintbook-software-engineer`.
