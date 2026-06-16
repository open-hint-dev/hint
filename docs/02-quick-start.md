# HINT Quick Start Guide

Get up and running with HINT in less than five minutes: initialize a project, install a hintbook, write your first specs, and compile a prompt for your AI agent.

This walkthrough builds software with the [software-engineer hintbook](https://github.com/open-hint-dev/hintbook-software-engineer). The workflow is identical for any other profession — register the [lawyer hintbook](https://github.com/open-hint-dev/hintbook-lawyer) instead and the same steps draft contracts rather than code.

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

Then set up your agent context files with `hint instruct`, which prints an AI agent prompt to stdout that instructs an agent to add the HINT workflow instructions (and each hintbook's system glossary) to your `AGENTS.md` and `CLAUDE.md`. The command never edits those files itself — pipe the output to your agent to apply it:

```bash
hint instruct | claude -p
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

Each installed book is fetched, validated (it must contain a `hintbook.json`), and registered in the `books` array of `hint.yml`. Run `hint instruct | claude -p` afterwards to refresh `AGENTS.md` / `CLAUDE.md` with the new vocabulary. See the [CLI Reference](06-cli.md) for details.

## 4. Write the root baseline

A root-level `_.hint` holds the global context every sub-directory and companion file inherits — the stack, the build pipeline, the dependency policy:

```markdown
A REST API for invoice management.

# lang TypeScript

Node.js 22, ES modules, strict TypeScript. No CommonJS.

# build

- `npm run build` to compile
- `npm test` to run the vitest suites

# bad GlobalState

Never store request state in module-level variables.
```

Every heading is `# keyword Name` — the keyword vocabulary (`lang`, `build`, `bad`, …) comes from your installed hintbook.

## 5. Write a companion spec

A `.hint` file next to a source file defines that file. `src/billing/invoice.ts.hint` defines `src/billing/invoice.ts` — whether or not the target exists yet:

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

Heading depth nests blocks: the `field` blocks belong to the `entity`, the `arg`/`result` blocks to the `func`.

## 6. Compile

```bash
hint src/billing/invoice.ts          # one file (companion resolved automatically)
hint src/billing                     # a folder
hint 'src/**/*.hint'                 # globs
```

The compiled prompt goes to stdout: a mode header (the agent's role), your specs rendered through the hintbook's templates — each file wrapped in its folder chain so context inheritance is explicit — and a closing checklist footer. Pipe it straight to an agent:

```bash
hint src/billing/invoice.ts | claude -p
```

### Modes

The default mode compiles an **implementation** prompt. Hintbooks can define others — the software-engineer book ships `fix` and `review`:

```bash
hint --mode fix src/billing/invoice.ts      # repair code that violates the spec
hint --mode review src/billing/invoice.ts   # audit code against the spec, report findings
```

### Validating specs

`--dry-run` makes compilation fail loudly on hint files that cannot be resolved instead of silently skipping them:

```bash
hint --dry-run 'src/**/*.hint'
```

## Where to go next

- [Syntax](03-syntax.md) — folder hints, ids, includes, and the full structural grammar.
- [Hintbooks](05-hintbooks.md) — what your keywords compile into, and how to write your own vocabulary.
