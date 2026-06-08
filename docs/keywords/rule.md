# `# rule` — Critical System Mandates

**Phase:** B — Architectural Scoping  
**Aliases:** `# rules`, `# constraint`, `# constraints`  
**Cascade behavior:** Multiple `# rule` blocks across cascade levels are merged into a single `## [CRITICAL SYSTEM MANDATES]` section in the compiled prompt.

---

## Description

Declares non-negotiable system-level constraints that apply to every function, data access pattern, and error path in the implementation. The output section uses bracket-uppercase labeling (`## [CRITICAL SYSTEM MANDATES]`) to create a strong attention anchor and the instructional prefix reinforces that these mandates apply "without exception."

---

## Explanation

`# rule` is for invariants that cross-cut the entire implementation — latency ceilings, concurrency guarantees, security constraints, compliance requirements. It is not for function-specific behavior (use `# function` → `## flow` for that) or for coding style (use `# good` / `# bad`).

The "without exception" phrasing is deliberate. It activates stronger compliance behavior than softer wording. The bracket-uppercase label (`## [CRITICAL SYSTEM MANDATES]`) is parsed by the model as a semantic category tag rather than prose, assigning higher attention weight to the content beneath it.

When a spec uses multiple `# rule` blocks (e.g., in an `@include`d shared rules file plus the main spec), the compiler merges all content into one section so the model sees a single unified mandate list.

---

## Example

**Input:**

```markdown
# rule

- All operations within this module must complete within a strict 200ms latency ceiling.
- Under high-concurrency pressure, graceful degradation routines must default to standard database lookups.
```

**Output:**

```markdown
## [CRITICAL SYSTEM MANDATES]

The following mandates are non-negotiable system-level constraints. Every function, data access pattern, and error path must satisfy all mandates listed here without exception:

- All operations within this module must complete within a strict 200ms latency ceiling.
- Under high-concurrency pressure, graceful degradation routines must default to standard database lookups.
```

---

## Prompt Template

```
## [CRITICAL SYSTEM MANDATES]

The following mandates are non-negotiable system-level constraints. Every function, data access pattern, and error path must satisfy all mandates listed here without exception:

{body}
```
