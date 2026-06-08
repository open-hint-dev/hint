# `# read` — Run-Time File Reference

**Phase:** C — Context Engineering Directives  
**Syntax:** `# read {glob} as [name]`  
**Contrast with:** [`@include`](include.md) — which splices content at compile time rather than referencing it.

---

## Description

A structural directive that instructs the AI agent to read the specified file(s) from the filesystem at the path given — before writing any code. The compiler emits a `<repository_file>` reference block naming the file and binding it to the author-supplied alias. The file's contents are not embedded in the prompt; the agent is expected to open the path itself.

---

## Explanation

`# read` keeps prompts dense and never stale. Rather than embedding a potentially large or frequently-changing source file into the compiled prompt, HINT emits a structured instruction that tells the model: "go read this file yourself before you start." The model is then expected to mirror the file's existing formatting, export patterns, and error-handling architecture.

The instructional suffix in the output block is critical: it explicitly forbids the model from guessing the file's contents. If the agent has no filesystem access (e.g., a raw paste into a browser chat), the output instructs it to ask for the named file(s) rather than inventing their contents.

**Glob behavior:** When a glob pattern matches multiple files, the `path` attribute contains the pattern and the instruction refers to "the file(s)" in plural.

---

## Example

**Input:**

```markdown
# read {src/infrastructure/logger.ts} as AppLogger

This is the base utility used for error trace logging and system audits. It maps directly to our production cloud monitoring dashboard payloads.
```

**Output:**

```markdown
<repository_file name="AppLogger" path="src/infrastructure/logger.ts">

This is the base utility used for error trace logging and system audits. It maps directly to our production cloud monitoring dashboard payloads.

Before writing any code that touches this reference, open and read the file(s) at the path above and analyze them carefully. Mirror their existing formatting, export patterns, and error-handling architecture. Do not guess at their contents, and do not reimplement what they already provide.

</repository_file>
```

---

## Prompt Template

```
<repository_file name="{name}" path="{resolved-path}">

{body}

Before writing any code that touches this reference, open and read the file(s) at the path above and analyze them carefully. Mirror their existing formatting, export patterns, and error-handling architecture. Do not guess at their contents, and do not reimplement what they already provide.

</repository_file>
```
