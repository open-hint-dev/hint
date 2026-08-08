<p align="center">
  <img src="sites/openhint.dev/assets/logo-full.png" alt="HINT" width="491">
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.1-black">
  <img alt="format" src="https://img.shields.io/badge/format-Markdown%E2%80%91native-blue">
  <img alt="output" src="https://img.shields.io/badge/output-scoped%20repo%20context-6e40c9">
  <img alt="agents" src="https://img.shields.io/badge/agents-neutral-0aa">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green">
</p>

<h1 align="center">
  HINT — a context compiler for coding agents
</h1>

> **Tell your coding agent what matters here.**

Every coding agent starts each session knowing nothing about your repository. So teams write it down — in `CLAUDE.md`, in `AGENTS.md`, in a wiki nobody reads. Those files grow, apply everywhere at once, and get loaded whole on every task. Half of what an agent reads is irrelevant to what it is about to do, and the half that mattered was three hundred lines down.

HINT is a **context compiler**. Repository knowledge lives in `.hint` files next to the code it describes, versioned in git. Ask HINT about a path or an intent, and it returns the subset that applies — inherited from the root down, and nothing more.

```text
repository knowledge → .hint → scope + inheritance → retrieval → minimal relevant context → your agent
```

It works underneath Claude Code, Codex, OpenCode, Cline, or anything else that can run a command. HINT does not implement, plan, or replace your agent. It answers one question: *what does this repository already know about what I am about to touch?*

---

## See it work

Knowledge lives where the code lives. `packages/gateway/auth/_.hint`:

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

Ask what applies before you touch a file:

```bash
$ hint packages/gateway/auth/token.go
```

```text
<folder_context path=".">
  <critical_system_mandates name="FailClosed">
  Security-sensitive operations fail closed.
  </critical_system_mandates>

  <folder_context path="packages/gateway/auth">
    <architectural_decision name="Gateway owns external authentication" id="auth_boundary">…</architectural_decision>
    <system_invariant name="Token verification goes through TokenVerifier" id="token_path">…</system_invariant>
    <prohibited_anti_patterns name="Direct identity DB access from the gateway">…</prohibited_anti_patterns>
  </folder_context>
</folder_context>
```

`hint: no spec of its own for packages/gateway/auth/token.go; returning inherited context from packages/gateway/auth/_.hint`

That is the whole output — the applicable knowledge and a one-line note on stderr saying where it came from. No persona, no workflow instructions, no reporting format. A path nothing applies to returns nothing, so calling `hint` before an edit is cheap enough to do on reflex.

When you know the intent but not the path:

```bash
$ hint search "service account authentication"
{
  "query": "service account authentication",
  "count": 2,
  "results": [
    { "hint": "packages/gateway/auth/_.hint", "target": "packages/gateway/auth", "score": 6.12, "weak": false },
    { "hint": "packages/identity/_.hint",     "target": "packages/identity",     "score": 1.84, "weak": true  }
  ]
}
```

Offline, deterministic, no model call, no files read into context. `weak` flags a hit that matched under half your query terms — advisory, never hidden.

---

## Why not just a bigger CLAUDE.md

| | `CLAUDE.md` / `AGENTS.md` | HINT |
| --- | --- | --- |
| **Scope** | one file, applies to everything | per path, inherited root → folder → file |
| **Cost** | loaded whole, every task | proportional to what applies |
| **Retrieval** | none — the agent reads it all | `hint search`, offline and ranked |
| **Typing** | prose | typed blocks (`decision`, `invariant`, `rule`, `bad`, …) |
| **Ownership** | one tool's convention | the repository's, in git, agent-neutral |
| **Enforcement** | none | optional: declared surfaces verified mechanically |

HINT is not a replacement for those files — `hint apply` writes a short block into them telling your agent how to query HINT. That block stays small; the knowledge stays in `.hint`.

---

## Quick start

**1. Initialize**

```bash
npm install -g @openhint/cli
hint config                                    # create hint.yml at the project root
hint add @openhint/hintbook-software-engineer  # a keyword vocabulary
hint apply                                     # tell your agent how to query HINT
```

**2. Write down what the repository knows.** A root `_.hint` holds project-wide baselines; a folder `_.hint` holds what applies to that subsystem and everything under it. A repository whose knowledge lives entirely in folder hints is a normal, fully supported setup — most do.

```markdown
# lang TypeScript

Node.js v22+, ESM only.

# rule Migrations are never edited after merge

Add a new migration instead. The deploy pipeline replays them in order from an
empty database on every staging rebuild.

# bad Retry loops around the payment gateway

The gateway is not idempotent below the charge-token layer. Retrying a failed
charge double-bills. Surface the failure instead.
```

Run `hint author` for the keyword vocabulary before writing. Agents may read `.hint` files directly when authoring them — that restriction applies only to *consuming* knowledge, where `hint <path>` gives you inheritance already resolved.

**3. Query it.** `hint <path>` before touching a file; `hint search "<intent>"` when you do not know the path. Both are cheap. Pipe to an agent that has no other instructions with `hint --prompt <path> | claude -p`, which adds implementation framing around the same knowledge.

**4. Record what you learn.** When a session discovers something durable — a decision, an invariant, an operational hazard, an approach that does not work — write it into the most specific `.hint` that applies. It is versioned with the code and available to every tool, instead of decaying in one agent's memory file.

Full walkthrough → [`docs/02-quick-start.md`](docs/02-quick-start.md).

---

## Contracts (optional)

Beyond recording knowledge, a `.hint` can *declare* things the code must contain — a `func`, an `entity`, an `error`. When it does, HINT can check them mechanically:

```bash
hint verify src/auth/login.ts   # every declared surface present in the code? exits non-zero if not
hint lock   src/auth/login.ts   # snapshot; later `hint` runs skip unchanged specs
hint diff   src/auth/login.ts   # which blocks drifted since that snapshot
```

Deterministic and token-free — no model involved. This is a specialization, not the main path: it only applies to companion `<file>.hint` specs, and a repository that never uses it gets the full value of everything above. When these commands have nothing to work on they say so and exit non-zero, rather than reporting a hollow success.

Exit codes across the CLI: `0` succeeded · `1` a check failed · `2` nothing you asked for matched.

---

## What `--prompt` framing adds

With `--prompt`, the same knowledge is wrapped in a border contract that makes a fresh agent:

- **Stay in scope** — only the files, types, and fields you declared. Nothing adjacent.
- **Implement, not redesign** — your architecture, not its own; simplest construct that fits; declared modules reused, never duplicated.
- **Skip stubs** — every path built; scratch thoughts go in `# notes` (stripped at compile).
- **Surface conflicts and gaps** — contradictions between blocks are reported, not silently resolved; unspecified decisions are listed back to you.
- **Cover errors** — every `error` block gets a fail-then-pass regression test.
- **Reconcile, don't rewrite** — when a `hint.lock` exists and blocks have drifted, only those blocks are touched; conforming work is left as-is. This framing appears automatically when there is drift — there is no mode to select.
- **Honor per-file control** — a companion beside each file; root → folder → file context nests visibly in the output.
- **Verify before finishing** — the footer walks the agent block by block: implemented, prohibited patterns absent, names and types exact, build and tests passing.

Each hintbook defines the enforcement that matters in its profession — for the lawyer book that means defined-term discipline and a hard ban on invented facts, figures, and citations. None of this is in the default output: framing is a wrapper, and the compiled knowledge is the artifact.

---

## Vocabulary

The transpiler core has **no built-in keywords** — it understands files, headings (`# keyword Name {#id}`), nesting, and `@include`. The vocabulary comes from **hintbooks**: installable instruction packages registered in `hint.yml`, one per profession or per team.

### Software engineering — [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer)

| Keywords                                       | Purpose                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `lang` / `dep` / `build`                       | Language, dependency whitelist, build & test pipelines                     |
| `app` / `lib` / `namespace` / `module`         | Architectural scope: app, library, namespace/package boundary, single file |
| `entity` (`field`) / `table` (`column`, `row`) | Data models, schemas, tabular structures                                   |
| `func` (`arg` / `result` / `error` / `flow`)   | Typed implementation contracts                                             |
| `ui` (`form` / `block` / `image`)              | UI surfaces                                                                |
| `action`                                       | Reusable macro behaviors                                                   |
| `decision` / `invariant`                       | Settled architectural decisions with rationale / properties that must always hold |
| `res` / `rule`                                 | Static assets / non-negotiable mandates                                    |
| `good` / `bad`                                 | Required patterns / prohibited anti-patterns                               |
| `example` / `test`                             | Few-shot examples / verification criteria                                  |
| `notes`                                        | Private scratchpad — stripped at compile                                   |
| `read` / `@include`                            | LLM reads a file at run time / inline a file at compile time               |

Keyword reference → [keywords.md](https://github.com/open-hint-dev/hintbook-software-engineer/blob/main/docs/keywords.md).

### Legal drafting — [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer)

| Keywords                                                     | Purpose                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `matter` / `jurisdiction` / `party`                          | The matter, governing law & forum, parties with exact legal names           |
| `definition` / `recital` / `fact`                            | Defined terms, recitals, established facts of the matter                    |
| `clause` (`obligation` / `right` / `condition` / `deadline`) | Operative provisions: duties, entitlements, conditions, time periods        |
| `representation` / `remedy` / `indemnity` / `liability`      | Reps & warranties, remedies, indemnification, liability caps and carve-outs |
| `termination` / `payment` / `notice` / `dispute`             | Term & termination, money, notices, dispute resolution                      |
| `exhibit` / `signature`                                      | Attachments / execution formalities                                         |
| `claim` / `argument` / `authority`                           | Litigation: causes of action, legal arguments, citations — never invented   |
| `rule` / `prohibition` / `standard`                          | Client red lines / content that must never appear / required boilerplate    |
| `risk` / `checklist`                                         | Risks the document must address / items verified before finishing           |
| `notes`                                                      | Private scratchpad — stripped at compile                                    |
| `read` / `precedent` / `style`                               | Read source documents / model documents to replicate / drafting style       |

Every `--prompt` footer notes the output still requires licensed counsel. Keyword reference → [keywords.md](https://github.com/open-hint-dev/hintbook-lawyer/blob/main/docs/keywords.md).

In both books long forms are synonyms (`# application` = `# app`, `# provision` = `# clause`). Swap or extend a book — or publish your own profession's vocabulary — without touching the compiler. A hintbook is just a folder of markdown files: the HTML-like tags in the official books are a convention that works well for AI agents, not a requirement, and authoring one takes no programming experience — if you can write markdown, you can build the vocabulary for your profession. Full grammar → [`docs/03-syntax.md`](docs/03-syntax.md); authoring guide → [`docs/05-hintbooks.md`](docs/05-hintbooks.md).

---

## Docs

| Doc                                                  | Contents                                  |
| ---------------------------------------------------- | ----------------------------------------- |
| [`docs/01-intro.md`](docs/01-intro.md)               | What HINT is, the extensible architecture |
| [`docs/02-quick-start.md`](docs/02-quick-start.md)   | Running in 5 minutes                      |
| [`docs/03-syntax.md`](docs/03-syntax.md)             | Syntax specification                      |
| [`docs/04-how-it-works.md`](docs/04-how-it-works.md) | The compilation pipeline                  |
| [`docs/05-hintbooks.md`](docs/05-hintbooks.md)       | Using, authoring, and shipping hintbooks  |
| [`docs/06-cli.md`](docs/06-cli.md)                   | CLI reference                             |
| [`docs/07-migration.md`](docs/07-migration.md) | Breaking changes in 1.1 and how to migrate |

---

**Status** — 1.1; see [`docs/07-migration.md`](docs/07-migration.md) for the breaking changes. Engine under [`packages/transpiler/`](packages/transpiler/README.md), CLI under [`applications/cli/`](applications/cli/README.md), official hintbooks in their own repositories ([software-engineer](https://github.com/open-hint-dev/hintbook-software-engineer), [lawyer](https://github.com/open-hint-dev/hintbook-lawyer)). Issues and PRs welcome.
**License** — MIT, see [`LICENSE`](LICENSE).
