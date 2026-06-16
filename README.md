<p align="center">
  <img src="sites/openhint.dev/assets/logo-full.png" alt="HINT" width="491">
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

> **Precision prompt engineering for predictable AI outcomes.**

I built HINT because I got tired of watching AI turn small tasks into sprawling code changes. You ask for one feature and get extra abstractions, new files, and architecture decisions you never made. The code may work. Now you own all of it.

I want the speed without giving up control.

Then it became clear the problem is not about code at all. Every professional who hands work to an AI faces the same trade: speed for control. A lawyer gets a contract with clauses nobody asked for. An analyst gets a report with invented numbers. **HINT is designed for professionals seeking a structured, systematic approach to working with AI to achieve predictable results.** Software engineering is just the first vocabulary — engineers get [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer), lawyers get [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer), and any profession can publish its own.

### A language you already speak

HINT is not just another spec-driven workflow. It is a native-speaking specification language. English describes the deliverable. HINT adds enough structure to make that description precise — and enough enforcement to make it binding.

- A `.hint` file lives next to the work it defines.
- `src/controllers/auth.py.hint` defines `src/controllers/auth.py`.
- `contracts/nda.md.hint` defines `contracts/nda.md`.
- You declare entities, functions, errors, and rules — or parties, clauses, obligations, and red lines. The vocabulary is pluggable.
- The agent reports missing decisions instead of quietly making them.

Think of `.hint` as closer to `.py`, `.ts`, or a signed term sheet than to a ticket or planning document.

### How it is different

For software, compare it with spec-driven development tools:

| Approach                                              | What it controls                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec)    | Proposals, behavioral specs, tasks, and spec changes                     |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | The workflow from feature spec to plan, tasks, and implementation        |
| **HINT**                                              | The source boundary: what exists, where it lives, and how it must behave |

You still ask an AI agent to produce the final work. But you do not hand it a vague prompt and hope its decisions match yours. HINT compiles your declarations and rules into a strict, deterministic prompt — the same specs and the same vocabulary always produce the same contract.

**You decide what exists, what gets reused, and what must never happen. The AI handles the production.**

---

## See it work

`src/domain/auth/login.ts.hint` — you write the borders:

```markdown
Login flow for the auth domain.

# read src/infrastructure/security/tokens.ts

Core JWT signing wrapper — reuse it, never reimplement signing.

# entity Credentials {#credentials}

- username: string (authenticated email pattern)
- password: string (min 8 chars, argon2-hashed)

# func executeLogin

Authenticates a user and issues a bearer token.

## arg inputs

Payload from the login route, shaped as Credentials.

## result

A signed bearer token string.

## error InvalidCredentialsException

User missing or password mismatch.

## flow

1. Look up the username, fetch the secure profile.
2. If missing, throw InvalidCredentialsException.
3. Compare the password against the stored argon2 hash.
4. On success, sign a token via the token engine and return it.

# bad UserExistenceLeak

Never reveal whether a user exists in failure messages.
```

```bash
hint src/domain/auth/login.ts | claude -p
```

The compiler wraps the file in its folder context and renders every block into a binding tag the agent has a glossary for — `<function_contract>`, `<error>`, `<prohibited_anti_patterns>` — framed by a role header and a verification footer. The agent:

- writes `login.ts` — exactly the surface declared, nothing adjacent;
- writes a regression test for `InvalidCredentialsException` that fails without the guard;
- reads the real `tokens.ts` before touching it, instead of guessing at its API;
- closes with a report mapping the code back to your blocks — and tells you where the spec was thin (no token TTL declared? that's in the report, not silently defaulted).

Add a `# rule` for the TTL, recompile — gap gone.

### Not just code

The same machinery drafts legal documents. Swap the hintbook and `contracts/nda.md.hint` declares parties, defined terms, obligations, and red lines:

```markdown
# party Discloser {#discloser}

Acme Corp., a company registered in England, No. 0123456.

# clause Confidentiality

## obligation NonDisclosure

The Receiving Party shall not disclose Confidential Information to any third party.

# prohibition

- No non-compete or non-solicit obligations in this NDA.
```

The compiled prompt makes the assistant draft inside those borders — defined terms used with total discipline, no invented facts, figures, or citations, gaps reported instead of filled. See [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer).

---

## Quick start

**1. Initialize** — `hint config` creates `hint.yml` (marks the project root); `hint instruct` then prints a prompt that teaches your agent the workflow via `AGENTS.md` / `CLAUDE.md`:

```bash
npm install -g @openhint/cli
hint config                                       # create hint.yml
hint add @openhint/hintbook-software-engineer     # building software
hint add @openhint/hintbook-lawyer                # drafting legal documents
hint instruct | claude -p                         # wire up AGENTS.md / CLAUDE.md
```

Install the hintbook for your profession — or both, or your own. `hint config`, `hint add`, and `hint remove` only touch `hint.yml`; run `hint instruct | claude -p` once afterwards to apply the changes to your agent files.

**2. Set baselines** — a root `_.hint` holds the global defaults every folder and file inherits:

```markdown
# lang TypeScript

Node.js v22+, ESM only.

# dep

- Express.js, Zod
- Prefer native modules; avoid bloated utilities.

# build

- npm run build
- make test
```

**3. Companion files** — drop a `*.hint` next to any file you want built. Context lives where your code lives.

**4. Compile & run** — `hint 'src/**/*.hint' | claude -p`. Use `--mode fix` to repair code against the spec, `--mode review` to audit it.

Full walkthrough → [`docs/02-quick-start.md`](docs/02-quick-start.md).

---

## What the prompt enforces

No new syntax — the compiler wraps your spec in a border contract that makes the AI:

- **Stay in scope** — only the files, types, and fields you declared. Nothing adjacent.
- **Implement, not redesign** — your architecture, not its own; simplest construct that fits; declared modules reused, never duplicated.
- **Skip stubs** — every path built; scratch thoughts go in `# notes` (stripped at compile).
- **Surface conflicts and gaps** — contradictions between blocks are reported, not silently resolved; unspecified decisions are listed back to you.
- **Cover errors** — every `error` block gets a fail-then-pass regression test.
- **Honor per-file control** — a companion beside each file; root → folder → file context nests visibly in the output.
- **Verify before finishing** — the footer walks the agent block by block: implemented, prohibited patterns absent, names and types exact, build and tests passing.

Each hintbook defines the enforcement that matters in its profession — for the lawyer book that means defined-term discipline and a hard ban on invented facts, figures, and citations. Role wrappers per mode → [`docs/modes.md`](https://github.com/open-hint-dev/hintbook-software-engineer/blob/main/docs/modes.md).

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
| `res` / `rule`                                 | Static assets / non-negotiable mandates                                    |
| `good` / `bad`                                 | Required patterns / prohibited anti-patterns                               |
| `example` / `test`                             | Few-shot examples / verification criteria                                  |
| `notes`                                        | Private scratchpad — stripped at compile                                   |
| `read` / `@include`                            | LLM reads a file at run time / inline a file at compile time               |

Modes: implement (default), `fix` (repair code against the spec), `review` (audit and report). Keyword reference → [keywords.md](https://github.com/open-hint-dev/hintbook-software-engineer/blob/main/docs/keywords.md).

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

Modes: draft (default), `fix` (revise a deviating document), `review` (audit with quoted findings). Every footer notes the output still requires licensed counsel. Keyword reference → [keywords.md](https://github.com/open-hint-dev/hintbook-lawyer/blob/main/docs/keywords.md).

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

---

**Status** — spec stable at v1.0.0. Engine under [`packages/transpiler/`](packages/transpiler/README.md), CLI under [`applications/cli/`](applications/cli/README.md), official hintbooks in their own repositories ([software-engineer](https://github.com/open-hint-dev/hintbook-software-engineer), [lawyer](https://github.com/open-hint-dev/hintbook-lawyer)). Issues and PRs welcome.
**License** — MIT, see [`LICENSE`](LICENSE).
