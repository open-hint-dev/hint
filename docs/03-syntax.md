# HINT Syntax Specification v1.0.0

HINT files are 100% valid Markdown. They can be read by any standard editor, giving you native syntax highlighting, markdown preview, and code folding out of the box.

> **Note:** The directives below describe the _input_ grammar only. When compiling, HINT wraps the assembled directives in a fixed border contract — a header that fences the model to your declared architecture and a footer that makes it verify every clause and report its assumptions before writing code. These wrappers add no new syntax to your `.hint` files; see the Prompt Mapping Specification for their exact text.

## Core Grammar Rules

### File Context Directives

HINT brings external files into a spec with two directives. They use different prefixes because they act at different stages of the pipeline:

- `@include <glob_pattern>`: A compile-time **preprocessor** action — the only `@` directive. The compiler immediately reads the target file and inlines its raw content into the current token stream before evaluating further; the content physically becomes part of the spec. Reserve it for HINT fragments whose blocks must participate in parsing or merge semantics.
- `# read {glob_pattern} as [referenceName]`: A **structural** directive (`#` prefix), resolved at **run time**. The compiler does _not_ read or inline the file; it emits an instruction directing the LLM to open and read the real source file(s) itself, by path, before writing code, and binds them to the given reference name. The `as [referenceName]` clause is optional. Use it for actual source files the agent can open. The lines immediately following this directive describe the file's purpose.

The prefix tells you the stage: `@` runs at compile time and may produce no output (`@include` is invisible in the final prompt); `#` is a structural block that emits a prompt section (`# read` emits a read instruction). In short — `@include` pastes the file in now; `# read` tells the LLM to read it once and reuse it by reference. Prefer `# read` unless literal token-stream insertion is required.

### Structural Directive Blocks

Top-level structural sections are defined using standard markdown headers (`# `) followed by the directive keyword and an optional target name.

```markdown
# directiveName [targetName]
```

### Keyword Casing & Aliases

Directive keywords are **case-insensitive** — `# app`, `# App`, and `# APP` are the same directive. In addition, every abbreviated keyword accepts its **full-word form** as an alias, so you can write whichever reads better to you. The compiler normalizes all forms to the canonical keyword before emitting, so the compiled prompt is identical no matter which spelling you use.

| Canonical (short) | Full-word alias  |
| ----------------- | ---------------- |
| `# lang`          | `# language`     |
| `# deps`          | `# dependencies` |
| `# app`           | `# application`  |
| `# lib`           | `# library`      |
| `# ui`            | `# interface`    |
| `# res`           | `# resource`     |
| `## arg`          | `## argument`    |
| `## return`       | `## returns`     |

Every other keyword is already a full word and only needs to match case-insensitively — `# Module`, `# Notes`, `# Entity`, `# Function`, `# Rule`, `# Read`, `## Form`, `## Table`, and so on all work. The same applies to the `@include` preprocessor directive.

### Block Accumulation and Termination

- **Sequential Parsing**: A block begins on the line following an `@` or `# ` directive header. The parser accumulates lines into that block's text body sequentially.
- **Implicit Termination**: A block implicitly terminates when the parser hits another top-level header starting with `@` or `# `, or encounters the End-Of-File (EOF).
- **Explicit Termination (`---`)**: If a line contains exactly `---` (markdown horizontal rule), the active block terminates instantly. All subsequent lines until the next header are treated as plain human text/comments and are entirely ignored by the compiler.

### Variable Interpolation (`{name}`)

HINT allows cross-referencing between blocks using curly braces `{name}` notation (e.g., `{ShoppingCart}`). The compiler automatically cross-references these tokens against defined entities, libraries, actions, or files read via `# read` to construct reference links for the AI model. If a variable is used but never declared in the context tree, the compiler throws a strict `ReferenceError`.

---

## Directives Reference

### 1. Project & Environment Stack

- `# lang`: Specifies the target programming language, execution mode, engine specifications, or formatting standards (e.g. TypeScript, JSON, Go).
- `# deps`: Defines the allowed, required, or forbidden third-party libraries, framework plugins, SDKs, or tools.
- `# build`: Outlines compilation pipelines, target outputs, continuous testing configurations, or automation shell mechanics (e.g., Makefiles, Docker multi-stage layers).

### 2. # entity

Defines core domain objects, database schemas, API payload shapes, or data models.

- **Format**: `# entity [EntityName]`

### 3. # function

Maps sequential logic blocks, transactional behaviors, or algorithmic loops tied to structured input/output contracts. It enforces a strict layout with the LLM using four functional sub-headers:

- `## arg [parameterName]: [type]`: Defines an explicit input parameter. The header line holds only `name: type`; its description follows on the next line(s).
- `## return [type]`: Declares the expected output payload. The header line holds only the type; its description follows on the next line(s).
- `## error [ExceptionType]`: Highlights a possible failure condition. The header line holds only the exception type; the trigger condition follows on the next line(s). Each declared error also instructs the model to emit at least one regression test covering that condition, so declaring an error gives you both the guard and its test.

Like every HINT block, the parser reads the rest of the header line as the name/signature, then accumulates the following lines as the body (the description) until the next header. There is no inline `- description` on the header line.

- `## flow`: A step-by-step sequential list of the business rules or logic steps written in plain language.

### 4. # ui

Describes a user interface surface — a screen, page, view, or component — and the visual elements it contains. Like `# function`, it uses a fixed set of sub-headers, each of which may appear multiple times and carry an optional name:

- `## form [formName]`: A form, described by its fields and actions. List the input fields (with type and validation) and the actions (buttons, links) along with the behavior each one triggers.
- `## block [blockName]`: A visual block or region of the layout (header, sidebar, card, section). Describe its content, structure, and responsive behavior.
- `## image [imageName]`: An image element. Describe its source, alt text, and role in the layout.
- `## table [tableName]`: A table visual. Describe its columns, data binding, and behavior (sorting, pagination, empty state).

- **Format**: `# ui [surfaceName]`

Only the elements declared inside a `# ui` block are built — the compiled prompt forbids the model from adding fields, columns, controls, or decorative elements that are not listed, and from omitting any that are. References via `{name}` work inside any sub-header body (e.g. a form action that calls `{executeLogin}`, or a table bound to `{Order}` records).

### 5. # action

Defines a specific task, operational instruction, automation behavior, macro, or runtime command block. Unlike functions, actions do not require full typing contracts and are built to be called out by reference or executed conditionally under specific rules.

- **Format**: `# action [actionName]`

### 6. Operational, Library & Asset Scopes

- `# app [appName]`: High-level summary of a specific application's intent, service boundaries, or deployment targets.
- `# lib [libName]`: Declares wide codebase utility scopes, package frameworks, or cross-cutting helper libraries.
- `# namespace [namespaceName]`: A logical grouping and boundary that bundles related modules, entities, and functions under one qualified name and import root. It is the language-neutral name for whatever the target language calls this unit — Go/Java _package_, C#/C++/TypeScript _namespace_, Rust _module_, Python _package_ — and the compiler lowers it to the target's construct. Declares what qualified name generated code belongs under and what may be referenced across the boundary.
- `# module [moduleName]`: Identifies a single, logical file of execution code. It bridges structural application domains down to their localized functions and internal entities.
- `# res [resourceName]`: Describes non-code project assets (e.g., JSON schema configs, localization text files, static maps, images, or assets directories) specifying their purpose, structural patterns, and application boundaries.
- `# rule`: Details strict non-functional constraints, SLA performance timings, data isolation protocols, or security compliance mandates.

### 7. Guardrails & Assurances

- `# good`: Documents required patterns, code styling rules, or successful engineering approaches.
- `# bad`: Outlines strict prohibitions, safety risks, anti-patterns, or known bugs to prevent.
- `# example`: Injects few-shot examples or direct visual layouts for the model to replicate.
- `# test [for targetName]`: Instructs the model on exactly how to verify the code, outlining edge cases, mock data requirements, and test assertions.

### 8. Exploration & Live Brainstorming (Dropped During Compilation)

- `# notes`: Used exclusively during exploration and idea generation. It serves as a personal developer log and sandbox directly within the module specification file. **The HINT compiler explicitly ignores this section and strips it completely when building the final prompt payload.** Because the compiled prompt forbids the model from leaving `TODO`/`FIXME`/stub markers in generated code, `# notes` is the correct home for deferred work and future ideas — record them here, where they stay out of the output entirely.

---

## Implementation Blueprint Example

In a production repository, your HINT specifications are split cleanly across the filesystem into companion files that sit right next to the code files they describe. This maximizes context locality.

### 1. Folder Baseline (`src/domain/cart/_.hint`)

```markdown
# lang

TypeScript (Node.js v22+ / Bun runtime)

# deps

- Prisma ORM for database connectivity
- Redis client for ephemeral session state
- Avoid heavy external math libraries; calculate totals using basic native decimal integers (cents).

# build

- docker build -t cart-service .
- make test to run local suites

# app cartService

The Cart Service manages transient user shopping baskets, computes active discounts, validates item stock thresholds, and converts active sessions into finalized order definitions.

# action invalidateSessionCache

Whenever a user logs out, closes their tab explicitly, or completes a checkout sequence, find their session token inside our Redis store and purge it instantly.
```

### 2. Static Resource Asset Companion (`src/assets/geo/countries.json.hint`)

```markdown
# lang

JSON (RFC 8259)

# res countryCodes

This is our geo-configuration file containing mapping arrays for country abbreviation codes, localized tax rate defaults, and active currency mappings used during globalization checks.
```

### 3. Structural Module Companion (`src/domain/cart/actions.ts.hint`)

```markdown
@include <shared_rules.hint>

# read {src/infrastructure/logger.ts} as AppLogger

This is the base utility used for error trace logging and system audits. It maps directly to our production cloud monitoring dashboard payloads.

# module cartActions

This module handles state transformations, coupon processing, and stock locking routines for active checkouts within our {cartService}.

# rule

- All operations within this module must complete within a strict 200ms latency ceiling.
- Under high-concurrency pressure, graceful degradation routines must default to standard database lookups.

# entity CartItem

- sku: string (unique store keeper unit code)
- quantity: number (must be a positive integer)
- priceInCents: number (frozen at time of addition)

# entity ShoppingCart

- id: string (uuidv4)
- userId: string | null (supports anonymous checkouts)
- items: Array<{CartItem}>
- couponCode: string | null

# function applyCoupon

## arg cart: {ShoppingCart}

The active user shopping cart instance.

## arg code: string

The raw coupon identifier string to apply.

## return {ShoppingCart}

The updated cart entity with applied discount fields.

## error ExpiredCouponError

Thrown if the current calendar date is past the coupon validity window.

## error MinimumOrderValueException

Thrown if the cart total is lower than the coupon threshold.

## flow

1. Query our database to fetch metadata for the requested coupon `code`.
2. Check if the coupon is still active. If expired, halt and throw an ExpiredCouponError.
3. Sum the `priceInCents` multiplied by `quantity` for all items inside the {ShoppingCart}.
4. Compare total with coupon requirements. If insufficient, throw MinimumOrderValueException.
5. Apply the discount percentage to the total, mutate the cart's coupon state, and return the cart instance.
6. If the transaction passes completely, trigger the {invalidateSessionCache} action immediately.
7. If an error occurs, pass the error object to the {AppLogger} module for transaction auditing.

# good

- Always perform item stock availability verification hooks before returning the finalized object state.
- Ensure all pricing computations operate strictly on whole numbers to avoid JavaScript floating point errors.

# bad

- Never store active discount values inside a raw browser cookie session; always calculate discounts server-side.

# notes

- Add support for regional tax calculations under a new `# function calculateTax` block next week. Cross-reference options with the {countryCodes} static asset profiles.
- Refactor Redis session timeouts from 14 days down to 7 days for security audit.
- Explore alternative setups using an in-memory cache instead of Redis if performance bottlenecks show up in staging.

---

Everything below this line will be treated as plain text comments by the parser.
```
