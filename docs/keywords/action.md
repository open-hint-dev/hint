# `# action` — Reusable Automation Macro

**Phase:** E — Reusable Automated Actions  
**Aliases:** `# macro`, `# automation`

---

## Description

Declares a named macro behavior — a workflow command the model must memorize by name token and execute whenever the described trigger conditions are met, or whenever the action name is referenced in another block. Unlike `# function`, which defines a callable with explicit parameters and a return value, `# action` defines a named behavior that fires on conditions.

---

## Explanation

The critical distinction between `# action` and `# function` is how the model treats the name:

- `# function` produces a callable with a signature — the model implements a procedure you call explicitly with arguments.
- `# action` registers a macro behavior — the model registers the name as a referenceable command token. When any other block references `{invalidateSessionCache}`, the model knows to execute the action's described steps at that point.

The "registered as a macro behavior" framing in the output teaches the model that the action name is not just a label — it is a referenceable token. This makes cross-references reliable: `{actionName}` in a `# flow` block will correctly trigger the action's steps rather than being treated as ambiguous prose.

---

## Example

**Input:**

```markdown
# action invalidateSessionCache

Whenever a user logs out, closes their tab explicitly, or completes a checkout sequence, find their session token inside our Redis store and purge it instantly.
```

**Output:**

```markdown
## [REUSABLE AUTOMATION SCRIPTS: invalidateSessionCache]

The following action is registered as a macro behavior. Whenever the described condition is met or this action is referenced by name in other blocks, execute the following steps exactly:

Whenever a user logs out, closes their tab explicitly, or completes a checkout sequence, find their session token inside our Redis store and purge it instantly.
```

---

## Prompt Template

```
## [REUSABLE AUTOMATION SCRIPTS: {name}]

The following action is registered as a macro behavior. Whenever the described condition is met or this action is referenced by name in other blocks, execute the following steps exactly:

{body}
```
