# Requested path matched nothing

## Symptom

`hint` (or `lock`, `diff`, `verify`) exits with code `2` and a message naming the path:

```
hint: src/biling/invoice.ts does not exist in this repository and has no spec; returning inherited context from src/_.hint.
```

or, from a glob:

```
hint: 'src/**/*.hnt' matched no .hint files.
```

## Cause

Exit `2` means **nothing you asked for could be resolved** — the path names nothing in this repository. Usually a typo in the path or the glob.

Note the case this is *not*: a real file that simply has no `.hint` of its own exits `0` and returns the knowledge it inherits, with `no spec of its own for <path>` on stderr. That is a successful lookup, not an error — most paths in a repository are like that.

## Fix (ask the user)

Correct the path or glob. If the path is right and you meant to create knowledge for it, run `hint author <path>` and write the `.hint` file.

`--strict` widens this: it also exits `2` when a named path exists but has no spec of its own. Use it in CI to assert that every named spec resolves.
