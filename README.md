<p align="center">
  <img src="sites/openhint.dev/public/logo-full.png" alt="HINT" width="491">
</p>

<p align="center">
  <img alt="spec" src="https://img.shields.io/badge/spec-v1.0.0-black">
  <img alt="format" src="https://img.shields.io/badge/format-Markdown%E2%80%91native-blue">
  <img alt="output" src="https://img.shields.io/badge/output-LLM%20prompt%20payload-6e40c9">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green">
</p>

<h1 align="center">
  HINT — Human Intent Native Transpiler
</h1>

> **Write software in the language you already speak. Let the agent handle the syntax.**

I built HINT because I got tired of watching AI turn small tasks into sprawling code changes. You ask for one feature and get extra abstractions, new files, and architecture decisions you never made. The code may work. Now you own all of it.

I want the speed without giving up control of the codebase.

### A programming language you already speak

HINT is not just another spec-driven workflow. It is a native-speaking programming language. English describes the program. HINT adds enough structure to make that description precise.

- A `.hint` file lives next to your code.
- `src/controllers/auth.py.hint` defines `src/controllers/auth.py`.
- `pkg/utils/crypto.go.hint` defines shared helpers in `pkg/utils/crypto.go`.
- You declare files, entities, functions, dependencies, errors, flows, and rules.
- The agent reports missing decisions instead of quietly making them.

Think of `.hint` as closer to `.py`, `.ts`, or `.go` than to a ticket or planning document.

### How it is different

| Approach                                              | What it controls                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec)    | Proposals, behavioral specs, tasks, and spec changes                      |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | The workflow from feature spec to plan, tasks, and implementation         |
| **HINT**                                              | The source boundary: what code exists, where it lives, and how it behaves |

You still ask an AI agent to write the final code. But you do not hand it a vague prompt and hope its architecture matches yours. HINT compiles your files and project rules into a strict implementation prompt.

**You decide where code lives, what gets reused, and what must never happen. The agent writes the syntax.**

---

## See it work

`src/domain/auth/login.ts.hint` — you write the borders:

```markdown
# read {src/infrastructure/security/tokens.ts} as TokenEngine

Core JWT signing wrapper.

# entity Credentials

- username: string (authenticated email pattern)
- password: string (min 8 chars, argon2-hashed)

# function executeLogin

## arg inputs: {Credentials}

Payload from the login route.

## return string

A signed bearer token.

## error InvalidCredentialsException

User missing or password mismatch.

## flow

1. Look up the username, fetch the secure profile.
2. If missing, throw InvalidCredentialsException.
3. Compare the password against the stored argon2 hash.
4. On success, sign a token via {TokenEngine} and return it.

# bad

- Never reveal whether a user exists in failure messages.
```

```bash
hint src/domain/auth/login.ts.hint | claude
```

The agent answers inside the fence:

```text
CONTRACT TRACE
  entity Credentials            — SATISFIABLE
  function executeLogin         — SATISFIABLE
  rule (no user-existence leak) — SATISFIABLE

→ writes login.ts        — exactly the surface declared, nothing adjacent
→ writes login.test.ts   — one regression test per declared error

ASSUMPTIONS
  // ASSUMPTION: token TTL not specified — defaulted to 3600s.
```

It built only what you declared, wrote the error test, and told you where your spec was thin. Add a `# rule` for the TTL, recompile — assumption gone.

---

## Quick start

**1. Mark the root + set baselines** — `hint.yml` marks the project root and can ignore paths using gitignore-style patterns; a root `_.hint` holds the global defaults:

```markdown
# lang

TypeScript (Node.js v22+ / ESM)

# deps

- Express.js, Zod
- Prefer native modules; avoid bloated utilities.

# build

- npm run build
- make test
```

**2. Companion files** — drop a `*.hint` next to any file you want built. Context lives where your code lives.

**3. Compile & Run** — `hint src/**/*.hint | claude`.

Full walkthrough → [`docs/02-quick-start.md`](docs/02-quick-start.md).

---

## What the prompt enforces

No new syntax — the compiler wraps your spec in a border contract that makes the AI:

- **Stay in scope** — only the files, types, and fields you declared. Nothing adjacent.
- **Implement, not redesign** — your architecture, not its own; simplest construct that fits.
- **Skip stubs** — every path built; `TODO`s go in `# notes` (stripped at compile).
- **Gate before coding** — trace each clause `SATISFIABLE | UNDERSPECIFIED | CONFLICTING`; gaps stop, they don't get guessed.
- **Surface assumptions** — unavoidable gap-fills marked in-code and listed back to you.
- **Cover errors** — every `## error` gets a fail-then-pass regression test.
- **Honor per-file control** — a companion beside each file; root → folder → file wins.

Exact prompt strings → [`docs/05-transpilation.md`](docs/05-transpilation.md).

---

## Directives

| Directive                                                      | Purpose                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `# lang` / `# deps` / `# build`                                | Language, dependency whitelist, build & test pipelines                     |
| `# app` / `# lib` / `# namespace` / `# module`                 | Architectural scope: app, library, namespace/package boundary, single file |
| `# entity`                                                     | Data models, schemas, payload shapes                                       |
| `# function` (`## arg` / `## return` / `## error` / `## flow`) | Typed implementation contracts                                             |
| `# ui` (`## form` / `## block` / `## image` / `## table`)      | UI surfaces                                                                |
| `# action`                                                     | Reusable macro behaviors                                                   |
| `# res` / `# rule`                                             | Static assets / non-negotiable mandates                                    |
| `# good` / `# bad`                                             | Required patterns / prohibited anti-patterns                               |
| `# example` / `# test`                                         | Few-shot examples / verification criteria                                  |
| `# notes`                                                      | Private scratchpad — stripped at compile                                   |
| `# read` / `@include`                                          | LLM reads a file at run time / inline a file at compile time               |
| `{name}`                                                       | Cross-reference between blocks                                             |

Keywords are case-insensitive and abbreviations accept their full word (`# app` = `# Application`). Full grammar → [`docs/03-syntax.md`](docs/03-syntax.md).

---

## Docs

| Doc                                                    | Contents                        |
| ------------------------------------------------------ | ------------------------------- |
| [`docs/01-intro.md`](docs/01-intro.md)                 | What HINT is, context hierarchy |
| [`docs/02-quick-start.md`](docs/02-quick-start.md)     | Running in 5 minutes            |
| [`docs/03-syntax.md`](docs/03-syntax.md)               | Syntax specification            |
| [`docs/04-how-it-works.md`](docs/04-how-it-works.md)   | Engine mechanics                |
| [`docs/05-transpilation.md`](docs/05-transpilation.md) | Prompt-mapping contract         |

---

**Status** — spec stable at v1.0.0; CLI + engine under `packages/transpiler/`. Issues and PRs welcome.
**License** — MIT, see [`LICENSE`](LICENSE).
