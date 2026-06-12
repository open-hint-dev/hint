# Empty compile output

## Symptom

`hint <paths...>` exits successfully but prints nothing.

An empty output is **not an error** when no spec covers the requested paths — proceed normally. If you expected output, check these causes in order.

## Causes and fixes

1. **Path resolved against the wrong base.** Relative paths are resolved against the **project root** (the directory containing `hint.yml`), not your current directory. Re-run with paths relative to the project root (**safe to autofix**).
2. **Path outside the project.** Paths that resolve outside the project root are silently ignored. Everything compiled must live under the directory containing `hint.yml`.
3. **Glob expanded by the shell.** Quote glob patterns so the CLI expands them itself: `hint 'src/**/*.hint'`, not `hint src/**/*.hint` (**safe to autofix**).
4. **Wrong project root picked up.** The CLI uses the **nearest** `hint.yml` walking up from the current directory. A stray `hint.yml` in a parent directory (for example, the home directory) hijacks the root and breaks path resolution. Check with: does the directory you believe is the root actually contain `hint.yml`, and is there another one above it? Removing a stray file is for the user to decide (**ask the user**).
