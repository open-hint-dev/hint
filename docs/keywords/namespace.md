# `# namespace` — Named Code Boundary

**Phase:** B — Architectural Scoping  
**Aliases:** `# ns`, `# package`  
**Related:** [`# app`](app.md), [`# lib`](lib.md), [`# module`](module.md) — same XML wrapper format, without the namespacing instruction.

---

## Description

Declares a named code boundary that maps directly to the target language's namespacing construct (package, namespace, or module path). Unlike `# module`, which scopes a conceptual subsystem, `# namespace` is a structural boundary: the compiler instructs the model to emit all code under the named qualified name, keep cross-namespace references explicit, and not leak symbols across the boundary.

---

## Explanation

`# namespace` uses the same `<system_context>` XML wrapper as `# app`, `# lib`, and `# module`, but the compiler injects an extra instruction into the body: the model must place all generated code under the target language's namespacing construct with the declared name as the qualified name and import root.

The critical addition is the cross-namespace isolation instruction: "Keep cross-namespace references explicit and do not leak symbols across this boundary." This prevents the model from casually importing types or functions from sibling namespaces without explicit qualification, which is the most common way namespace boundaries erode in generated code.

Any `{reference}` tokens in the body are resolved by the compiler (curly braces stripped, name preserved).

**When to use `# namespace` over `# module`:**
- Use `# namespace` when the code boundary maps to a real language-level namespace, package path, or module path that the model must emit in imports and declarations.
- Use `# module` when the boundary is conceptual/architectural but does not correspond to a language namespacing construct (e.g., a feature slice within a monolith that shares a top-level package).

---

## Example

**Input:**

```markdown
# namespace billing

Everything under this namespace handles invoicing and payment capture. Code here may reference {payments} but nothing under it may be imported by the {catalog} namespace.
```

**Output:**

```markdown
<system_context type="NAMESPACE" name="billing">

All code in this scope belongs to the `billing` namespace — emit it under the target language's namespacing construct (package, namespace, or module path) with this as the qualified name and import root. Everything here handles invoicing and payment capture. Code here may reference payments; nothing under it may be imported by the catalog namespace. Keep cross-namespace references explicit and do not leak symbols across this boundary.

</system_context>
```

**Name-less variant** (uncommon — a namespace without a name is unusual but valid):

```markdown
<system_context type="NAMESPACE">

All code in this scope belongs to a dedicated namespace — emit it under the target language's namespacing construct with this as the import root. {body} Keep cross-namespace references explicit and do not leak symbols across this boundary.

</system_context>
```

---

## Prompt Template

**Named:**
```
<system_context type="NAMESPACE" name="{name}">

All code in this scope belongs to the `{name}` namespace — emit it under the target language's namespacing construct (package, namespace, or module path) with this as the qualified name and import root. {body} Keep cross-namespace references explicit and do not leak symbols across this boundary.

</system_context>
```

**Name-less:**
```
<system_context type="NAMESPACE">

All code in this scope belongs to a dedicated namespace — emit it under the target language's namespacing construct with this as the import root. {body} Keep cross-namespace references explicit and do not leak symbols across this boundary.

</system_context>
```
