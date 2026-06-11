# HINT Syntax Specification

HINT files are 100% valid Markdown. They can be read by any standard editor, giving you native syntax highlighting, markdown preview, and code folding out of the box.

The grammar below is everything the transpiler itself defines. Deliberately, **keywords are not part of it** — what `entity` or `flow` means is supplied by the hintbook(s) registered in `hint.yml` (see [Hintbooks](05-hintbooks.md)). The core only understands files, headings, bodies, ids, and includes.

---

## Project layout

A HINT project is marked by a `hint.yml` (or `hint.yaml`) at its root:

```yaml
name: my-project
description: What this project is about
books:
    - npm://@openhint/hintbooks-software-engineer
    - file://hintbooks/team-conventions
```

| Field | Meaning |
| --- | --- |
| `name`, `description` | Project identity, available to tooling. |
| `books` | Hintbooks providing the keyword vocabulary. `file://` paths resolve relative to the project root; `npm://` names resolve through local then global `node_modules`. |
| `ignore` | Reserved for path exclusion patterns. |

Two kinds of specification files live in the tree:

- **Folder hints** — a file named `_.hint` declares context for its folder and everything beneath it. The root `_.hint` is the global baseline.
- **Companion hints** — `<path>.hint` declares the file at `<path>`: `src/auth/login.ts.hint` defines `src/auth/login.ts`, `contracts/nda.md.hint` defines `contracts/nda.md`. The target file does not need to exist yet; the spec is keyed to the path, not to its presence on disk.

When compiling, every requested hint is wrapped in its full folder chain down from the project root, so folder context visibly encloses file context in the output. Folders without an `_.hint` still appear in the chain — with empty context.

## Path resolution

Arguments passed to `hint` are resolved against the project root:

| You pass | Compiles |
| --- | --- |
| `src/login.ts.hint` | that hint file |
| `src/login.ts` | `src/login.ts.hint` (companion lookup) |
| `src` (a folder) | `src/_.hint` |
| `src/**/*.hint` | every glob match |

Paths outside the project root are ignored. Hints that do not exist are skipped silently — or fail the compilation when `--dry-run` is set.

## Heading blocks

Every markdown heading opens a typed block:

```markdown
# entity PaymentData {#payment_data}

this entity describes the payment data contract
```

A heading has three parts:

- **Keyword** — the first word (`entity`). Matched against the instruction names and synonyms of your hintbooks; case matters, so write keywords the way the hintbook declares them.
- **Name** — everything after the first word (`PaymentData`). May be empty.
- **Id** — an optional `{#stable_id}` suffix. Ids give blocks a stable handle that survives renames; hintbook templates typically render them as `id="..."` attributes so other blocks and agents can reference them.

### Body

A block's body is everything between its heading and the next heading of **any** level — plain markdown: paragraphs, lists, code fences, tables, emphasis. The body is passed to the keyword's template verbatim (re-serialized as markdown).

### Nesting

Heading depth builds the tree. A deeper heading becomes a child of the nearest shallower one:

```markdown
# entity Invoice            ← level 1
## field total              ← child of Invoice
### rule precision          ← child of total
## field currency           ← child of Invoice
# func validateInvoice      ← sibling of Invoice
```

There is no fixed meaning to any level — `##` under an `entity` is whatever your hintbook says it is. Content before the first heading of a file is the file's own preamble context.

## Includes

A paragraph consisting of a single `@include` directive inlines another file at compile time:

```markdown
@include "../shared/error-policy.md"
```

- The path resolves relative to the folder of the hint file being compiled.
- `.md` / `.mdx` files are parsed and merged as markdown — their content becomes part of the surrounding body. Includes may nest.
- Any other file type is embedded as a fenced code block tagged with its extension — useful for inlining real schemas or configs.

Use includes for shared fragments that multiple specs must state identically.

## Unknown keywords

A heading whose keyword no registered hintbook recognizes is not an error: its body and children pass through to the output as plain markdown. This keeps specs forward-compatible — but prefer declared vocabulary, since only it carries the binding template language the agent is trained on by the system glossary.

## A complete example

```markdown
Payment module specification.

# entity PaymentData {#payment_data}

this entity describes the payment data contract

## field timestamp {#payment_timestamp}

unix epoch milliseconds

### rule precision

store with millisecond precision

## field amount

decimal string, two fraction digits

# action validatePayment {#validate_payment}

validate the payment fields before persisting

@include "../shared/context.md"
```
