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

<repository_file name="AppLogger" path="src/infrastructure/logger.ts">

The base utility for error trace logging. Mirror its export and error-handling patterns in all generated code.

Before writing any code that touches this reference, open and read the file(s) at the path above and analyze them carefully. Mirror their existing formatting, export patterns, and error-handling architecture. Do not guess at their contents, and do not reimplement what they already provide.

</repository_file>

## [ENVIRONMENT RUNTIME & LANGUAGE]

Write all code strictly targeting the following language specification. Apply the correct module syntax, standard library APIs, and runtime-specific idioms throughout. Do not use syntax, features, or tools that do not belong to this target.

TypeScript (Node.js v22+ / ESM)

### Approved Dependency Whitelist

You are strictly forbidden from installing or importing any package outside of this list:

- Prisma ORM for database connectivity
- ioredis for Redis session access
- Avoid any date arithmetic libraries; use native Date and UTC timestamps.

## [COMPILATION & TESTING PIPELINES]

The following commands validate this codebase. All generated code, configuration files, and project structure must remain compatible with these pipelines. Do not generate anything that breaks them.

- npm run build to compile
- make test to run vitest suites

## [CRITICAL SYSTEM MANDATES]

The following mandates are non-negotiable system-level constraints. Every function, data access pattern, and error path must satisfy all mandates listed here without exception:

- All operations must complete within 200ms.
- Every external service call must be wrapped in a try/catch that logs via AppLogger.

<system_context type="NAMESPACE" name="billing">

All code in this scope belongs to the `billing` namespace — emit it under the target language's namespacing construct (package, namespace, or module path) with this as the qualified name and import root. Handles coupon application and discount calculation. May reference cartStore; nothing here may be imported by the catalog namespace. Keep cross-namespace references explicit and do not leak symbols across this boundary.

</system_context>

### DATA STRUCT: ShoppingCart

Implement the ShoppingCart data model with this exact schema. Do not alter field names, change types, add undeclared fields, or omit any field listed here. This is the authoritative blueprint for this structure throughout the codebase.

- id: string (uuidv4)
- userId: string | null
- items: Array<CartItem>
- couponCode: string | null
- subtotalInCents: number

### DATA STRUCT: CartItem

Implement the CartItem data model with this exact schema. Do not alter field names, change types, add undeclared fields, or omit any field listed here. This is the authoritative blueprint for this structure throughout the codebase.

- productId: string
- quantity: number (positive integer, min 1)
- priceInCents: number

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

1. Query the database to fetch coupon metadata for the given `code`.
2. If the coupon expiry date is before today, throw ExpiredCouponError.
3. Sum priceInCents multiplied by quantity across all cart items.
4. If the subtotal is below the coupon minimum, throw MinimumOrderValueException.
5. Apply the discount percentage to the subtotal and set couponCode on the cart.
6. Persist the updated cart and return it.

## [REUSABLE AUTOMATION SCRIPTS: invalidateSessionCache]

The following action is registered as a macro behavior. Whenever the described condition is met or this action is referenced by name in other blocks, execute the following steps exactly:

Whenever a user logs out or completes a checkout, purge their session token from the Redis store immediately.

## [ENFORCED CODING DESIGN PATTERNS]

Apply every pattern and practice listed below in all generated code without exception. These are validated, required standards for this codebase — do not substitute alternatives, even equivalent-seeming ones:

- Always use database transactions for any write that touches more than one table.
- Log every thrown error through AppLogger before rethrowing.

## [PROHIBITED ANTI-PATTERNS]

CRITICAL ASSURANCE: You are strictly prohibited from implementing the following behaviors under any circumstances. These prohibitions exist because of real vulnerabilities and failures in this codebase — do not reintroduce them:

- Never calculate discounts client-side; all pricing logic must execute on the server.
- Never swallow errors silently — every catch block must log or rethrow.

## [VERIFICATION & UNIT TEST CRITERIA: applyCoupon]

Generate tests that explicitly cover every scenario listed below. Each edge case, mock data structure, and assertion described here must appear in the test output. Do not omit any scenario:

- Expired coupon: assert ExpiredCouponError when coupon date is past.
- Below minimum: assert MinimumOrderValueException when cart total is under threshold.
- Valid coupon: assert returned cart has updated subtotalInCents and couponCode set.

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
