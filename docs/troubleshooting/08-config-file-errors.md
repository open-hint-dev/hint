# hint.yml read/write errors

## Symptom

```
Failed to read 'hint.yml': <message>
Failed to access '<path>': <message>
Failed to write '<path>': <message>
```

## Cause

`hint.yml` exists but cannot be read, parsed, or written. Most often the YAML was broken by a manual edit (the `<message>` part contains the YAML parser error with a line number); otherwise it is file permissions.

## Fix (safe to autofix for YAML syntax)

Open `hint.yml`, fix the syntax error at the reported position, and retry. Common YAML traps: unquoted values containing `: `, inconsistent indentation, tabs instead of spaces.

Permission problems are for the user to resolve (**ask the user**).
