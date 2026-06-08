# `# example` — Few-Shot Syntax Examples

**Phase:** F — Guardrails, Few-Shots & Assurances  
**Aliases:** `# sample`, `# demo`

---

## Description

Provides a concrete example the model must use as a structural and stylistic template. The model is instructed to replicate the structure, naming conventions, and style exactly — not to use the example as inspiration for a variation.

---

## Explanation

Few-shot examples are one of the most reliable tools for controlling output shape. `# example` formalizes this: rather than hoping the model picks up on an inline example, HINT wraps it in a section that explicitly instructs the model to treat it as a binding template.

The optional `[name]` argument labels the example. When provided, it appears in the section header (`## [FEW-SHOT SYNTAX EXAMPLES: validCouponRequest]`), making it referenceable by name from other blocks. When absent, the header has no colon or name suffix.

Common uses:
- API request/response shapes
- SQL query patterns
- File naming conventions
- Error response envelopes
- Test structure patterns

---

## Example

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

**Name-less variant:** `## [FEW-SHOT SYNTAX EXAMPLES]` with no colon or name suffix.

---

## Prompt Template

**Named:**
```
## [FEW-SHOT SYNTAX EXAMPLES: {name}]

The following example demonstrates the required implementation pattern. Replicate this structure, naming conventions, and style exactly:

{body}
```

**Name-less:**
```
## [FEW-SHOT SYNTAX EXAMPLES]

The following example demonstrates the required implementation pattern. Replicate this structure, naming conventions, and style exactly:

{body}
```
