# `# lib` — Library Scope Declaration

**Phase:** B — Architectural Scoping  
**Aliases:** `# library`  
**Related:** [`# app`](app.md), [`# module`](module.md), [`# namespace`](namespace.md)

---

## Description

Declares the compilation unit as a reusable library — a package consumed by other code, not deployed directly. Wraps the body in a `<system_context type="LIB">` XML block that creates a hard semantic boundary the model treats as the authoritative description of what it is building.

The optional `[name]` argument becomes the `name` attribute on the XML tag. When no name is provided, the `name` attribute is omitted entirely.

---

## Explanation

XML context wrappers (`<system_context>`) create hard semantic boundaries that the model treats as isolated instruction regions. LLMs are trained on XML-structured data and process these boundaries reliably — the model understands that the text inside the tag is the authoritative description of the scope it is implementing.

Use `# lib` when the compilation unit is a package that other code imports: a utility library, an SDK, a shared component package. For a standalone deployable use [`# app`](app.md); for a bounded subsystem within a larger app use [`# module`](module.md); for a named code boundary with explicit cross-namespace isolation use [`# namespace`](namespace.md).

Any `{reference}` tokens inside the body are resolved by the compiler: `{cartService}` becomes `cartService` in the output (curly braces stripped, name preserved).

---

## Example

**Named:**

Input:
```markdown
# lib PricingUtils

Shared pricing calculation library used by the cart, checkout, and subscription services. Exposes discount, tax, and rounding helpers only — no I/O or side effects.
```

Output:
```markdown
<system_context type="LIB" name="PricingUtils">

Shared pricing calculation library used by the cart, checkout, and subscription services. Exposes discount, tax, and rounding helpers only — no I/O or side effects.

</system_context>
```

**Name-less:**

Input:
```markdown
# lib

Shared pricing calculation library used across services.
```

Output:
```markdown
<system_context type="LIB">

Shared pricing calculation library used across services.

</system_context>
```

---

## Prompt Template

**Named:**
```
<system_context type="LIB" name="{name}">

{body}

</system_context>
```

**Name-less:**
```
<system_context type="LIB">

{body}

</system_context>
```
