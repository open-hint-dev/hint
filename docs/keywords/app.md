# `# app` — Application Scope Declaration

**Phase:** B — Architectural Scoping  
**Aliases:** `# application`  
**Related:** [`# lib`](lib.md), [`# module`](module.md), [`# namespace`](namespace.md)

---

## Description

Declares the compilation unit as a standalone deployable application — a service, CLI, server, or any top-level runnable. Wraps the body in a `<system_context type="APP">` XML block that creates a hard semantic boundary the model treats as the authoritative description of what it is building.

The optional `[name]` argument becomes the `name` attribute on the XML tag. When no name is provided, the `name` attribute is omitted entirely.

---

## Explanation

XML context wrappers (`<system_context>`) create hard semantic boundaries that the model treats as isolated instruction regions. LLMs are trained on XML-structured data and process these boundaries reliably — the model understands that the text inside the tag is the authoritative description of the scope it is implementing.

Use `# app` when the compilation unit is a deployable artifact: an HTTP server, a CLI tool, a background worker, a desktop application. For a reusable package use [`# lib`](lib.md); for a bounded subsystem within a larger app use [`# module`](module.md); for a named code boundary with explicit cross-namespace isolation use [`# namespace`](namespace.md).

Any `{reference}` tokens inside the body are resolved by the compiler: `{cartService}` becomes `cartService` in the output (curly braces stripped, name preserved).

---

## Example

**Named:**

Input:
```markdown
# app CartService

The Cart Service manages transient user shopping baskets and coordinates checkout sequencing.
```

Output:
```markdown
<system_context type="APP" name="CartService">

The Cart Service manages transient user shopping baskets and coordinates checkout sequencing.

</system_context>
```

**Name-less:**

Input:
```markdown
# app

The Cart Service manages transient user shopping baskets.
```

Output:
```markdown
<system_context type="APP">

The Cart Service manages transient user shopping baskets.

</system_context>
```

---

## Prompt Template

**Named:**
```
<system_context type="APP" name="{name}">

{body}

</system_context>
```

**Name-less:**
```
<system_context type="APP">

{body}

</system_context>
```
