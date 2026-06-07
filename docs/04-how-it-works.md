# How HINT Works: Core Engine & Usage Manual

This document outlines the internal mechanics of the HINT (Human Intent Native Transpiler) engine. It details how files are resolved, parsed, and compiled, along with critical best practices for developers.

---

## 1. The Compilation Lifecycle

Executing the HINT command expects an array of files or glob targets passed directly into the binary terminal interface:

```text
hint file1.hint path/to/file2.hint src/**/*.hint
```

The engine runs this target pipeline against every unique file matched across the command arguments:

1. **Cascade Discovery (Context Inheritance & Resolution Priority)**
    - For every target file argument (e.g., target file `src/domain/auth/auth.ts`), the engine isolates its path directory and establishes a strict, bottom-up priority resolution tree to inherit and merge context specifications.
    - The lookup hierarchy behaves with the following strict sequence, checking files locally before recursively climbing parent folders up to the root:
        ```text
        [HIGHEST PRIORITY - Overrides all below]
        ├── 1. Specific Companion File  : auth.ts.hint (In current folder)
        ├── 2. Direct Match File        : auth.hint (In current folder)
        ├── 3. Local Baseline Match     : _.hint (In current folder)
        │
        │   [CASCADE UPWARD LOOP - Repeats at each parent folder level]
        ├── 4. Parent Baseline Match    : ../_.hint -> ../../_.hint -> ...
        │
        │   [REPOSITORY CONTAINER ROOT]
        └── 5. Global Project Anchor    : project.hint (In project root)
        [LOWEST PRIORITY - Global baseline configuration defaults]
        ```
    - **The Wildcard (`*.hint`) Addition Rule**: In addition to the direct override hierarchy above, **all standalone `*.hint` files found at each directory level are parsed and automatically added to the file's context**.
    - They follow the exact same folder priority order during the merge step:
        ```text
        *.hint in current folder -> *.hint in parent folder -> ... -> *.hint in root folder
        ```
    - **Why this matters**: Wildcards are **added, not overridden**. This is a powerful mechanism designed to inject common domain rules and shared context definitions automatically into your files without forcing you to constantly write manual `@include` directives at the top of every single script.
    - Later instruction blocks inside the high-priority override chain completely replace earlier blocks if they share the exact same header signature (e.g., matching `# lang` or matching `# entity User`). Unmatched blocks and added wildcard blocks append smoothly into the master localized compilation pipeline buffer.

2. **Preprocessing & Context Instructions**
    - `@include <glob>`: A compile-time preprocessor macro — the engine resolves it first, before parsing. The compiler fetches the target file, reads its raw contents, and copies them as-is directly into the active text stream.
    - `# read {glob} as [name]`: A structural directive, not a preprocessor action. The compiler does **not** inline the file; it emits an instruction directing the LLM assistant to load, parse, and analyze the physical file(s) matching the glob pattern before writing code, and binds them to the given reference name (the `as [name]` clause is optional). The lines immediately following it describe the file's architectural significance.

3. **AST Generation & Sanitization**
    - The combined stream splits into structural tokens using line-by-line inspection (e.g., identifying lines starting with `# ` or `## ` headers).
    - Each keyword is normalized to its canonical form: matching is case-insensitive and full-word aliases collapse to the short keyword (e.g. `# Application` and `# APP` both become `# app`, `## argument` becomes `## arg`). Normalization happens before emission, so the compiled prompt is identical regardless of which spelling was used in the source.
    - The parser actively strips out any `# notes` block at this stage.
    - If a line matching exactly `---` is encountered, the parser truncates the stream for that module instantly, ignoring everything below it.

4. **Token Linking & Emission**
    - The compiler scans all text paths for curly brace variable blocks `{name}`. It verifies that `name` corresponds to a defined `# entity`, `# function`, `# action`, `# app`, `# lib`, `# module`, `# ui`, `# res`, or an asset explicitly designated to be read via `# read`.
    - If verified, it builds internal reference associations so the LLM understands the system dependencies.
    - If a token is unresolvable, compilation breaks immediately with a `ReferenceError`.
    - The compiler wraps the assembled body unconditionally: a **PROMPT HEADER** (role + border contract + assumption protocol) is prepended, and a **PROMPT FOOTER** (pre-implementation verification gate, scope/footprint fence, and the verification checklist) is appended. These wrappers are not triggered by any directive — they exist to keep generated code inside the architecture you declared and to force the model to surface gaps instead of inventing. See the Prompt Mapping Specification for their exact text.
    - Finally, it formats the unified data structures into an ultra-dense, hierarchical markdown prompt layout sent to stdout or a designated prompt payload file.

---

## 2. Crucial Guidelines for HINT Users

To maximize your velocity and get flawless code generation from AI tools, follow these core behavioral guidelines:

### Rule A: Put Environment Setup in the Root

Never copy-paste your `# lang`, `# deps`, or `# build` setups into individual module files. Declare them exactly once in a global `project.hint` file at the root of your project domain or folder structure. The cascade engine guarantees that every sub-file companion inherits these configurations automatically.

### Rule B: Function Contracts Must Be Strict

When mapping out a `# function`, do not lazily skip signature keys. Explicitly write out your `## arg`, `## return`, and `## error` parameters before detailing the `## flow`. Providing strict typing boundaries and explicit error conditions prevents the LLM from writing loose code or guessing error-handling logic.

### Rule C: Code Logic vs. Actions

- Use `# function` when describing traditional implementation logic that is bound to strict inputs, returns, and standard code architecture.
- Use `# action` for wide operational commands, processes, automation workflows, macro tasks, or runtime steps (e.g., invoking `hint CleanAndBuild` to step through a pipeline, or declaring a background task pattern to trigger if a condition is met). Actions are things the LLM should memorize by its name and perform only when prompted.

### Rule D: Capitalize References

Always capitalize your structural entity names (e.g., `# entity UserProfile`) and wrap their references in curly braces `{UserProfile}` throughout your logic flows. This creates explicit semantic hooks that the HINT parser validates and the LLM easily contextualizes.

### Rule E: The Native Fallback Strategy

Always remember that HINT is designed to be **universally readable**. If you are away from your development terminal or working inside a basic LLM chat interface, you can pass a raw `*.hint` file directly to the browser window. Because it is pure Markdown, the model can interpret your design intents and execute requirements flawlessly even without the HINT command-line engine.

### Rule F: Define Borders, Not Implementations

HINT is not Natural Language programming where you describe code in prose. It is a tool for declaring the _borders_ — contracts, constraints, data shapes, prohibitions — and delegating the mechanical fill to the model. Write what must hold true and what must never happen; leave "how to write the loop" to the assistant. The compiled prompt is built to keep the model strictly inside those borders, so the more precisely you fence the scope, the less uncontrolled code you get back. Specify the edges; delegate the interior.

### Rule G: Read the ASSUMPTIONS Block

The compiled prompt forces the model to declare any underspecified clause at the verification gate and to mark every gap-fill inline as an `ASSUMPTION`, collected in a block at the end of its output. Treat that block as a report on your specification, not noise from the model. Each assumption is a place where your `.hint` file was thin enough that the model had to choose. Fold the resolution back into the spec — add the missing type, default, or branch — and the next compile produces tighter code with fewer assumptions. This is how you keep a finger on the pulse without reading every line the model writes.
