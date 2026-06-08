# `# module` — Module Scope Declaration

**Phase:** B — Architectural Scoping  
**Related:** [`# app`](app.md), [`# lib`](lib.md), [`# namespace`](namespace.md)

---

## Description

Declares the compilation unit as a bounded subsystem within a larger application or library — a feature module, a domain package, a cohesive group of related functions. Wraps the body in a `<system_context type="MODULE">` XML block that creates a hard semantic boundary the model treats as the authoritative description of what it is building.

The optional `[name]` argument becomes the `name` attribute on the XML tag. When no name is provided, the `name` attribute is omitted entirely.

---

## Explanation

XML context wrappers (`<system_context>`) create hard semantic boundaries that the model treats as isolated instruction regions. LLMs are trained on XML-structured data and process these boundaries reliably — the model understands that the text inside the tag is the authoritative description of the scope it is implementing.

Use `# module` when the compilation unit is a subsystem that lives inside a larger app or lib: a domain module, a feature package, a service layer. For a standalone deployable use [`# app`](app.md); for a reusable package use [`# lib`](lib.md); for a named code boundary with explicit cross-namespace isolation use [`# namespace`](namespace.md).

Any `{reference}` tokens inside the body are resolved by the compiler: `{cartService}` becomes `cartService` in the output (curly braces stripped, name preserved).

---

## Example

**Named:**

Input:
```markdown
# module cartActions

This module handles state transformations, coupon processing, and stock locking routines for active checkouts within our {cartService}.
```

Output:
```markdown
<system_context type="MODULE" name="cartActions">

This module handles state transformations, coupon processing, and stock locking routines for active checkouts within our cartService application.

</system_context>
```

**Name-less:**

Input:
```markdown
# module

Handles state transformations and coupon processing for active checkouts.
```

Output:
```markdown
<system_context type="MODULE">

Handles state transformations and coupon processing for active checkouts.

</system_context>
```

---

## Prompt Template

**Named:**
```
<system_context type="MODULE" name="{name}">

{body}

</system_context>
```

**Name-less:**
```
<system_context type="MODULE">

{body}

</system_context>
```
