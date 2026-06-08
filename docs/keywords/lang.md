# `# lang` — Language & Runtime Declaration

**Phase:** A — Environment Staging  
**Aliases:** `# language`  
**Merged with:** [`# deps`](deps.md) — both compile into the same `## [ENVIRONMENT RUNTIME & LANGUAGE]` section.

---

## Description

Declares the target programming language, runtime version, and module system for the entire compilation unit. This is the first environment directive and opens the `## [ENVIRONMENT RUNTIME & LANGUAGE]` section that `# deps` extends below it.

The compiler emits a mandatory instructional prefix before the author's content. This prefix forbids any syntax, feature, or tooling that does not belong to the declared target — preventing the model from mixing idioms or assuming a different runtime.

---

## Explanation

`# lang` is the single source of truth for what language the model must write. Every other directive in the spec operates within the boundary `# lang` defines. The assumption-marking syntax in the PROMPT HEADER also references the target language declared here (e.g., `// ASSUMPTION:` for TypeScript vs. `# ASSUMPTION:` for Python).

When `# deps` follows `# lang`, the compiler renders them as one continuous section: `# lang` opens the header and body prefix; `# deps` appends the dependency whitelist below it as a sub-block. They are never separated in output.

---

## Example

**Input:**

```markdown
# lang

TypeScript (Node.js v22+ / ESM)
```

**Output:**

```markdown
## [ENVIRONMENT RUNTIME & LANGUAGE]

Write all code strictly targeting the following language specification. Apply the correct module syntax, standard library APIs, and runtime-specific idioms throughout. Do not use syntax, features, or tools that do not belong to this target.

TypeScript (Node.js v22+ / ESM)
```

---

## Prompt Template

```
## [ENVIRONMENT RUNTIME & LANGUAGE]

Write all code strictly targeting the following language specification. Apply the correct module syntax, standard library APIs, and runtime-specific idioms throughout. Do not use syntax, features, or tools that do not belong to this target.

{body}
```
