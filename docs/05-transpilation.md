# HINT Prompt Mapping Specification v1.0.0

This document defines the exact, deterministic prompt strings the HINT transpiler produces for every special word in the syntax. Each mapping is the authoritative implementation contract — template files in `packages/transpiler/keywords/` must produce outputs that match these specifications precisely.

> **Keyword normalization.** The directives below are written in their canonical short, lowercase form. Before these mappings apply, the compiler normalizes every keyword: matching is case-insensitive and full-word aliases collapse to the canonical keyword (`# Application` → `# app`, `# Dependencies` → `# deps`, `## argument` → `## arg`, etc. — see the alias table in the Syntax Specification). The output is therefore identical regardless of which accepted spelling appears in the source.

---

```
[PROMPT HEADER]       ─────────────────────────► [ROLE + BORDER CONTRACT + ASSUMPTION PROTOCOL]

@include              ─────────────────────────► [Inlined Content Stream — no prompt output]
# read                ─────────────────────────► <repository_file name="..."> ... </repository_file>

# lang    ───┐
# deps    ───┴────────────────────────────────► ## [ENVIRONMENT RUNTIME & LANGUAGE]
# build   ─────────────────────────────────── ► ## [COMPILATION & TESTING PIPELINES]

# app     ───┐
# lib     ───┼────────────────────────────────► <system_context type="APP|LIB|MODULE" name="...">
# module  ───┘
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

## Structural Wrappers (Every Compiled Prompt)

These are not triggered by a HINT directive. The compiler emits them unconditionally as the opening and closing of every compiled prompt.

### PROMPT HEADER

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

### PROMPT FOOTER

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
- When modifying an existing codebase, prefer the smallest possible diff: touch the fewest files, reuse the utilities and patterns exposed via the files named by `# read`, and never reimplement something that already exists in the provided context.

## [IMPLEMENTATION VERIFICATION CHECKLIST]

Confirm each point before returning the final code:

- [ ] Every data structure is implemented with all specified fields, types, and constraints — no additions, no omissions, no renames.
- [ ] Every function contract is implemented with the correct signature, error handling, and logic flow — step by step, in order.
- [ ] Every action macro is wired to its described trigger condition.
- [ ] Every system mandate is enforced throughout the implementation.
- [ ] No surface — file, module, abstraction, parameter, or dependency — exists that the specification did not require.
- [ ] No dependency outside the approved whitelist has been introduced.
- [ ] No prohibited pattern appears anywhere in the implementation.
- [ ] No `TODO`, `FIXME`, or stub remains; every specified path is fully implemented.
- [ ] Every error condition declared in a function contract has at least one regression test that fails without the guard and passes with it.
- [ ] Every assumption made for an underspecified clause is marked inline (in the target language's comment syntax) and listed in the ASSUMPTIONS block.
- [ ] All verification criteria are covered by the test suite.

Generate the complete implementation now, followed by the ASSUMPTIONS block (or `ASSUMPTIONS: none`).
```

---

## Phase A — Environment Staging

`# lang` and `# deps` are merged into one prompt section. `# lang` opens the section header; `# deps` injects the dependency whitelist beneath it as a sub-block. The compiler renders them sequentially and they form a single environment contract.

### `# lang`

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

### `# deps`

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

### `# build`

**Input:**

```markdown
# build

- npm run build to compile
- make test to run vitest suites
```

**Output:**

```markdown
## [COMPILATION & TESTING PIPELINES]

The following commands validate this codebase. All generated code, configuration files, and project structure must remain compatible with these pipelines. Do not generate anything that breaks them.

- npm run build to compile
- make test to run vitest suites
```

---

## Phase B — Architectural Scoping

### `# app [name]`, `# lib [name]`, `# module [name]`

These three directives use the same XML wrapper format. The `type` attribute is set to `APP`, `LIB`, or `MODULE` by the compiler depending on the directive keyword. The `name` attribute is the optional identifier. When no name is provided, the `name` attribute is omitted.

**Input:**

```markdown
# module cartActions

This module handles state transformations, coupon processing, and stock locking routines for active checkouts within our {cartService}.
```

**Output:**

```markdown
<system_context type="MODULE" name="cartActions">

This module handles state transformations, coupon processing, and stock locking routines for active checkouts within our cartService application.

</system_context>
```

**Input (name-less variant):**

```markdown
# app

The Cart Service manages transient user shopping baskets.
```

**Output:**

```markdown
<system_context type="APP">

The Cart Service manages transient user shopping baskets.

</system_context>
```

---

### `# res [name]`

**Input:**

```markdown
# res countryCodes

Geo-configuration file containing country abbreviation codes, localized tax rate defaults, and active currency mappings used during globalization checks.
```

**Output:**

```markdown
### [STATIC DATA ASSET: countryCodes]

Read this data asset definition to understand its structure and access patterns. Do not generate functions that attempt to modify or write to this asset — it is read-only configuration data.

Geo-configuration file containing country abbreviation codes, localized tax rate defaults, and active currency mappings used during globalization checks.
```

---

### `# rule`

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

## Phase C — Context Engineering Directives

Both directives bring outside files into play, but they act at opposite ends of the pipeline — which is why one is an `@` preprocessor directive and the other a `#` structural directive:

- **`@include` resolves at compile time.** The compiler opens the target file, reads it, and splices its raw bytes directly into the token stream. The content physically becomes part of the spec before anything else is parsed. It produces no output of its own. Use it for HINT fragments and shared rule files that should literally be part of the prompt.
- **`# read` resolves at run time.** The compiler does **not** open or inline the file. It emits a structural section instructing the LLM to read the real source file(s) itself — by path — before writing code, and binds them to a reference name. Use it for actual source files the agent has filesystem access to: it keeps the prompt dense, avoids embedding large or fast-changing files, and never goes stale.

In short: `@include` is "paste this in now"; `# read` is "go read this yourself."

---

### `@include <glob>`

No prompt output is produced. The compiler recursively reads the target file and splices its raw content into the current token stream before any further parsing. `@include` is invisible in the final prompt — its effect is whatever the included file expands to.

---

### `# read {glob} as [name]`

A structural directive: the compiler emits a reference block naming the file(s) and instructing the LLM to read them at the given path before generating code. The file's contents are **not** embedded — the agent is expected to open the path itself. The lines immediately following the directive describe the file's architectural significance.

**Input:**

```markdown
# read {src/infrastructure/logger.ts} as AppLogger

This is the base utility used for error trace logging and system audits. It maps directly to our production cloud monitoring dashboard payloads.
```

**Output:**

```markdown
<repository_file name="AppLogger" path="src/infrastructure/logger.ts">

This is the base utility used for error trace logging and system audits. It maps directly to our production cloud monitoring dashboard payloads.

Before writing any code that touches this reference, open and read the file(s) at the path above and analyze them carefully. Mirror their existing formatting, export patterns, and error-handling architecture. Do not guess at their contents, and do not reimplement what they already provide.

</repository_file>
```

When a glob matches multiple files, the `path` attribute lists the pattern and the instruction refers to "the file(s)". If the agent has no filesystem access (for example, a raw paste into a browser chat), it should ask for the named file(s) rather than inventing their contents.

---

## Phase D — Object Schemas & Implementation Contracts

### `# entity [Name]`

**Input:**

```markdown
# entity ShoppingCart

- id: string (uuidv4)
- userId: string | null (supports anonymous checkouts)
- items: Array<{CartItem}>
- couponCode: string | null
```

**Output:**

```markdown
### DATA STRUCT: ShoppingCart

Implement the ShoppingCart data model with this exact schema. Do not alter field names, change types, add undeclared fields, or omit any field listed here. This is the authoritative blueprint for this structure throughout the codebase.

- id: string (uuidv4)
- userId: string | null (supports anonymous checkouts)
- items: Array<CartItem>
- couponCode: string | null
```

---

### `# function [Name]`

The function directive processes four sub-headers sequentially: `## arg`, `## return`, `## error`, `## flow`. Each maps to a dedicated sub-section in the output.

**Input:**

```markdown
# function applyCoupon

## arg cart: {ShoppingCart} - The active user shopping cart instance.

## arg code: string - The raw coupon identifier string to apply.

## return {ShoppingCart} - The updated cart entity with applied discount fields.

## error ExpiredCouponError - Thrown if the current calendar date is past the coupon validity window.

## error MinimumOrderValueException - Thrown if the cart total is lower than the coupon threshold.

## flow

1. Query our database to fetch metadata for the requested coupon `code`.
2. Check if the coupon is still active. If expired, halt and throw an ExpiredCouponError.
3. Sum the `priceInCents` multiplied by `quantity` for all items inside the ShoppingCart.
4. Compare total with coupon requirements. If insufficient, throw MinimumOrderValueException.
5. Apply the discount percentage to the total, mutate the cart's coupon state, and return the cart instance.
```

**Output:**

```markdown
### FUNCTION CONTRACT: applyCoupon

Implement the applyCoupon function according to the binding contract below. Every parameter, the return type, each error condition, and every step of the logic flow are mandatory — do not skip, reorder, rename, or approximate any of them.

#### Parameters

- **`cart: ShoppingCart`** — The active user shopping cart instance.
- **`code: string`** — The raw coupon identifier string to apply.

#### Returns

`ShoppingCart` — The updated cart entity with applied discount fields.

#### Errors

Throw these exact error types under the described conditions only. Do not substitute, wrap, or rename them. For every error listed here, emit at least one regression test that fails without the guard and passes with it — a declared error with no corresponding test is an incomplete implementation:

- **`ExpiredCouponError`** — Thrown if the current calendar date is past the coupon validity window.
- **`MinimumOrderValueException`** — Thrown if the cart total is lower than the coupon threshold.

#### Logic Flow

Implement the following logical sequence step-by-step without skipping any code validations:

1. Query our database to fetch metadata for the requested coupon `code`.
2. Check if the coupon is still active. If expired, halt and throw an ExpiredCouponError.
3. Sum the `priceInCents` multiplied by `quantity` for all items inside the ShoppingCart.
4. Compare total with coupon requirements. If insufficient, throw MinimumOrderValueException.
5. Apply the discount percentage to the total, mutate the cart's coupon state, and return the cart instance.
```

**Sub-header rendering rules:**

| Sub-header                  | Output section              | Instructional prefix                                                                             |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `## arg name: type - desc`  | `#### Parameters` list item | `- **\`name: type\`\*\* — desc`                                                                  |
| `## return type - desc`     | `#### Returns`              | `` `type` — desc ``                                                                              |
| `## error Type - condition` | `#### Errors` list item     | `- **\`Type\`\*\* — condition` (section instructs one regression test per declared error)        |
| `## flow`                   | `#### Logic Flow`           | _"Implement the following logical sequence step-by-step without skipping any code validations:"_ |

When no `## error` sub-blocks are present, the Errors section is omitted entirely. When no `## return` is present, Returns renders as `void`.

---

### `# ui [Name]`

The ui directive describes a user interface surface and processes four repeatable sub-headers: `## form`, `## block`, `## image`, `## table`. Each may appear any number of times and carries an optional name. The surface opens with a scope-fenced instruction; every sub-header renders as its own `####` subsection.

**Input:**

```markdown
# ui LoginScreen

The screen a user sees when signing in.

## form CredentialsForm

Fields:

- email: string (required, validated email pattern)
- password: string (required, masked input, min 8 chars)

Actions:

- Submit: validate inputs, then call {executeLogin}; on failure show an inline error.
- Forgot password: link to {PasswordResetScreen}.

## image BrandMark

Source: {brandAssets} primary logo. Alt text: "Acme". Centered above the form, max width 160px.
```

**Output:**

```markdown
### UI SURFACE: LoginScreen

Build this user interface surface exactly as specified. Implement only the elements declared below — do not add components, fields, columns, controls, or decorative elements that are not listed, and do not omit any that are. Match the structure, labels, validation, and behavior described for each element.

The screen a user sees when signing in.

#### FORM: CredentialsForm

Render this form with exactly the fields and actions listed — no extra inputs, no omitted ones. Apply the stated validation rules and wire each action to its described behavior:

Fields:

- email: string (required, validated email pattern)
- password: string (required, masked input, min 8 chars)

Actions:

- Submit: validate inputs, then call executeLogin; on failure show an inline error.
- Forgot password: link to PasswordResetScreen.

#### IMAGE: BrandMark

Place this image as specified, honoring its source, alt text, and role in the layout. Do not substitute it or add imagery beyond what is declared:

Source: brandAssets primary logo. Alt text: "Acme". Centered above the form, max width 160px.
```

**Sub-header rendering rules:**

| Sub-header      | Output section     | Instructional prefix                                                                                                                                                                   |
| --------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## form name`  | `#### FORM: name`  | _"Render this form with exactly the fields and actions listed — no extra inputs, no omitted ones. Apply the stated validation rules and wire each action to its described behavior:"_  |
| `## block name` | `#### BLOCK: name` | _"Compose this visual region exactly as described. Do not introduce additional sections or rearrange the declared structure:"_                                                         |
| `## image name` | `#### IMAGE: name` | _"Place this image as specified, honoring its source, alt text, and role in the layout. Do not substitute it or add imagery beyond what is declared:"_                                 |
| `## table name` | `#### TABLE: name` | _"Render this table with exactly the columns and data binding described. Implement the stated sorting, pagination, and empty-state behavior; do not add columns that are not listed:"_ |

Each sub-header may repeat. When a sub-header carries no name, the colon and name suffix are omitted (`#### FORM`, `#### TABLE`, etc.). When no name is given on `# ui` itself, the surface renders as `### UI SURFACE` with no colon or name. The scope fence in the opening instruction is deliberate — a UI surface is the strongest case for "build exactly what is declared," since a stray field or column is an immediate, visible defect.

---

## Phase E — Reusable Automated Actions

### `# action [name]`

Actions are a critical distinction in HINT. Unlike functions, they are macro behaviors — workflow commands the model must memorize by name token and execute when the described conditions are met.

**Input:**

```markdown
# action invalidateSessionCache

Whenever a user logs out, closes their tab explicitly, or completes a checkout sequence, find their session token inside our Redis store and purge it instantly.
```

**Output:**

```markdown
## [REUSABLE AUTOMATION SCRIPTS: invalidateSessionCache]

The following action is registered as a macro behavior. Whenever the described condition is met or this action is referenced by name in other blocks, execute the following steps exactly:

Whenever a user logs out, closes their tab explicitly, or completes a checkout sequence, find their session token inside our Redis store and purge it instantly.
```

---

## Phase F — Guardrails, Few-Shots & Assurances

### `# good`

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

### `# bad`

**Input:**

```markdown
# bad

- Never store active discount values inside a raw browser cookie session; always calculate discounts server-side.
```

**Output:**

```markdown
## [PROHIBITED ANTI-PATTERNS]

CRITICAL ASSURANCE: You are strictly prohibited from implementing the following behaviors under any circumstances. These prohibitions exist because of real vulnerabilities and failures in this codebase — do not reintroduce them:

- Never store active discount values inside a raw browser cookie session; always calculate discounts server-side.
```

---

### `# example [name]`

**Input:**

```markdown
# example validCouponRequest

{
"cartId": "uuid-1234",
"couponCode": "SAVE20"
}
```

**Output:**

```markdown
## [FEW-SHOT SYNTAX EXAMPLES: validCouponRequest]

The following example demonstrates the required implementation pattern. Replicate this structure, naming conventions, and style exactly:

{
"cartId": "uuid-1234",
"couponCode": "SAVE20"
}
```

When no name is provided: `## [FEW-SHOT SYNTAX EXAMPLES]` with no colon or name suffix.

---

### `# test [for target]`

**Input:**

```markdown
# test for applyCoupon

- Expired coupon: assert ExpiredCouponError is thrown when coupon date is in the past.
- Minimum order: assert MinimumOrderValueException is thrown when cart total < coupon threshold.
- Valid coupon: assert returned cart contains applied discount and correct total.
```

**Output:**

```markdown
## [VERIFICATION & UNIT TEST CRITERIA: applyCoupon]

Generate tests that explicitly cover every scenario listed below. Each edge case, mock data structure, and assertion described here must appear in the test output. Do not omit any scenario:

- Expired coupon: assert ExpiredCouponError is thrown when coupon date is in the past.
- Minimum order: assert MinimumOrderValueException is thrown when cart total < coupon threshold.
- Valid coupon: assert returned cart contains applied discount and correct total.
```

When no name is provided: `## [VERIFICATION & UNIT TEST CRITERIA]` with no colon or name suffix.

---

### `# notes` and `---`

Both are stripped entirely. No prompt output is produced. `# notes` is the developer's private scratchpad. `---` is the explicit termination marker — everything below it in the same file is ignored. Neither reaches the AI.

---

## `# require [name]`

Scoped import declaration — explicitly lists which packages and modules a specific scope must have available. Rendered as a dependency sub-section scoped to the named boundary.

**Input:**

```markdown
# require cartActions

- prisma (for database operations)
- ioredis (for Redis session access)
```

**Output:**

```markdown
### [MODULE DEPENDENCIES: cartActions]

The following packages must be imported and available for this scope. Do not add imports outside this list for this module:

- prisma (for database operations)
- ioredis (for Redis session access)
```

When no name is provided: `### [MODULE DEPENDENCIES]` with no colon or name suffix.

---

## Complete Compiled Prompt Structure

A fully compiled prompt assembles in this order:

```
[PROMPT HEADER]

<repository_file name="..."> ... </repository_file>   ← one block per # read, in declaration order

## [ENVIRONMENT RUNTIME & LANGUAGE]                   ← # lang
### Approved Dependency Whitelist                      ← # deps (sub-section of lang)

## [COMPILATION & TESTING PIPELINES]                  ← # build

## [CRITICAL SYSTEM MANDATES]                         ← # rule (merged across all cascade levels)

<system_context type="APP|LIB|MODULE" name="...">     ← # app / # lib / # module
...
</system_context>

### [STATIC DATA ASSET: name]                         ← # res
### [MODULE DEPENDENCIES: name]                       ← # require

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
