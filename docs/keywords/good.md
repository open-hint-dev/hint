# `# good` — Enforced Coding Design Patterns

**Phase:** F — Guardrails, Few-Shots & Assurances  
**Aliases:** `# pattern`, `# patterns`, `# best-practice`, `# best-practices`  
**Cascade behavior:** Multiple `# good` blocks across cascade levels are merged into a single `## [ENFORCED CODING DESIGN PATTERNS]` section in the compiled prompt.

---

## Description

Declares validated, required coding patterns the model must apply in all generated code without exception. The instructional prefix forbids substituting "equivalent-seeming" alternatives — enforcing the exact patterns named, not patterns the model considers equivalent.

---

## Explanation

`# good` is not a style guide — it is an enforcement list. The distinction matters: a style guide is advisory; `# good` patterns are mandatory. The instructional prefix says "without exception" and explicitly forbids substituting alternatives, "even equivalent-seeming ones."

This phrasing exists because models frequently substitute patterns they consider equivalent: "You said use transactions, but I noticed you could also use optimistic locking here, so I used that instead." `# good` prevents this substitution.

Pairs naturally with [`# bad`](bad.md): `# good` declares what must be done; `# bad` declares what is forbidden. Together they form a closed pattern contract.

---

## Example

**Input:**

```markdown
# good

- Always wrap DB query logic inside a database transaction to prevent race conditions.
- Ensure all pricing computations operate strictly on whole integers to avoid floating point errors.
```

**Output:**

```markdown
## [ENFORCED CODING DESIGN PATTERNS]

Apply every pattern and practice listed below in all generated code without exception. These are validated, required standards for this codebase — do not substitute alternatives, even equivalent-seeming ones:

- Always wrap DB query logic inside a database transaction to prevent race conditions.
- Ensure all pricing computations operate strictly on whole integers to avoid floating point errors.
```

---

## Prompt Template

```
## [ENFORCED CODING DESIGN PATTERNS]

Apply every pattern and practice listed below in all generated code without exception. These are validated, required standards for this codebase — do not substitute alternatives, even equivalent-seeming ones:

{body}
```
