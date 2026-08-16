# HINT Quick Start Guide

Get up and running in less than five minutes: initialize a project, install a hintbook, record what your repository knows, and query it from any coding agent.

This walkthrough uses the [software-engineer hintbook](https://github.com/open-hint-dev/hintbook-software-engineer). The workflow is identical for any other profession — register the [lawyer hintbook](https://github.com/open-hint-dev/hintbook-lawyer) instead and the same steps apply to legal documents.

---

## 1. Install the CLI

```bash
npm install -g @openhint/cli
```

Or run it ad hoc with `npx @openhint/cli`.

## 2. Initialize the project

From your repository root:

```bash
hint config
```

**Creates `hint.yml`** (if missing) — it asks for a project name and description, and offers to register the default hintbook. `hint.yml` marks the project root; every path in a compilation is resolved against it.

Then install the bootstrap — a short block in `AGENTS.md` / `CLAUDE.md` telling your agent how to query HINT, plus each hintbook's tag glossary. `hint apply` writes it directly:

```bash
hint apply
```

The resulting `hint.yml` looks like this:

```yaml
name: my-project
description: What this project is about
books:
    - npm://@openhint/hintbook-software-engineer
```

## 3. Install a hintbook

If you skipped the default during `hint config`, or want additional vocabularies:

```bash
hint add @openhint/hintbook-software-engineer        # npm package
hint add https://github.com/acme/hintbooks-platform  # git: your org's shared platform standards
hint add file://hintbooks/team-conventions           # in-repo: your team's own vocabulary
```

Each installed book is fetched, validated (it must contain a `hintbook.json`), and registered in the `books` array of `hint.yml`. Run `hint apply` afterwards to refresh `AGENTS.md` / `CLAUDE.md` with the new vocabulary. See the [CLI Reference](06-cli.md) for details.

## 4. Record what the whole repository knows

A root-level `_.hint` holds the baseline every folder and file inherits — the stack, the pipeline, the rules that hold everywhere:

```markdown
A REST API for invoice management.

# lang TypeScript

Node.js 22, ES modules, strict TypeScript. No CommonJS.

# build

- `npm run build` to compile
- `npm test` to run the vitest suites

# bad GlobalState

Never store request state in module-level variables. The API runs multi-tenant
behind a shared worker pool; module state leaks across requests.
```

Every heading is `# keyword Name` — the vocabulary (`lang`, `build`, `bad`, `decision`, `invariant`, …) comes from your installed hintbook. Run `hint author` to see it. This is the most common kind of `.hint`, and many repositories never write any other.

## 5. Scope knowledge to a subsystem

A folder's `_.hint` applies to that folder and everything beneath it, so a rule about billing governs billing and nothing else:

```markdown
# decision Money is stored as integer minor units {#money_repr}

Every persisted amount is an integer count of the smallest currency unit, with
the currency alongside it. Rationale: decimal strings drifted across three
services before this. Consequence: format at the boundary, never in the domain.

# invariant Invoice totals are derived, never stored

`Invoice.total` is always recomputed from line items. A stored total is a bug —
it has silently disagreed with its lines twice.
```

## 6. Add file-level contracts where they earn it

A `.hint` next to a source file applies to that file, and can *declare* what the code must contain. `src/billing/invoice.ts.hint` describes `src/billing/invoice.ts` — whether or not the target exists yet:

```markdown
Invoice domain model and validation.

# entity Invoice {#invoice}

The persisted invoice record.

## field id

UUID v7, generated at creation.

## field total

Decimal string with two fraction digits. Never use floating point.

# func validateInvoice

Validates an Invoice before persisting.

## arg invoice

The Invoice to validate.

## result

Returns the validated Invoice; throws ValidationError on the first violated rule.
```

Heading depth nests blocks: the `field` blocks belong to the `entity`, the `arg`/`result` blocks to the `func`. Declared surfaces like these are what [`hint verify`](#8-optional-contracts) can check mechanically.

## 7. Query it

```bash
hint src/billing/invoice.ts          # one file (its companion resolves automatically)
hint src/billing                     # that folder's own knowledge
hint 'src/billing/**'                # everything beneath it
```

stdout carries the applicable knowledge — the file's own, wrapped in its folder chain so inheritance is explicit — and nothing else. No persona, no workflow instructions, no reporting format, so the cost is proportional to how much applies. Knowledge of referenced files (`# read` targets) comes along automatically with shared context emitted once; `--no-refs` opts out.

stderr carries the verdict, first line first:

```
hint: no spec of its own for src/billing/rounding.ts; returning inherited context from src/billing/_.hint.
```

Exit `0` succeeded, `1` a check failed, `2` nothing you asked for matched. Inheriting is a success — most paths have no `.hint` of their own.

When you know the task but not the path:

```bash
hint search "how are money amounts stored"
```

### Piping to a fresh agent

Mid-session you want the knowledge alone. For an agent starting cold with no other instructions, `--prompt` wraps it in a full implementation prompt:

```bash
hint --prompt src/billing/invoice.ts | claude -p
```

### Validating in CI

`--strict` fails when a named path has no spec of its own, instead of returning inherited context:

```bash
hint --strict 'src/**/*.hint'
```

### Keeping it honest

Knowledge goes stale quietly. When the code under the hint governing a path has moved a long way since that hint was last committed, stderr says so on the read itself:

```
hint: 9 of 11 files under src/billing changed since src/billing/_.hint was last updated, and it records knowledge — re-check it against the code and update it if it no longer holds.
```

It is an observation, not a failure — the output and exit code are unchanged. For the whole repository at once, including specs whose target was deleted:

```bash
hint status                 # what has come loose
hint status --exit-code     # exit 1 on findings, for CI
```

## 8. Optional: contracts

For companion specs that declare surfaces, HINT can check them mechanically — no model involved. Skip this section entirely if your repository only records knowledge; everything above works without it.

```bash
hint verify src/billing/invoice.ts          # deterministic, token-free: every declared surface present?
hint lock src/billing/invoice.ts            # mark the target as generated
hint --prompt src/billing/invoice.ts        # a no-op while the spec is unchanged (skipped)
hint diff src/billing/invoice.ts            # after an edit: lists exactly which blocks drifted
hint --prompt src/billing/invoice.ts        # now carries that drift list; the fix is scoped to those blocks
```

The freshness gate is on **generation only**. A plain `hint src/billing/invoice.ts` always returns everything that applies, however fresh the lock — a read is a question about what the repository knows, and it must not be answered with silence just because the code is stable.

`hint verify` reads the generated file and checks that every declared surface (each `func`, `entity`, `error`…) appears in it — catching a stubbed or forgotten declaration for zero tokens, before you lock. Compose the two with `hint verify <path> && hint lock <path>`.

A locked spec recompiles the moment its content (or inherited folder/root context) or its target file changes — editing the generated code underneath an unchanged spec counts as drift too; `--force` recompiles regardless. See the [CLI reference](06-cli.md#hint-verify-paths--structurally-check-generated-output) for `hint verify`, `hint lock`, and `hint diff`.

## 9. Optional: let the spec produce the file

Steps 1–8 keep the spec and the code as two things that must agree. The last rung removes the duplication: for the part of a file that is machine-derivable, the spec *is* the source and the file is generated from it. This needs an emit pack — a hintbook that ships templates for a target language — and nothing above changes if you never install one.

With the software-engineer hintbook's TypeScript pack registered, the spec from step 6 produces its file:

```bash
hint emit src/billing/invoice.ts
```

```ts
// hint:begin — generated from src/billing/invoice.ts.hint. Edits between the markers are replaced; write inside a hole, or outside hint:end.
// Needs importing above this region — this project decides from where:
//   ValidationError

// The persisted invoice record.
export interface Invoice {
    // UUID v7, generated at creation.
    id: string;
    // Decimal string with two fraction digits. Never use floating point.
    total: string;
}

// Validates an Invoice before persisting.
export function validateInvoice(invoice: Invoice): Invoice {
    // Honor:
    //   decision Money is stored as integer minor units
    // hint:hole(#validate:body) spec=44cc996a — your code; kept across re-emits.
    throw new Error("Not implemented.");
    // hint:end of hole.
}
// hint:end — everything below is yours; put helpers here.
```

The file has three zones and both boundaries say which is which. Above the region: your imports. Inside it: what the spec owns, replaced on every run — except the **holes**, which are the parts a template provably cannot fill. Write the implementation inside the hole and it survives every re-emission, with the constraints that govern it printed right above it. Below `hint:end`: helpers, and anything else that is yours.

Change the spec, run `hint emit` again, and the declarations move while the bodies stay. If a body was written against a version of the spec that has since changed, the run says so by name. If the block that owned a body is gone, the write is **refused** rather than losing the work.

```bash
hint emit --check    # CI: every generated file still equals what its spec produces
```

Two things worth knowing before you reach for this: a folder `_.hint` never emits — only a companion `<file>.hint` has a single output — and `hint emit` will not append a region to a file somebody already wrote by hand. Both are covered in [Emit](08-emit.md), along with `hint extract` for drafting specs from code that already exists.

## Where to go next

- [Syntax](03-syntax.md) — folder hints, ids, includes, and the full structural grammar.
- [Hintbooks](05-hintbooks.md) — what your keywords render into, and how to write your own vocabulary.
- [CLI Reference](06-cli.md) — every command, flag, and exit code.
- [Emit](08-emit.md) — the three rungs, writing an emit pack, and drafting specs from existing code.
