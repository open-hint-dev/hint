# `# entity` — Data Structure Schema

**Phase:** D — Object Schemas & Implementation Contracts  
**Aliases:** `# struct`, `# model`, `# schema`

---

## Description

Declares an authoritative data structure schema. The model must implement this structure with exact field names, types, and constraints — no additions, no omissions, no renames. The output section is labeled `### DATA STRUCT: Name` and the instructional prefix frames it as "the authoritative blueprint for this structure throughout the codebase."

---

## Explanation

`# entity` is the primary tool for locking down data shapes. The most common model failure on schema implementation is field drift: adding "helpful" fields, renaming a field to something that "reads better," or omitting a field that seems redundant. The instructional prefix names each of these failure modes explicitly and forbids them.

The section label (`### DATA STRUCT:`) follows the single-authoritative-phrasing principle: every time the model sees this prefix, it knows exactly what contract applies — no re-reading of surrounding context required.

Use `# entity` for any named data type the implementation must produce: database models, API request/response shapes, domain objects, event payloads, config structs.

---

## Example

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

## Prompt Template

```
### DATA STRUCT: {Name}

Implement the {Name} data model with this exact schema. Do not alter field names, change types, add undeclared fields, or omit any field listed here. This is the authoritative blueprint for this structure throughout the codebase.

{body}
```
