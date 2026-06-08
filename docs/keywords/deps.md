# `# deps` — Dependency Whitelist

**Phase:** A — Environment Staging  
**Aliases:** `# dependencies`  
**Rendered as:** A sub-section appended below [`# lang`](lang.md) inside `## [ENVIRONMENT RUNTIME & LANGUAGE]`.

---

## Description

Declares the explicit and exhaustive list of packages, libraries, and dependency constraints the model is permitted to use. Any package not on this list is strictly forbidden — the instructional prefix uses "strictly forbidden" to activate stronger compliance behavior than polite wording.

---

## Explanation

`# deps` does not open its own section — it extends the section opened by `# lang`. The compiler renders them sequentially so they form one continuous environment contract. If `# lang` is absent, `# deps` still renders, but without a preceding section header.

The whitelist can contain both positive constraints ("use X for Y") and negative constraints ("avoid X; prefer Y"). Both forms are preserved verbatim in the output.

---

## Example

**Input:**

```markdown
# deps

- Prisma ORM for database connectivity
- Redis client for ephemeral session state
- Avoid heavy external math libraries; use native integer arithmetic.
```

**Output** _(rendered as a continuation under the `## [ENVIRONMENT RUNTIME & LANGUAGE]` section opened by `# lang`)_:

```markdown
### Approved Dependency Whitelist

You are strictly forbidden from installing or importing any package outside of this list:

- Prisma ORM for database connectivity
- Redis client for ephemeral session state
- Avoid heavy external math libraries; use native integer arithmetic.
```

---

## Prompt Template

```
### Approved Dependency Whitelist

You are strictly forbidden from installing or importing any package outside of this list:

{body}
```
