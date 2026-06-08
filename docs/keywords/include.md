# `@include` — Compile-Time File Inclusion

**Phase:** C — Context Engineering Directives  
**Syntax:** `@include <glob>`  
**Contrast with:** [`# read`](read.md) — which is a run-time reference directive, not a compile-time splice.

---

## Description

A preprocessor directive that resolves at compile time. The compiler opens the target file, reads its raw bytes, and splices them directly into the current token stream before any further parsing occurs. `@include` produces no output of its own — it is invisible in the final prompt. Its effect is whatever the included file expands to.

---

## Explanation

`@include` vs `# read` is the most important distinction in HINT's context system:

|                         | `@include`                                       | `# read`                                             |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| **Resolves**            | Compile time                                     | Run time (the AI reads the file)                     |
| **Output**              | None — content is spliced in place               | A `<repository_file>` reference block                |
| **Use for**             | HINT fragments, shared rule files, spec partials | Live source files the agent has filesystem access to |
| **Goes stale?**         | No — content is embedded at compile time         | No — agent reads the real file                       |
| **Keeps prompt dense?** | No — embeds all content                          | Yes — only emits a reference                         |

Use `@include` only when you need to literally paste another `.hint` file into the current spec before parsing, so its directives participate in block merging and overrides. For reusable contracts, implementation references, and context the AI can open itself, prefer `# read`: it keeps the compiled prompt small and lets the AI read once and reuse the named reference.

---

## Behavior

No prompt output is produced. The compiler recursively reads the target file and splices its raw content into the current token stream before any further parsing.

`@include` is invisible in the final prompt — its effect is whatever the included file expands to.

---

## Example

**Input:**

```markdown
@include shared/\_rules.hint
```

**Effect:** The compiler opens `shared/_rules.hint`, reads its content, and inserts it at this position in the token stream. The `@include` line itself disappears. Anything in `_rules.hint` — including other directives like `# rule`, `# good`, `# bad` — is parsed and compiled as if it had been written directly in the main file.

---

## Common Patterns

- `@include shared/team-rules.hint` — inject team-wide mandates into every spec
- `@include ../base/auth-constraints.hint` — share auth/security rules across multiple modules
- `@include _types.hint` — pull in shared entity definitions used across several function specs
