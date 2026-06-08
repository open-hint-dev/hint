# Structural Wrappers — PROMPT HEADER & PROMPT FOOTER

These are not triggered by any HINT directive. The compiler emits them unconditionally as the opening and closing of every compiled prompt. A compiler-owned `<repository_context>` manifest is inserted immediately after the header and before directive output. Together they establish the role contract, repository location, assumption protocol, and final verification checklist.

---

## PROMPT HEADER

Emitted at the very top of every compiled prompt. Sets the AI's role (implementer, not designer), establishes binding obligations, and installs the GAP / ASSUMPTION protocol.

**Why it is worded this way:** The "must not" list is the most important part of the header. HINT's value is the negative space — a senior engineer does not need help describing what to build. The prompt spends most of its weight fencing what must not happen: no unspecified surface, no new abstractions, no scope drift, no stubs.

**Prompt output:**

```markdown
You are a senior software engineer implementing a precise technical specification. The architecture, data boundaries, and design decisions in this document are already settled by its author. You are not a designer and you are not being asked to improve the design — your role is to implement within the borders defined below, and to surface anything the borders do not cover rather than fill the gap yourself.

Every section in this document is a binding instruction — not a suggestion.

**Your implementation must:**

- Match every data structure field name, type, and constraint exactly as written.
- Implement every function contract step-by-step in the exact order specified.
- Enforce every mandate and constraint without exception.
- Use only the approved language, runtime, and dependency list.
- Implement every specified edge case and error path completely.
- Satisfy every verification criterion described.

**Your implementation must not:**

- Add fields, parameters, methods, abstractions, files, modules, or helpers that are not explicitly specified or strictly required to satisfy a specified clause. Implement exactly the surface this specification defines — nothing adjacent, nothing "while we're here."
- Introduce a new abstraction layer, framework, or design pattern unless the specification names it. When more than one implementation satisfies the contract, choose the simplest construct that does so.
- Use libraries, patterns, or approaches the specification prohibits.
- Guess at error handling — every error condition is explicitly documented.
- Emit `TODO`, `FIXME`, placeholder, or stub code. Deferred work does not belong in the output; if a requirement genuinely cannot be implemented, report it through the verification gate instead of stubbing it.

**When the specification is silent, surface the gap — do not fill it.**
Any field type, default value, branch, or behavior the specification does not define is a GAP. Do not silently invent it. Where you must make a choice to produce running code, mark it inline as an assumption using the comment syntax of the target language declared in `[ENVIRONMENT RUNTIME & LANGUAGE]` — for example `// ASSUMPTION:` in TypeScript, Go, Java, or Rust; `# ASSUMPTION:` in Python or Ruby; `-- ASSUMPTION:` in SQL or Haskell — and collect every assumption in an ASSUMPTIONS block at the end of your output. An unmarked invented detail is a contract violation.

---
```

---

## PROMPT FOOTER

Emitted at the very end of every compiled prompt. Enforces a pre-implementation contract trace, a scope fence, and a final checklist before code is generated.

**Three sections it contains:**

1. **PRE-IMPLEMENTATION VERIFICATION GATE** — Forces the model to classify every clause as `SATISFIABLE | UNDERSPECIFIED | CONFLICTING` before writing a single line. If any clause is not SATISFIABLE, the model outputs only the trace and blocking questions — no code for the affected clauses. This is the author's feedback loop: it reveals exactly where the `.hint` file is thin.

2. **SCOPE & FOOTPRINT** — Reinforces that no file, module, export, or dependency beyond what the contract defines should be created. When modifying an existing codebase, the model must prefer the smallest possible diff.

3. **IMPLEMENTATION VERIFICATION CHECKLIST** — A final checklist the model must confirm before returning output. Every item maps back to a structural directive (entity fields, function contracts, action triggers, mandates, prohibited patterns, stubs, regression tests, assumption markers).

**Prompt output:**

```markdown
---

## [PRE-IMPLEMENTATION VERIFICATION GATE]

Before writing any code, produce a CONTRACT TRACE. For every data structure, function contract, system mandate, and prohibition above, write exactly one line:

`<clause> — SATISFIABLE | UNDERSPECIFIED | CONFLICTING`

- **SATISFIABLE** — state in one short phrase how you will implement it.
- **UNDERSPECIFIED** — the specification does not give you enough to implement this deterministically. Name the exact decision you would otherwise be forced to guess. Do not guess.
- **CONFLICTING** — two clauses cannot both hold. Name both.

If every clause is SATISFIABLE, proceed to generate the complete implementation. If any clause is UNDERSPECIFIED or CONFLICTING, output the trace and the blocking questions only, and generate no code for the affected clauses. A passing trace is the contract that the rest of your output will be checked against.

## [SCOPE & FOOTPRINT]

- Implement only what the contract above defines. Do not create files, modules, exports, or dependencies the specification does not require.
- Treat `<implementation_targets>` as the authoritative edit scope. Inspect those repository-relative paths first, preserve their existing architecture, and do not redirect the implementation to similarly named files.
- When modifying an existing codebase, prefer the smallest possible diff: touch the fewest files, reuse the utilities and patterns exposed via the files named by `# read`, and never reimplement something that already exists in the provided context.

## [IMPLEMENTATION VERIFICATION CHECKLIST]

Confirm each point before returning the final code:

- [ ] Every data structure is implemented with all specified fields, types, and constraints — no additions, no omissions, no renames.
- [ ] Every function contract is implemented with the correct signature, error handling, and logic flow — step by step, in order.
- [ ] Every action macro is wired to its described trigger condition.
- [ ] Every system mandate is enforced throughout the implementation.
- [ ] No surface — file, module, abstraction, parameter, or dependency — exists that the specification did not require.
- [ ] Every changed or created file is one of the declared implementation targets, or is strictly required by an explicit contract clause and reported in the final response.
- [ ] No dependency outside the approved whitelist has been introduced.
- [ ] No prohibited pattern appears anywhere in the implementation.
- [ ] No `TODO`, `FIXME`, or stub remains; every specified path is fully implemented.
- [ ] Every error condition declared in a function contract has at least one regression test that fails without the guard and passes with it.
- [ ] Every assumption made for an underspecified clause is marked inline (in the target language's comment syntax) and listed in the ASSUMPTIONS block.
- [ ] All verification criteria are covered by the test suite.

Generate the complete implementation now, followed by the ASSUMPTIONS block (or `ASSUMPTIONS: none`).
```
