# `# ui` — User Interface Surface

**Phase:** D — Object Schemas & Implementation Contracts  
**Aliases:** `# screen`, `# view`, `# page`, `# component`  
**Sub-headers:** `## form`, `## block`, `## image`, `## table`

---

## Description

Declares a user interface surface and its sub-elements. The model must build exactly the declared elements — no extra components, fields, columns, or controls — and must not omit any. Each sub-header maps to its own `####` sub-section with a distinct instructional prefix matched to the element type.

---

## Explanation

`# ui` is the strongest "build exactly what is declared" directive in HINT. A stray field or column in a UI is an immediate, visible defect — unlike a stray helper function that might go unnoticed. The scope fence in the opening instruction ("do not add components, fields, columns, controls, or decorative elements that are not listed") reflects this.

Sub-headers may appear any number of times in any order. Each carries an optional name. When a sub-header carries no name, the colon and name suffix are omitted from the output (`#### FORM`, `#### TABLE`, etc.).

**Sub-header semantics:**
- **`## form`** — a form with fields and actions; the prefix emphasizes exact field count and wired actions
- **`## block`** — a visual/layout region; the prefix emphasizes structural fidelity
- **`## image`** — a specific image asset with source, alt text, and placement; the prefix forbids substitution
- **`## table`** — a data table; the prefix enforces exact column set, sorting, pagination, and empty-state

Any `{reference}` tokens in the body (e.g., `{executeLogin}`, `{PasswordResetScreen}`) are resolved by the compiler: curly braces stripped, name preserved.

---

## Sub-header Rendering Rules

| Sub-header | Output section | Instructional prefix |
|---|---|---|
| `## form name` | `#### FORM: name` | _"Render this form with exactly the fields and actions listed — no extra inputs, no omitted ones. Apply the stated validation rules and wire each action to its described behavior:"_ |
| `## block name` | `#### BLOCK: name` | _"Compose this visual region exactly as described. Do not introduce additional sections or rearrange the declared structure:"_ |
| `## image name` | `#### IMAGE: name` | _"Place this image as specified, honoring its source, alt text, and role in the layout. Do not substitute it or add imagery beyond what is declared:"_ |
| `## table name` | `#### TABLE: name` | _"Render this table with exactly the columns and data binding described. Implement the stated sorting, pagination, and empty-state behavior; do not add columns that are not listed:"_ |

---

## Example

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

---

## Prompt Template

**Named surface:**
```
### UI SURFACE: {Name}

Build this user interface surface exactly as specified. Implement only the elements declared below — do not add components, fields, columns, controls, or decorative elements that are not listed, and do not omit any that are. Match the structure, labels, validation, and behavior described for each element.

{body}

#### FORM: {name}

Render this form with exactly the fields and actions listed — no extra inputs, no omitted ones. Apply the stated validation rules and wire each action to its described behavior:

{form body}

#### BLOCK: {name}

Compose this visual region exactly as described. Do not introduce additional sections or rearrange the declared structure:

{block body}

#### IMAGE: {name}

Place this image as specified, honoring its source, alt text, and role in the layout. Do not substitute it or add imagery beyond what is declared:

{image body}

#### TABLE: {name}

Render this table with exactly the columns and data binding described. Implement the stated sorting, pagination, and empty-state behavior; do not add columns that are not listed:

{table body}
```

_(Name-less surface: `### UI SURFACE` with no colon or name. Name-less sub-headers: `#### FORM`, `#### TABLE`, etc.)_
