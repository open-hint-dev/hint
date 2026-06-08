# HINT Prompt Mapping Specification v1.0.0

This document defines the exact, deterministic prompt strings the HINT transpiler produces for every special word in the syntax. Each mapping is the authoritative implementation contract — template files in `packages/transpiller/templates/` must produce outputs that match these specifications precisely.

> **Keyword normalization.** The directives below are written in their canonical short, lowercase form. Before these mappings apply, the compiler normalizes every keyword: matching is case-insensitive and full-word aliases collapse to the canonical keyword (`# Application` → `# app`, `# Dependencies` → `# deps`, `## argument` → `## arg`, etc. — see the alias table in the Syntax Specification). The output is therefore identical regardless of which accepted spelling appears in the source.

---

## Keyword Map

```
[PROMPT HEADER]       ─────────────────────────► [ROLE + BORDER CONTRACT + ASSUMPTION PROTOCOL]

@include              ─────────────────────────► [Inlined Content Stream — no prompt output]
# read                ─────────────────────────► <repository_file name="..."> ... </repository_file>

# lang    ───┐
# deps    ───┴────────────────────────────────► ## [ENVIRONMENT RUNTIME & LANGUAGE]
# build   ─────────────────────────────────── ► ## [COMPILATION & TESTING PIPELINES]

# app       ───┐
# lib       ───┤
# namespace ───┼──────────────────────────────► <system_context type="APP|LIB|NAMESPACE|MODULE" name="...">
# module    ───┘
# res     ─────────────────────────────────── ► ### [STATIC DATA ASSET: name]
# rule    ─────────────────────────────────── ► ## [CRITICAL SYSTEM MANDATES]

# entity  ─────────────────────────────────── ► ### DATA STRUCT: Name
# function ───┬── ## arg    ─────────────────► ### FUNCTION CONTRACT: Name
              ├── ## return ─────────────────┤    ├── #### Parameters
              ├── ## error  ─────────────────┤    ├── #### Returns
              └── ## flow   ─────────────────┘    ├── #### Errors
                                                   └── #### Logic Flow

# ui      ───┬── ## form   ─────────────────► ### UI SURFACE: Name
             ├── ## block  ─────────────────┤    ├── #### FORM: name
             ├── ## image  ─────────────────┤    ├── #### BLOCK: name
             └── ## table  ─────────────────┘    ├── #### IMAGE: name
                                                  └── #### TABLE: name

# action  ─────────────────────────────────── ► ## [REUSABLE AUTOMATION SCRIPTS: name]

# good    ─────────────────────────────────── ► ## [ENFORCED CODING DESIGN PATTERNS]
# bad     ─────────────────────────────────── ► ## [PROHIBITED ANTI-PATTERNS]
# example ─────────────────────────────────── ► ## [FEW-SHOT SYNTAX EXAMPLES]
# test    ─────────────────────────────────── ► ## [VERIFICATION & UNIT TEST CRITERIA]

# notes   ───┐
---       ───┴────────────────────────────────► [COMPILER STRIPPED / IGNORED]

[PROMPT FOOTER]       ─────────────────────────► [VERIFICATION GATE + SCOPE FOOTPRINT + CHECKLIST]
```

---

## Design Principles

These principles drive every mapping decision. Understanding them explains why each section is worded exactly the way it is.

1. **Bracket-uppercase section labels** create strong attention anchors. `## [CRITICAL SYSTEM MANDATES]` is parsed by the model as a semantic category label, not prose — it triggers higher weight on the content that follows.

2. **XML context wrappers** for scope declarations (`<system_context>`, `<repository_file>`) create hard semantic boundaries the model treats as isolated instruction regions. LLMs are extensively trained on XML-structured data and process these boundaries reliably.

3. **Explicit prohibition language** ("strictly forbidden", "under any circumstances", "CRITICAL ASSURANCE") activates stronger compliance behavior than polite instructions. The wording of `# bad` is deliberately aggressive for this reason.

4. **Explicit step-ordering instructions** ("step-by-step without skipping any code validations") prevent the model from collapsing sequential logic into abbreviated summaries. This is the most important line in the function contract.

5. **Macro registration framing** for actions ("registered as a macro behavior") teaches the model to treat an action name as a referenceable command token, not just descriptive text — making `{actionName}` cross-references reliable.

6. **Single authoritative phrasing per directive.** Every directive uses the same instructional prefix every time it appears. Consistency trains the model's attention: when it sees `### DATA STRUCT:` it knows exactly what to do with what follows, without re-reading the surrounding context.

7. **Border enforcement over behavior description.** HINT's value is the negative space. A senior engineer does not need help describing _what_ to build — the model can do that. The prompt therefore spends most of its weight fencing what must **not** happen: no unspecified surface, no new abstractions, no scope drift, no stubs. The header's "must not" list and the footer's `[SCOPE & FOOTPRINT]` section exist to keep generated code from growing past the architecture the author actually drew.

8. **Surfaced gaps over silent invention.** An underspecified spec is normal; a model that quietly fills the gaps is how codebases rot. The pre-implementation gate forces the model to declare every clause `SATISFIABLE | UNDERSPECIFIED | CONFLICTING` before it writes a line, and the assumption protocol forces every gap-fill to be marked in-code and listed at the end. The ASSUMPTIONS block is the author's feedback loop: it shows exactly where the `.hint` file was thin so the border can be tightened on the next pass.

---

## Compiled Prompt Assembly Order

A fully compiled prompt assembles in this order:

```
[PROMPT HEADER]

<repository_file name="..."> ... </repository_file>   ← one block per # read, in declaration order

## [ENVIRONMENT RUNTIME & LANGUAGE]                   ← # lang
### Approved Dependency Whitelist                      ← # deps (sub-section of lang)

## [COMPILATION & TESTING PIPELINES]                  ← # build

## [CRITICAL SYSTEM MANDATES]                         ← # rule (merged across all cascade levels)

<system_context type="APP|LIB|NAMESPACE|MODULE" name="...">     ← # app / # lib / # namespace / # module
...
</system_context>

### [STATIC DATA ASSET: name]                         ← # res

### DATA STRUCT: Name                                 ← # entity (one section per entity)

### FUNCTION CONTRACT: Name                           ← # function (one section per function)

### UI SURFACE: Name                                  ← # ui (one section per surface, with #### form/block/image/table)

## [REUSABLE AUTOMATION SCRIPTS: name]                ← # action (one section per action)

## [ENFORCED CODING DESIGN PATTERNS]                  ← # good (merged across cascade levels)
## [PROHIBITED ANTI-PATTERNS]                         ← # bad (merged across cascade levels)
## [FEW-SHOT SYNTAX EXAMPLES]                         ← # example
## [VERIFICATION & UNIT TEST CRITERIA]                ← # test

[PROMPT FOOTER]
  ## [PRE-IMPLEMENTATION VERIFICATION GATE]            ← contract trace: SATISFIABLE | UNDERSPECIFIED | CONFLICTING
  ## [SCOPE & FOOTPRINT]                               ← scope fence + minimal-diff / reuse-existing bias
  ## [IMPLEMENTATION VERIFICATION CHECKLIST]           ← border-aware checklist, then ASSUMPTIONS block
```

---

## Keyword Reference

### Structural (always emitted)

- [PROMPT HEADER & PROMPT FOOTER](keywords/structural-wrappers.md) — role contract, assumption protocol, verification gate, and checklist

### Phase A — Environment Staging

- [`# lang`](keywords/lang.md) — language and runtime declaration
- [`# deps`](keywords/deps.md) — approved dependency whitelist
- [`# build`](keywords/build.md) — compilation and testing pipeline compatibility

### Phase B — Architectural Scoping

- [`# app`](keywords/app.md) — standalone deployable application
- [`# lib`](keywords/lib.md) — reusable library or package
- [`# namespace`](keywords/namespace.md) — named code boundary with cross-namespace isolation
- [`# module`](keywords/module.md) — bounded subsystem within a larger app or lib
- [`# res`](keywords/res.md) — read-only static data asset
- [`# rule`](keywords/rule.md) — non-negotiable system-level mandates

### Phase C — Context Engineering

- [`@include`](keywords/include.md) — compile-time file splice (preprocessor)
- [`# read`](keywords/read.md) — run-time file reference (structural)

### Phase D — Object Schemas & Implementation Contracts

- [`# entity`](keywords/entity.md) — data structure schema
- [`# function`](keywords/function.md) — function implementation contract (with `## arg`, `## return`, `## error`, `## flow`)
- [`# ui`](keywords/ui.md) — user interface surface (with `## form`, `## block`, `## image`, `## table`)

### Phase E — Reusable Automated Actions

- [`# action`](keywords/action.md) — named macro behavior

### Phase F — Guardrails, Few-Shots & Assurances

- [`# good`](keywords/good.md) — enforced coding design patterns
- [`# bad`](keywords/bad.md) — prohibited anti-patterns
- [`# example`](keywords/example.md) — few-shot syntax examples
- [`# test`](keywords/test.md) — verification and unit test criteria

### Compiler Stripped

- [`# notes` and `---`](keywords/notes.md) — developer scratchpad and termination marker (no prompt output)
