# `# function` — Function Implementation Contract

**Phase:** D — Object Schemas & Implementation Contracts  
**Aliases:** `# func`, `# fn`, `# method`  
**Sub-headers:** `## arg`, `## return`, `## error`, `## flow`

---

## Description

Declares a complete, binding implementation contract for a named function. Every parameter, the return type, each error condition, and every step of the logic flow are mandatory — the model must not skip, reorder, rename, or approximate any of them.

The directive processes four sub-headers sequentially, each mapping to a dedicated sub-section in the output.

---

## Explanation

`# function` is the most structurally complex directive in HINT. It coordinates four sub-directives into a single coherent contract:

- **`## arg`** — each argument becomes a bold-formatted parameter entry under `#### Parameters`
- **`## return`** — becomes the `#### Returns` line; when absent, renders as `void`
- **`## error`** — each error becomes an entry under `#### Errors`; the section is omitted entirely when no `## error` sub-blocks are present
- **`## flow`** — becomes the `#### Logic Flow` section with its "step-by-step without skipping" instruction

The "step-by-step without skipping any code validations" language in the Logic Flow prefix is the most important line in the function contract. It prevents the model from collapsing sequential logic into abbreviated summaries — a common failure mode where the model understands the steps but skips validation guards in the interest of brevity.

The Errors section instructs the model to emit at least one regression test per declared error. A declared error with no corresponding test is treated as an incomplete implementation.

---

## Sub-header Rendering Rules

The header line carries only the signature (`name: type` for args, `type` for return, `Type` for errors). The description is the body text on the following line(s), read until the next sub-header. The two are recombined in the output.

| Sub-header (header line + body) | Output section | Rendered as |
|---|---|---|
| `## arg name: type` + body | `#### Parameters` list item | `- **\`name: type\`** — <body>` |
| `## return type` + body | `#### Returns` | `` `type` — <body> `` |
| `## error Type` + body | `#### Errors` list item | `- **\`Type\`** — <body>` (section instructs one regression test per declared error) |
| `## flow` | `#### Logic Flow` | _"Implement the following logical sequence step-by-step without skipping any code validations:"_ |

---

## Example

**Input:**

```markdown
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

---

## Prompt Template

```
### FUNCTION CONTRACT: {Name}

Implement the {Name} function according to the binding contract below. Every parameter, the return type, each error condition, and every step of the logic flow are mandatory — do not skip, reorder, rename, or approximate any of them.

#### Parameters

{args as: - **`name: type`** — desc}

#### Returns

`{return_type}` — {return_desc}

#### Errors

Throw these exact error types under the described conditions only. Do not substitute, wrap, or rename them. For every error listed here, emit at least one regression test that fails without the guard and passes with it — a declared error with no corresponding test is an incomplete implementation:

{errors as: - **`Type`** — condition}

#### Logic Flow

Implement the following logical sequence step-by-step without skipping any code validations:

{flow body}
```

_(The `#### Errors` section is omitted entirely when no `## error` sub-blocks are declared. `#### Returns` renders as `void` when no `## return` is declared.)_
