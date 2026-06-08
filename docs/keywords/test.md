# `# test` — Verification & Unit Test Criteria

**Phase:** F — Guardrails, Few-Shots & Assurances  
**Aliases:** `# verify`, `# spec`, `# criteria`  
**Syntax:** `# test [for target]`

---

## Description

Declares explicit test scenarios the model must generate. Every scenario, mock data structure, and assertion listed must appear in the test output — the model is forbidden from omitting any scenario.

---

## Explanation

`# test` is a test-generation contract, not a test runner configuration. It tells the model what test cases must exist and what each must assert. This complements the error-level regression test requirement in [`# function`](function.md) — `# function` mandates one regression test per declared error; `# test` lets you specify additional scenario coverage beyond just the error paths.

The optional `for target` suffix scopes the tests to a named function or component. When provided, it appears in the section header. When absent, the header has no colon or name suffix.

---

## Example

**Input:**

```markdown
# test for applyCoupon

- Expired coupon: assert ExpiredCouponError is thrown when coupon date is in the past.
- Minimum order: assert MinimumOrderValueException is thrown when cart total < coupon threshold.
- Valid coupon: assert returned cart contains applied discount and correct total.
```

**Output:**

```markdown
## [VERIFICATION & UNIT TEST CRITERIA: applyCoupon]

Generate tests that explicitly cover every scenario listed below. Each edge case, mock data structure, and assertion described here must appear in the test output. Do not omit any scenario:

- Expired coupon: assert ExpiredCouponError is thrown when coupon date is in the past.
- Minimum order: assert MinimumOrderValueException is thrown when cart total < coupon threshold.
- Valid coupon: assert returned cart contains applied discount and correct total.
```

**Name-less variant:** `## [VERIFICATION & UNIT TEST CRITERIA]` with no colon or name suffix.

---

## Prompt Template

**With target:**
```
## [VERIFICATION & UNIT TEST CRITERIA: {target}]

Generate tests that explicitly cover every scenario listed below. Each edge case, mock data structure, and assertion described here must appear in the test output. Do not omit any scenario:

{body}
```

**Name-less:**
```
## [VERIFICATION & UNIT TEST CRITERIA]

Generate tests that explicitly cover every scenario listed below. Each edge case, mock data structure, and assertion described here must appear in the test output. Do not omit any scenario:

{body}
```
