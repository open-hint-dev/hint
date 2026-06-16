# Hintbook installation failed

## Symptom

From `hint add`:

```
'npm install <...>' failed with exit code <N>
'git clone <...>' failed with exit code <N>
```

## Cause

The underlying package manager or git failed; its own error output is printed just above this message. Common reasons: no network, a typo in the package name or URL, a private package/repository without credentials.

npm books install globally by default, and `--local` installs into an isolated `hintbooks/` store; neither reads your project's `package.json`, so `hint add` does not fail with `EUNSUPPORTEDPROTOCOL "workspace:"` inside a yarn/pnpm workspace. If you do see that error, you are on an older CLI version; upgrade `@openhint/cli`.

## Fix

Read the npm/git output above the message and resolve that error. Retrying once is safe; fixing credentials or names is up to the user (**ask the user**).
