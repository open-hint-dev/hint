# Introduction to HINT

## What is HINT?

HINT is **Spec-as-Source for any repository**. The spec is the artifact you maintain; the implementation answers to it. It exists to answer one question:

> Given a task, a path, or both — what does this repository's spec say about the work about to happen?

The intent lives in markdown-native `.hint` files next to what they govern, versioned in git, inherited from the project root down. Ask about a path or a task and HINT returns only the part that applies.

```text
spec (.hint) → scope + inheritance → retrieval → the governing intent → whoever does the work
                     ↑                                                          │
                     └──────────── drift reported back ─────────────────────────┘
```

It is **agent-neutral**. Claude Code, Codex, OpenCode, Cline, a CI script, or a custom agent all consume the same output. HINT does not implement, plan, or replace an agent — it works underneath one.

## Spec-as-Source, without the generator

**Spec-as-Source** is the position that the specification — not the code — is the artifact you maintain and the authority the work answers to. It is the far end of the spec-driven spectrum: `spec-first` writes a spec and discards it, `spec-anchored` keeps it alive in CI, `spec-as-source` makes it *the* source.

The usual formulation attaches a second clause: *and the code is regenerated from the spec.* That clause is what has kept the idea impractical. Generation from a language model is non-deterministic, so every upgrade is a re-roll, every hand edit fights the generator, and drift and hallucination return through the door built for them.

**HINT drops the generator, not the source of truth.** The `.hint` files hold the intent. Humans and agents write the implementation. The two stay coupled through two mechanisms that involve no model at all:

- **Retrieval before the work.** `hint <path>` returns the part of the spec that governs that path and nothing else, cheaply enough to run before every edit.
- **Drift detection after it.** `hint status`, and an advisory line on every read, say when the implementation has moved away from the spec that governs it — while the correction is still cheap. See [Keeping it current](#keeping-it-current).

Deterministic end to end: no model call, no network, no vendor.

Where a spec describes something machine-derivable, **`hint emit` closes the loop**: it renders the artifact the spec produces — types, schemas, error enums, a contract document — through templates the hintbook supplies, and `hint emit --check` lets CI assert that what is committed still equals what the spec produces. Code outside the generated region and any hand-written implementation are preserved, so regeneration is safe to re-run. See [Emit](08-emit.md). This is optional too: a repository that only records knowledge never installs an emitter.

## Why it does not have to be about code

The engine has **no built-in keywords**. It understands files, headings, nesting, and inheritance; what a `decision`, an `invariant`, a `clause`, or an `obligation` *means* comes from an installed **hintbook**. Every other tool in this category compiles its vocabulary in, which is why every one of them is about software.

Swap the hintbook and the same machinery specifies a different profession — [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) works from `party`, `clause`, `obligation`, `right`, and `redline`, over a law firm's matters instead of a codebase. Nothing in the engine changes. Authoring a hintbook takes no programming — see [Hintbooks](05-hintbooks.md).

Read "code" below as "whatever this repository holds"; the software vocabulary is the default, not a constraint.

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

## When HINT is the right tool

It pays off where the cost is recurring:

- **The same facts get re-explained every session.** Why this service does not call that database; which retry is forbidden and why. Someone already knew — it was just never written where an agent would find it.
- **Conventions differ by subsystem.** Strict typing here, a legacy exception there; one wire format in the gateway, another at the edge. A single global instruction file handles this badly: it either states the rule too broadly or omits it.
- **The knowledge has a reason attached.** A bare rule gets overturned the first time it is inconvenient. A decision with its rationale tells the next reader whether a new situation is still covered.
- **More than one agent, or an expectation of switching.** `.hint` is repository-owned and outlives the tool that reads it.
- **Somebody is going to regenerate this.** When a spec declares surfaces the code must contain, the contract layer can verify them mechanically.

It does not pay off, and you should say so plainly, when:

- the repository is small enough that one person holds it in their head;
- the facts are already obvious from the code — restating them is duplication that will drift;
- the "knowledge" is really task state: what is in progress, what to do next, what was just tried.

HINT stores what stays true. If a note stops being true when the task ends, it does not belong in a `.hint`.

## Scope and inheritance

Knowledge is keyed to a path and inherited down the tree:

- **Folder knowledge** — `_.hint` applies to its folder and everything beneath it. The root `_.hint` is the project-wide baseline. This is the most common kind; a repository whose knowledge lives entirely in folder hints is a normal, fully supported setup.
- **Companion knowledge** — `<path>.hint` applies to the file at `<path>`. `src/auth/login.ts.hint` describes `src/auth/login.ts`. The target need not exist yet.

Asking about `src/auth/login.ts` returns its companion knowledge plus every folder `_.hint` above it, root-first. A rule recorded next to the payment subsystem governs the payment subsystem and does not pollute unrelated work — which is exactly what a single flat instruction file cannot do.

## The architecture: a small core, extensible vocabulary

The engine understands only structure:

- **Files** — companion hints, folder hints, and detached `.hint` stores.
- **Headings** — every markdown heading is a typed block. `# decision Gateway owns auth {#auth_boundary}` has a keyword (`decision`), a name, an optional stable id, and a body running to the next heading. Heading depth nests blocks into a tree.

What each keyword _means_ — and what text it renders to — is defined by **hintbooks**: installable packages of instruction templates, one flat folder of `<keyword>.md` files. A hintbook maps `decision`, `invariant`, `bad`, or `clause` to rendered blocks and ships the glossary that teaches an agent how to read them.

This split keeps the core honest and the vocabulary open:

- The engine never hard-codes what a `decision` is. Swap or extend the hintbook and the same `.hint` files render in a different dialect.
- Teams publish their own hintbooks (npm packages, git repositories, or plain folders) tuned to their stack — or to their profession, as [described above](#why-it-does-not-have-to-be-about-code).
- Authoring one requires no programming. Instructions are markdown files with `{name}`-style placeholders. If you can write markdown, you can build the vocabulary for your profession.
- The official starting point is [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer).

## Retrieval

When you know the task but not where the knowledge lives, `hint search "<intent>"` ranks every `.hint` in the repository and returns the closest — with the path each one governs, so the result is directly actionable. It is deterministic, local, and offline: BM25F over the parsed knowledge, no model, no service, no network, and it reads nothing into your context.

## Contracts: an optional layer

When a `.hint` goes further and *declares* surfaces the code must contain — a `func`, an `entity`, an `error` — HINT can check them mechanically, with no model involved:

- `hint verify` — every declared surface present in the generated file? Exits non-zero if not.
- `hint lock` / `hint diff` — snapshot what was generated; report which blocks drifted since.

This is a specialization, not the main path. It applies only to companion `<file>.hint` specs, and a repository that never uses it gets the full value of everything above.

## Keeping it current

Recorded knowledge decays, and it decays quietly: an agent finishes a task and does not come back to update the spec, a file is renamed and its `.hint` is left behind, a block that restated a signature is now describing code that no longer exists. Nothing fails; the knowledge just gets less true, and the next reader is misled with the authority of a spec behind it.

HINT does not try to fix this by asking harder. Anything that depends on remembering a step *after* the work is done gets skipped. Instead:

- **The signal rides the read.** `hint <path>` is already run before an edit, so that is where staleness is reported: when the code under the governing hint has moved substantially since that hint was last committed, stderr says so. Advisory only — it never changes the output or the exit code. The correction is cheapest in the change you are already making.
- **The measure is git, and it is scope-relative** — the share of a scope's files that changed since the hint's last commit — so it means the same thing for a one-file companion spec and for the repository root.
- **The threshold depends on what the knowledge is.** A spec that *declares surfaces* restates the shape of the code and goes wrong as soon as the code moves. A `decision` or an `invariant` explains *why* the code is the way it is, and survives refactoring. Holding both to one bar would either miss the first or nag about the second until the signal is ignored.
- **[`hint status`](06-cli.md#hint-status--what-has-come-loose) is the inventory pass** — the whole repository at once: knowledge the code has moved away from, specs whose target was deleted, drift against `hint.lock`. Run it in CI with `--exit-code`, or at the start of a session.

The authoring guidance follows from the same observation. Knowledge that *explains* keeps; knowledge that *restates* the code is a copy that begins drifting immediately. Quoting the contents of another file into a spec is the worst case of it — a snapshot that goes stale silently. Reference the path and state the constraint instead.

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
- [Emit](08-emit.md) — producing artifacts from specs, and authoring an emitter.
- [Migrating to 1.1](07-migration.md) — what changed and why.
