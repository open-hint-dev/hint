<p align="center">
  <img src="sites/openhint.dev/assets/logo-full.png" alt="HINT" width="491">
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.4-black">
  <img alt="paradigm" src="https://img.shields.io/badge/paradigm-Spec%E2%80%91as%E2%80%91Source-6e40c9">
  <img alt="format" src="https://img.shields.io/badge/format-Markdown%E2%80%91native-blue">
  <img alt="agents" src="https://img.shields.io/badge/agents-neutral-0aa">
  <img alt="domains" src="https://img.shields.io/badge/domains-code%20%C2%B7%20law%20%C2%B7%20knowledge-e8590c">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green">
</p>

<h1 align="center">
  HINT — Spec-as-Source for any repository
</h1>

> **The spec is the source. Your code answers to it.**

The intent — decisions, invariants, constraints, obligations, hazards — lives in `.hint` files next to what they govern, versioned in git. That is the artifact you maintain. Ask HINT about a path or a task and it returns the part of the spec that governs it, and tells you when the work has drifted away from it.

```text
spec (.hint) → scope + inheritance → retrieval → the governing intent → whoever does the work
                     ↑                                                          │
                     └──────────── drift reported back ─────────────────────────┘
```

Works underneath Claude Code, Codex, OpenCode, Cline, or anything that can run a command. **And it is not only about code** — the vocabulary is installed, not compiled in, so the same machinery specifies a law firm's matters. [See below](#beyond-code).

**Two ways to read this page:** [**For humans**](#for-humans) — what it is and how to adopt it. [**For coding agents**](#for-coding-agents) — an operational briefing, if you are an LLM that landed in this repo.

---

# For humans

## Spec-as-Source, without the model in the loop

**Spec-as-Source** is the position that the specification — not the code — is the artifact you maintain and the authority the work answers to. It is the far end of the spec-driven spectrum: `spec-first` writes a spec and throws it away, `spec-anchored` keeps it alive in CI, `spec-as-source` makes it *the* source.

The usual formulation attaches a second clause: *and the code is regenerated from the spec by a model.* That clause is what has kept the idea impractical. Model output is non-deterministic, so every regeneration is a re-roll, every hand edit fights the generator, and drift and hallucination return through the door built for them.

**HINT drops the model, not the source of truth.** The `.hint` files hold the intent. Three mechanisms keep the intent and the work coupled, and not one of them calls a model:

- **Retrieval before the work.** `hint <path>` returns the part of the spec that governs that path and nothing else, cheaply enough to run before every edit.
- **Emission where the spec is derivable.** `hint emit` renders the part of an artifact a spec fully determines — types, schemas, error enums, a contract document — through templates the hintbook supplies. Same spec, same templates, byte-identical output, reviewable in a normal diff. What no template can derive becomes a **hole**, carrying the constraints it must honor; your implementation survives every re-emit, and when the block that owned one is deleted the write is refused rather than losing it. `hint emit --check` gates it in CI.
- **Drift detection after it.** `hint status`, and an advisory line on every read, say when the implementation has moved away from the spec that governs it — while the correction is still cheap.

Both ends are optional. A repository that only records knowledge installs no emit pack and never generates anything; one that emits still writes by hand everything a template cannot derive. Deterministic throughout: no model call, no network, no vendor.

## The problem

Every coding agent starts each session knowing nothing about your repository. So teams write it down — a `CLAUDE.md`, an `AGENTS.md`, a wiki nobody reads. Those files grow without bound, apply everywhere at once, and get loaded whole on every task. Most of what the agent reads is irrelevant to what it is about to touch, and the part that mattered was three hundred lines down.

The knowledge isn't wrong. The **scoping** is: one file for a whole repository is the wrong shape.

## What HINT does

`packages/gateway/auth/_.hint` — knowledge recorded where the code lives:

```markdown
# decision Gateway owns external authentication {#auth_boundary}

All external auth terminates at the gateway; downstream services trust its signed
context header and never re-authenticate. Rationale: one place to rotate keys and
audit access. Consequence: a service needing identity reads the header — it does
not call the identity database.

# invariant Token verification goes through TokenVerifier {#token_path}

Every path that accepts a bearer token calls `TokenVerifier.verify`. No handler
parses or trusts a token itself, including in tests.

# bad Direct identity DB access from the gateway

The gateway has no credentials for the identity database and must never acquire
them. If you need a field it holds, extend the signed context header instead.
```

Ask what applies before touching a file:

```console
$ hint packages/gateway/auth/token.go
<folder_context path=".">
  <critical_system_mandates name="FailClosed">Security-sensitive operations fail closed.</critical_system_mandates>
  <folder_context path="packages/gateway/auth">
    <architectural_decision name="Gateway owns external authentication" id="auth_boundary">…</architectural_decision>
    <system_invariant name="Token verification goes through TokenVerifier" id="token_path">…</system_invariant>
    <prohibited_anti_patterns name="Direct identity DB access from the gateway">…</prohibited_anti_patterns>
  </folder_context>
</folder_context>
```

That is the entire output — the applicable knowledge, inherited root-first, and a note on stderr saying where it came from. No persona, no workflow instructions, no reporting format. **A path nothing applies to returns nothing**, which is what makes asking cheap enough to do before every edit.

When you know the task but not the path:

```console
$ hint search "service account authentication"
{
  "query": "service account authentication",
  "count": 2,
  "results": [
    { "hint": "packages/gateway/auth/_.hint", "target": "packages/gateway/auth", "score": 6.12, "weak": false },
    { "hint": "packages/identity/_.hint", "target": "packages/identity", "score": 1.84, "weak": true }
  ]
}
```

Offline, deterministic, no model call, nothing read into context. `weak` flags a hit that matched under half your query terms — advisory, never hidden.

## Beyond code

Every other tool in this category has its vocabulary compiled in, which is why every one of them is about software. HINT's engine knows **no keywords at all** — it understands files, headings, nesting, and inheritance. What a `decision`, an `invariant`, a `clause`, or an `obligation` *means* comes from a **hintbook**: a flat folder of Markdown templates you install like a dependency.

Swap the hintbook and the same machinery specifies a different profession.

| | A software repository | A law firm's matter repository |
| --- | --- | --- |
| Hintbook | [`hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer) | [`hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) |
| Vocabulary | `decision` `invariant` `func` `entity` `rule` `bad` | `party` `clause` `obligation` `right` `exception` `redline` |
| A scope | `src/billing/_.hint` governs the billing subsystem | `clients/acme/nda/_.hint` governs that matter |
| What the worker gets before touching it | the constraints that apply to this file | the constraints that apply to this document |
| What drift means | the code moved away from the spec | the document moved away from the position |

Nothing in the engine changes between those two columns. Authoring a hintbook takes no programming — it is Markdown files with `{name}`-style placeholders — so a profession that can write down its own rules can have a vocabulary for them.

Working example: [demo-pearson-specter-litt](https://github.com/open-hint-dev/demo-pearson-specter-litt), a law firm's matters specified in `.hint`. Guide → [`docs/05-hintbooks.md`](docs/05-hintbooks.md).

For a persistent team wiki, install [`@openhint/hintbook-librarian`](https://github.com/open-hint/hintbook-librarian): immutable sources under `raw/`, typed and interlinked topics under `wiki/`, scoped query, and deterministic graph lint. Guide → [`docs/09-knowledge-repos.md`](docs/09-knowledge-repos.md).

## Where HINT sits

Spec-driven development went mainstream in 2026 and every major vendor shipped a flavor — GitHub Spec Kit, AWS Kiro, Tessl, BMAD, OpenSpec, Google Antigravity. They are solving a real problem, and they are solving it a particular way:

| | Spec Kit · Kiro · Tessl · … | HINT |
| --- | --- | --- |
| **Unit of spec** | one central folder, per feature (`.specify/specs/<feature>/`, `.kiro/specs/<feature>/`) | per path, inherited root → folder → file |
| **Contents** | requirements + design + a `tasks.md` with statuses | durable intent only — never task state |
| **Lifetime** | the feature | the repository |
| **Coupling to the work** | regeneration | retrieval before, drift detection after |
| **Ownership** | the vendor's ecosystem and, sometimes, its billing perimeter | your repository, in git, agent-neutral |
| **Domain** | software | any — the vocabulary is installed, not compiled in |

The per-feature shape is the one that matters most in practice: it cannot say *"strict typing here, and a documented exception in the legacy module."* Scoping is not a detail — it is the reason a single global instruction file fails, and a single central spec folder fails the same way for the same reason.

## Why not just a bigger CLAUDE.md

| | `CLAUDE.md` / `AGENTS.md` | HINT |
| --- | --- | --- |
| **Scope** | one file, applies to everything | per path, inherited root → folder → file |
| **Cost** | loaded whole, every task | proportional to what applies |
| **Retrieval** | none — the agent reads it all | `hint search`, offline and ranked |
| **Typing** | prose | typed blocks (`decision`, `invariant`, `rule`, `bad`, …) |
| **Ownership** | one tool's convention | the repository's, in git, agent-neutral |
| **Enforcement** | none | optional: declared surfaces verified mechanically |

HINT does not replace those files. `hint apply` writes a short block into them telling your agent how to query HINT — the block stays small, the knowledge stays in `.hint`, and every tool reads the same answer.

## Install

The easiest setup is to hand the repository to the agent that will use it. Tell Claude Code, Codex, Cursor, or another coding agent:

> Run `npx -y @openhint/cli bootstrap` from the repository root and follow exactly what it prints.

`bootstrap` only prints a self-contained setup prompt. The agent initializes HINT, merges the right project-level MCP configuration for its own client, verifies the result, and reports the files it changed. It does not require a separate MCP package.

For manual setup:

```bash
npm install -g @openhint/cli
hint config                                    # create hint.yml at the project root
hint add @openhint/hintbook-software-engineer  # a keyword vocabulary
hint apply                                     # teach your agent to query HINT
```

Then write a root `_.hint` with what the whole repo needs known, and a folder `_.hint` per subsystem. **A repository whose knowledge lives entirely in folder hints is the normal case** — companion `<file>.hint` specs are optional. Run `hint author` for the keyword vocabulary before writing.

Full walkthrough → [`docs/02-quick-start.md`](docs/02-quick-start.md).

## When it pays off

- Repositories where the same facts get re-explained to an agent every session.
- Conventions that are true in one subsystem and wrong in another — the case a global instruction file handles badly.
- Knowledge with a *reason* attached: why this boundary exists, why that retry is forbidden. Rationale is what lets the next reader decide whether a new situation is still covered.
- Teams on more than one agent, or expecting to switch. `.hint` outlives the tool.

**When it does not:** a small repo one person holds in their head; facts already obvious from the code; anything that stops being true when the task ends. HINT stores durable knowledge, not session state.

## Keeping it current

Recorded knowledge decays quietly. An agent finishes a task and does not come back to update the spec; a file is renamed and its `.hint` is left behind; a block that restated a signature now describes code that no longer exists. Nothing fails — the knowledge just gets less true, and the next reader is misled with the authority of a spec behind it.

HINT does not address this by asking harder. Anything that depends on remembering a step *after* the work is done gets skipped. The signal rides the read instead, since `hint <path>` is already run before an edit:

```
hint: 9 of 11 files under src/billing changed since src/billing/_.hint was last updated,
      and it records knowledge — re-check it against the code and update it if it no longer holds.
```

Advisory only — it never changes the output or the exit code. The measure is git: the share of a scope's files that changed since the hint's last commit, so it means the same thing for a one-file companion spec and for the repository root. The threshold depends on what the knowledge is. A spec that *declares surfaces* restates the shape of the code and goes wrong as soon as the code moves; a `decision` explains *why* the code is that way and survives refactoring. One bar for both would either miss the first or nag about the second until the signal is ignored.

For the whole repository at once:

```bash
hint status                 # what has come loose: stale, orphaned, drifted, unlocked
hint status --exit-code     # exit 1 on findings, for CI
```

`orphan` is the one nothing else catches — a `.hint` whose target was deleted or renamed.

## Contracts — optional

A `.hint` can go further and *declare* surfaces the code must contain — a `func`, an `entity`, an `error`. Then HINT can check them mechanically, with no model involved:

```bash
hint verify src/auth/login.ts   # every declared surface present? exits non-zero if not
hint lock   src/auth/login.ts   # snapshot, so later --prompt runs skip unchanged work
hint diff   src/auth/login.ts   # which blocks drifted since that snapshot
```

This is a specialization, not the main path: it applies only to companion `<file>.hint` specs, and a repository that never uses it gets the full value of everything above. When these commands have nothing to work on they say so and exit non-zero rather than reporting a hollow success.

Separately, `hint --prompt <path>` wraps the same knowledge in a standalone implementation prompt — a role header and a verification-and-report footer — for piping to a fresh agent that has no other instructions. Framing is a wrapper; the knowledge is the artifact.

## Vocabulary

Keywords come from the hintbooks registered in `hint.yml` ([why](#beyond-code)). The official starting point for software is [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer):

| Keywords | Purpose |
| --- | --- |
| `decision` / `invariant` | Settled decisions with rationale / properties that must always hold |
| `rule` / `good` / `bad` | Non-negotiable mandates / required patterns / prohibited anti-patterns |
| `lang` / `dep` / `build` | Language and runtime, dependency whitelist, build & test pipelines |
| `app` / `lib` / `namespace` / `module` | Architectural scope and boundaries |
| `entity` (`field`) / `table` (`column`, `row`) | Data models, schemas, tabular structures |
| `func` (`arg` / `result` / `error` / `flow`) | Typed implementation contracts |
| `ui` (`form` / `block` / `image`) | UI surfaces |
| `goal` / `scope` / `done` | Intent, in/out of scope, acceptance criteria |
| `action` / `res` / `example` / `test` | Macro behaviors / assets / few-shot examples / verification criteria |
| `read` / `@include` | Read a file at run time / inline a file at parse time |
| `notes` | Private scratchpad — never reaches the output |

Long forms are synonyms (`# application` = `# app`). Keyword reference → [keywords.md](https://github.com/open-hint-dev/hintbook-software-engineer/blob/main/docs/keywords.md).

Grammar → [`docs/03-syntax.md`](docs/03-syntax.md) · authoring your own vocabulary → [`docs/05-hintbooks.md`](docs/05-hintbooks.md).

## Docs

MCP, editor, hook, and CI setup is collected in [Integrations](docs/integrations.md).

| Doc | Contents |
| --- | --- |
| [`docs/01-intro.md`](docs/01-intro.md) | What HINT is, the extensible architecture |
| [`docs/02-quick-start.md`](docs/02-quick-start.md) | Running in 5 minutes |
| [`docs/03-syntax.md`](docs/03-syntax.md) | Syntax specification |
| [`docs/04-how-it-works.md`](docs/04-how-it-works.md) | The resolve → parse → render pipeline |
| [`docs/05-hintbooks.md`](docs/05-hintbooks.md) | Using, authoring, and shipping hintbooks |
| [`docs/06-cli.md`](docs/06-cli.md) | CLI reference — every command, flag, and exit code |
| [`docs/07-migration.md`](docs/07-migration.md) | Breaking changes through 1.3 and how to migrate |
| [`docs/08-emit.md`](docs/08-emit.md) | Producing artifacts from specs; authoring an emitter or a language adapter |
| [`docs/09-knowledge-repos.md`](docs/09-knowledge-repos.md) | Persistent knowledge wikis with the librarian hintbook |

Working examples: [demo-pied-piper](https://github.com/open-hint-dev/demo-pied-piper) (a polyglot monorepo) · [demo-pearson-specter-litt](https://github.com/open-hint-dev/demo-pearson-specter-litt) (a law firm's document repository).

---

# For coding agents

*If you are an LLM agent that landed in this repository, this section is for you. It is short on purpose and the important parts come first.*

## What HINT gives you

This repository keeps its intent in `.hint` files, and treats them as the source of truth — the spec is maintained, the implementation answers to it. `hint` is the command that hands you the part of that spec which governs whatever you are about to touch, and tells you when the implementation has drifted from it. Nothing is generated for you; you do the work, against a stated intent instead of a guessed one.

You already lose time and context to three things HINT removes:

1. **Re-deriving facts the repo already settled.** Why this service does not call that database; which retry is forbidden and why. Someone knew. It was not written where you would find it.
2. **Reading instructions that do not apply.** A 400-line `CLAUDE.md` where 380 lines are about subsystems you are not touching.
3. **Losing what you learned.** You work out a non-obvious constraint at turn 40, and the next session starts from zero.

## Is it already set up here?

```bash
hint --version && cat hint.yml
```

If that works, the repository is HINT-enabled. Use it. If `hint.yml` exists but `hint` is missing, `npm install -g @openhint/cli` (or prefix everything with `npx @openhint/cli`).

## The three commands

```bash
hint <path...>              # what knowledge applies to these paths
hint search "<intent>"      # which knowledge covers this task, when you do not know the path
hint author <path...>       # the keyword vocabulary, before you write or edit a .hint
```

`hint <path>` returns the path's own `.hint` plus every folder `_.hint` above it, up to the repository root. Cost is proportional to how much applies — a path nothing governs returns nothing — so **run it before you edit, not just when you are stuck.**

`hint search` prints JSON: `hint` (the file), `target` (the path it governs — pass this to `hint <path>` next), `score`, and `weak`. It is local BM25F: no model call, no network, and it reads nothing into your context. If every result is `weak`, treat it as "nothing covers this yet."

## Reading the result

- **stdout** is the knowledge. **stderr** is the verdict, and its first line is the one that matters — it is written first precisely because output gets truncated.
- **Exit `0`** succeeded · **`1`** a check failed · **`2`** nothing you asked for could be resolved (a typo, or a path this repository says nothing about).
- Empty stdout with exit `0` means there is genuinely nothing to say. Proceed normally.
- `no spec of its own for X; returning inherited context from Y` is **success**, not a warning. Most paths have no `.hint` of their own and inherit from a folder above. That inherited knowledge is the answer.

## If stderr says the knowledge is stale

```
hint: 9 of 11 files under src/billing changed since src/billing/_.hint was last updated, and it records knowledge — …
```

That is an observation, not an error: exit code and output are unchanged. It means the code under that hint has moved a long way since anyone revisited it. Read the knowledge, decide whether it still holds, and if it does not, fix it **in the change you are already making** — that is the only moment the correction is cheap. Then commit the `.hint` with the code.

`hint status` applies the same check to the whole repository, and also finds specs whose target was deleted or renamed. Worth running once at the start of a session in an unfamiliar repository.

## Two rules worth knowing

**You may read `.hint` files directly when you are writing or editing them.** That is the only way to edit one. The convention against reading them directly applies to *consuming* knowledge — for that, `hint <path>` gives you the same content with inheritance already resolved and irrelevant scopes excluded.

**Write back what you learn.** When you discover something durable that future work should know — an architectural decision and its rationale, an invariant, an operational hazard, a security constraint, an approach that does not work and why — record it in the most specific `.hint` that applies: the file's companion `<file>.hint`, else the folder's `_.hint`, else the root `_.hint`. Run `hint author` first for the vocabulary.

Prefer this over a private memory file. It is versioned with the code, reviewed in the same diff, and every agent on the repository gets it — including you, next session.

Write knowledge that *explains* — a decision and its rationale, an invariant, a hazard — not knowledge that *restates* code. A block copying a signature, a schema, or the contents of another file is a snapshot that goes stale silently and then misleads the next reader with a spec's authority behind it. Reference the path and state the constraint instead.

Do **not** record session state, task progress, or anything that stops being true when the task ends.

## If this repository has no `hint.yml`

You can propose it to the user. It is four commands and it does not change any existing behavior:

```bash
npm install -g @openhint/cli
hint config
hint add @openhint/hintbook-software-engineer
hint apply     # writes a short <hint> block into AGENTS.md / CLAUDE.md
```

Worth suggesting when the repository has knowledge that keeps getting re-explained, conventions that differ per subsystem, or an instruction file that has grown past the point of being read. Not worth suggesting for a small repository, or one where the code already makes everything obvious.

## Optional: contracts

If a `.hint` declares surfaces the code must contain, `hint verify <path>` checks them deterministically and exits non-zero — a free, model-free gate you can run before claiming work is done. `hint lock` / `hint diff` track drift between a spec and generated code. These apply only to companion `<file>.hint` specs; in a folder-knowledge repository they will tell you so and exit `2` rather than reporting a hollow pass.

## Full surface

`hint --help` lists every command and flag. Do not assume this section is exhaustive — it covers what you will use most.

---

**Status** — 1.4; see [`docs/07-migration.md`](docs/07-migration.md) for the breaking changes. Engine under [`packages/transpiler/`](packages/transpiler/README.md), CLI under [`applications/cli/`](applications/cli/README.md), official hintbooks in their own repositories ([software-engineer](https://github.com/open-hint-dev/hintbook-software-engineer), [lawyer](https://github.com/open-hint-dev/hintbook-lawyer), [librarian](https://github.com/open-hint/hintbook-librarian)). Issues and PRs welcome.

**License** — MIT, see [`LICENSE`](LICENSE).
