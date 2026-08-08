# Introduction to HINT

## What is HINT?

HINT is a **context compiler for coding agents**. It answers one question:

> Given a task, a path, or both — what does this repository already know that matters for the work about to happen?

Every coding agent starts each session knowing nothing about your repository. Teams compensate by writing it down: a `CLAUDE.md`, an `AGENTS.md`, a wiki. Those files grow without bound, apply everywhere at once, and are loaded whole on every task. Most of what an agent reads is irrelevant to what it is about to touch, and the part that mattered was three hundred lines down.

HINT stores that knowledge in markdown-native `.hint` files next to the code they describe, versioned in git, and returns only the subset that applies to the path or intent you ask about.

```text
repository knowledge → .hint → scope + inheritance → retrieval → minimal relevant context → your agent
```

It is **agent-neutral**. Claude Code, Codex, OpenCode, Cline, a CI script, or a custom agent all consume the same output. HINT does not implement, plan, or replace an agent — it works underneath one.

## What belongs in a `.hint`

Durable knowledge that outlives a task and that future work would otherwise have to rediscover:

- architectural decisions, and the rationale that makes them extensible;
- invariants that code may not falsify;
- constraints, security rules, and operational hazards;
- subsystem responsibilities and boundaries;
- approaches that have been tried and do not work, and why;
- conventions the codebase does not make obvious;
- and, when useful, implementation contracts the code must satisfy.

Not session state, not task progress, not anything that stops being true when the work ends.

## Scope and inheritance

Knowledge is keyed to a path and inherited down the tree:

- **Folder knowledge** — `_.hint` applies to its folder and everything beneath it. The root `_.hint` is the project-wide baseline. This is the most common kind; a repository whose knowledge lives entirely in folder hints is a normal, fully supported setup.
- **Companion knowledge** — `<path>.hint` applies to the file at `<path>`. `src/auth/login.ts.hint` describes `src/auth/login.ts`. The target need not exist yet.

Asking about `src/auth/login.ts` returns its companion knowledge plus every folder `_.hint` above it, root-first. A rule recorded next to the payment subsystem governs the payment subsystem and does not pollute unrelated work — which is exactly what a single flat instruction file cannot do.

## The architecture: a small core, extensible vocabulary

HINT deliberately has **no built-in keywords**. The engine understands only structure:

- **Files** — companion hints, folder hints, and detached `.hint` stores.
- **Headings** — every markdown heading is a typed block. `# decision Gateway owns auth {#auth_boundary}` has a keyword (`decision`), a name, an optional stable id, and a body running to the next heading. Heading depth nests blocks into a tree.

What each keyword _means_ — and what text it renders to — is defined by **hintbooks**: installable packages of instruction templates, one flat folder of `<keyword>.md` files. A hintbook maps `decision`, `invariant`, `bad`, or `clause` to rendered blocks and ships the glossary that teaches an agent how to read them.

This split keeps the core honest and the vocabulary open:

- The engine never hard-codes what a `decision` is. Swap or extend the hintbook and the same `.hint` files render in a different dialect.
- Teams publish their own hintbooks (npm packages, git repositories, or plain folders) tuned to their stack — and the vocabulary need not be about code at all: [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) works from `party`, `clause`, and `obligation` blocks.
- Authoring one requires no programming. Instructions are markdown files with `{name}`-style placeholders. If you can write markdown, you can build the vocabulary for your profession.
- The official starting point is [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer).

## Retrieval

When you know the task but not where the knowledge lives, `hint search "<intent>"` ranks every `.hint` in the repository and returns the closest — with the path each one governs, so the result is directly actionable. It is deterministic, local, and offline: BM25F over the parsed knowledge, no model, no service, no network, and it reads nothing into your context.

## Contracts: an optional layer

When a `.hint` goes further and *declares* surfaces the code must contain — a `func`, an `entity`, an `error` — HINT can check them mechanically, with no model involved:

- `hint verify` — every declared surface present in the generated file? Exits non-zero if not.
- `hint lock` / `hint diff` — snapshot what was generated; report which blocks drifted since.

This is a specialization, not the main path. It applies only to companion `<file>.hint` specs, and a repository that never uses it gets the full value of everything above.

## Principles

- **Zero syntax friction** — a `.hint` file is pure markdown, readable by humans and agents alike, and reviewable in a normal diff.
- **Knowledge lives with the work** — companion and folder hints travel through the same reviews, branches, and history as the code.
- **Cost proportional to value** — output is proportional to how much applies. A path nothing applies to returns nothing, which is what makes asking cheap enough to do before every edit.
- **Deterministic** — the same knowledge and the same hintbook always produce the same output. No hidden prompt engineering.
- **Never a hollow success** — a command that matched nothing says so and exits non-zero. It never reports "up to date" or "verified" about a set it did not populate.
- **Agent-neutral** — `.hint` is the source of truth; tool-specific files carry only a short pointer to it.

## The toolchain

| Piece | What it is |
| ----- | ---------- |
| [`@openhint/cli`](../applications/cli/README.md) | The `hint` binary: returns scoped knowledge, searches it, manages projects and hintbooks. |
| [`@openhint/transpiler`](../packages/transpiler/README.md) | The library behind the CLI: resolve → parse → render, plus hintbook loading and the contract layer. |
| [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer) | The software-engineering vocabulary. |
| [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) | The legal vocabulary — drafting and revising documents. |

## Where to go next

- [Quick Start](02-quick-start.md) — record your first knowledge and query it in minutes.
- [Syntax](03-syntax.md) — the complete structural grammar of `.hint` files.
- [How It Works](04-how-it-works.md) — the resolve → parse → render pipeline in detail.
- [Hintbooks](05-hintbooks.md) — using, authoring, and distributing keyword vocabularies.
- [CLI Reference](06-cli.md) — every command and flag.
- [Migrating to 1.1](07-migration.md) — what changed and why.
