# Human Intent Native Transpiler (HINT)

## What is HINT?

HINT (Human Intent Native Transpiler) is a markdown-native specification language for professionals who work with AI and want predictable results. You declare what must be produced — application architecture and domain models, or the parties and clauses of a contract — in plain human intent, next to the artifacts those declarations govern, and HINT compiles them into a deterministic, high-density prompt payload for AI assistants and autonomous agents (Claude Code, Codex, Cursor, and similar tools).

The premise: AI gives professionals speed, but unstructured prompts trade away control — you ask for one thing and get plausible improvisation around it. HINT keeps both. Your declarations become binding borders; the AI produces the work inside them; gaps and conflicts come back to you as reports instead of silent decisions. Software engineering is the first and most complete vocabulary, but it is one example, not the definition.

The name is deliberate on three levels. As a backronym it expands to **Human Intent Native Transpiler**. Read aloud it is **H**uman **INT**ent — the thing the tool exists to capture. And it is simply the word _hint_: a clue you give to guide someone to the right answer. That last meaning is the model itself — you hint at the result with precise borders, and the AI fills in the work that honors them.

## The architecture: a small core, extensible vocabulary

HINT deliberately has **no built-in keywords**. The transpiler core understands only structure:

- **Files**: a `.hint` file is a companion specification — `src/auth/login.ts.hint` defines `src/auth/login.ts`, `contracts/nda.md.hint` defines `contracts/nda.md`, and a folder's `_.hint` defines context for everything beneath it.
- **Headings**: every markdown heading is a typed block — `# entity PaymentData {#payment_data}` has a keyword (`entity`), a name (`PaymentData`), an optional stable id (`payment_data`), and a body that runs until the next heading. Heading depth nests blocks into a tree.

What each keyword *means* — and what prompt text it produces — is defined by **hintbooks**: installable packages of instruction templates. A hintbook maps keywords like `entity`, `flow`, or `bad` to rendered prompt blocks, defines per-mode role wrappers (implement / fix / review), and ships the system glossary that teaches the agent how to read the compiled output.

This split keeps the core honest and the vocabulary open:

- The transpiler never hard-codes what an `entity` is. Swap or extend the hintbook and the same `.hint` files compile into a different contract dialect.
- Teams can publish their own hintbooks (npm packages, git repositories, or plain folders) with vocabulary tuned to their stack — and the vocabulary does not even have to be about code: [`@openhint/hintbooks-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) drafts legal documents from `party`, `clause`, and `obligation` blocks. HINT serves anyone whose work demands strict structured thinking.
- Authoring a hintbook requires no programming. Instructions are pure markdown files with `{name}`-style placeholders; the HTML-like tags the official books render are a helpful convention for AI agents, not a requirement. If you can write markdown, you can build and publish the vocabulary for your profession.
- The official starting point is [`@openhint/hintbooks-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer), a general-purpose software engineering vocabulary.

## Why HINT?

As a professional, you already know exactly what needs to be produced — the engineer knows the architecture, the lawyer knows the deal. The mechanical production is what AI is for; the decisions are what it must never make for you. HINT eliminates the boring parts while keeping you in control of the parts that matter:

- **Zero syntax friction**: a `.hint` file is pure markdown. There is no new syntax to learn, and files are instantly readable by humans and AI alike.
- **Specs live with the work**: companion files sit next to their targets and travel through the same reviews, branches, and history.
- **Deterministic compilation**: the same specs and the same hintbook always produce the same prompt. No hidden prompt engineering.
- **Borders, not vibes**: the compiled prompt tells the AI exactly what exists, what it must contain, what it must do, and what it must never do.
- **Gaps come back, not guesses**: missing decisions are reported to you instead of being filled with something plausible.

## The toolchain

| Piece | What it is |
| --- | --- |
| [`@openhint/cli`](../applications/cli/README.md) | The `hint` binary: compiles specs, configures projects, installs hintbooks. |
| [`@openhint/transpiler`](../packages/transpiler/README.md) | The library behind the CLI: find → parse → compile pipeline and hintbook loading. |
| [`@openhint/hintbooks-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer) | The software-engineering vocabulary — building, fixing, and reviewing code. |
| [`@openhint/hintbooks-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) | The legal vocabulary — drafting, revising, and auditing documents. |

## Where to go next

- [Quick Start](02-quick-start.md) — set up a project and compile your first prompt in minutes.
- [Syntax](03-syntax.md) — the complete structural grammar of `.hint` files.
- [How It Works](04-how-it-works.md) — the compilation pipeline in detail.
- [Hintbooks](05-hintbooks.md) — using, authoring, and distributing keyword vocabularies.
- [CLI Reference](06-cli.md) — every command and flag.
