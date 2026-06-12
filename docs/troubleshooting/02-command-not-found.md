# Command not found

## Symptom

```
hint: command not found
```

(or `'hint' is not recognized...` on Windows)

## Cause

The CLI is not installed globally.

## Fix (safe to autofix)

Use `npx @openhint/cli <args...>` instead of `hint <args...>` — it works without installation. To install permanently:

```bash
npm install -g @openhint/cli
```
