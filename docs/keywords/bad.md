# `# bad` — Prohibited Anti-Patterns

**Phase:** F — Guardrails, Few-Shots & Assurances  
**Aliases:** `# antipattern`, `# antipatterns`, `# forbidden`, `# prohibit`  
**Cascade behavior:** Multiple `# bad` blocks across cascade levels are merged into a single `## [PROHIBITED ANTI-PATTERNS]` section in the compiled prompt.

---

## Description

Declares patterns the model is strictly prohibited from implementing under any circumstances. The output uses deliberately aggressive language ("CRITICAL ASSURANCE", "strictly prohibited", "under any circumstances") to activate stronger compliance behavior than polite instructions.

---

## Explanation

The wording of `# bad` is the most aggressive in the entire HINT specification — intentionally so. Explicit prohibition language activates measurably stronger compliance behavior in language models than equivalent content phrased as suggestions or guidelines.

The output prefix also provides a rationale: "These prohibitions exist because of real vulnerabilities and failures in this codebase." This framing matters — it signals to the model that these are not stylistic preferences but hard-won constraints from prior incidents. The model is less likely to rationalize an exception when it understands the prohibition has a history.

Pairs naturally with [`# good`](good.md): `# good` declares what must be done; `# bad` declares what is forbidden.

---

## Example

**Input:**

```markdown
# bad

- Never store active discount values inside a raw browser cookie session; always calculate discounts server-side.
```

**Output:**

```markdown
## [PROHIBITED ANTI-PATTERNS]

CRITICAL ASSURANCE: You are strictly prohibited from implementing the following behaviors under any circumstances. These prohibitions exist because of real vulnerabilities and failures in this codebase — do not reintroduce them:

- Never store active discount values inside a raw browser cookie session; always calculate discounts server-side.
```

---

## Prompt Template

```
## [PROHIBITED ANTI-PATTERNS]

CRITICAL ASSURANCE: You are strictly prohibited from implementing the following behaviors under any circumstances. These prohibitions exist because of real vulnerabilities and failures in this codebase — do not reintroduce them:

{body}
```
