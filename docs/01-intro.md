# Human Intent Native Transpiler (HINT)

## What is HINT?

HINT (Human Intent Native Transpiler) is a markdown-native, structural engineering language designed specifically for senior developers. It allows you to declare application architecture, domain models, and algorithmic flows in plain human intent without touching traditional code syntax.

The name is deliberate on three levels. As a backronym it expands to **Human Intent Native Transpiler**. Read aloud it is **H**uman **INT**ent — the thing the tool exists to capture. And it is simply the word _hint_: a clue you give to guide someone to the right answer. That last meaning is the model itself — you hint at the architecture with precise borders, and the LLM fills in the code that honors them.

Instead of compiling into a binary or runtime bytecode, HINT compiles into a deterministic, high-density, context-aware prompt payload. This payload is optimized to feed directly into LLM coding assistants and autonomous development agents (such as Claude Code, Cursor, or specialized AI tools).

## Why HINT?

As a senior programmer, you already know exactly what needs to be built. Writing the boilerplate, setting up routers, handling imports, and managing syntax configurations is just mechanical typing. HINT serves as an accelerator to eliminate the boring parts of software development:

- **Zero Syntax Friction**: Writing a `*.hint` file is writing pure markdown. There is no new syntax to learn, and files are instantly readable by humans and AI alike.
- **Context Preservation**: HINT's directory hierarchy resolves code dependencies and configuration boundaries automatically. It ensures your AI assistant stays bound to your project's styling and utility requirements.
- **Architecture First**: You retain absolute control over business logic, data boundaries, and test parameters while letting the transpiler act as your fingers.
- **Borders, Not Boilerplate**: HINT is built for engineers who want to design the architecture and delegate the mechanical fill — not for generating code at any quality. You declare the borders (contracts, constraints, prohibitions, data shapes); the model implements strictly inside them. The compiled prompt spends most of its weight fencing what the model must _not_ do — no unspecified surface, no new abstractions, no scope drift, no stubs — so your codebase grows only along the lines you drew and never degrades into uncontrolled "vibe code."
- **Gaps Are Surfaced, Not Filled**: When your specification is silent on something, the compiled prompt forces the model to flag it rather than quietly invent a detail. Every assumption it makes is marked in-code and reported back to you, turning each compile into a feedback loop that tightens your specification over time.
- **Universal Execution**: Because HINT is pure markdown, a `*.hint` file is fully readable and executable by an LLM as a direct prompt even without using the HINT compiler tool.

## File Context Hierarchy & Resolution

When you run the HINT compiler against a target file, it performs a cascading, upward directory scan to merge specifications deterministically:

1. **Project Root Marker**: The engine locates the project root by finding a `hint.yml` (or `hint.yaml`) file there. Its optional `ignore` array contains gitignore-style, project-relative patterns. Ignored targets, context files, includes, and read references are excluded from compilation.
2. **Folder-Level Cascading**: The engine climbs the parent directories, merging each folder's `_.hint` baseline. Nearer folders take priority over those further up, and the **root `_.hint`** holds your global baselines (`# lang`, `# deps`, `# build`) that everything below inherits.
3. **File-Specific Primacy**: A file-specific specification (e.g., `auth.ts.hint` sitting right next to `auth.ts`) takes absolute precedence, establishing the final constraint boundaries.

Prefer `# read {path} as Name` for reusable contracts and source context: the compiled prompt carries one file reference and the AI can read it once, retain it, and reuse it through `{Name}`. Use `@include` only when another HINT fragment must be physically spliced into the current token stream so its blocks participate in parsing, cascade merging, or overrides. There is no automatic wildcard merging.
