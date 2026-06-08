# `# notes` and `---` — Stripped / Ignored

**Phase:** Compiler Stripped  
**Aliases for `# notes`:** `# note`, `# comment`, `# todo`, `# fixme`, `# draft`

---

## Description

Both `# notes` and `---` (the horizontal rule used as a termination marker) are stripped entirely by the compiler. No prompt output is produced. Neither reaches the AI.

---

## Explanation

### `# notes`

The developer's private scratchpad. Any content under a `# notes` block is visible to human readers of the `.hint` file but is completely invisible in the compiled prompt. Use it for:

- Reminders to yourself about decisions not yet made
- Links to tickets, PRs, or discussion threads
- Rough drafts of content that isn't ready to be compiled
- Implementation notes that belong in a PR description, not the AI prompt

This is the escape hatch that keeps `.hint` files self-documenting without polluting the compiled output.

### `---`

The explicit termination marker. Everything below a `---` in the same file is ignored by the compiler. This is useful for:

- Appending reference material at the bottom of a `.hint` file (API docs, schema dumps, copy-paste snippets) without having them compiled into the prompt
- Marking a clean boundary between the active spec and archived/historical content

---

## Behavior

```markdown
# notes

This is invisible in the compiled prompt. The compiler reads it and discards it.
Any amount of content here — links, drafts, reminders — is stripped before compilation.
```

```markdown
---

Everything below this line is ignored. The compiler stops here.
No content below a bare --- horizontal rule appears in the compiled prompt.
```

Both are compiler no-ops. They exist purely for human authoring ergonomics.
