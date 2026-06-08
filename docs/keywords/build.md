# `# build` — Compilation & Testing Pipelines

**Phase:** A — Environment Staging  
**Aliases:** `# pipeline`, `# ci`

---

## Description

Declares the shell commands used to compile and test the codebase. All generated code, configuration files, and project structure must remain compatible with these pipelines. The model is forbidden from producing anything that breaks them.

---

## Explanation

`# build` is a compatibility contract, not a tutorial. It does not ask the model to run these commands — it asks the model to keep its output compatible with them. This is especially important when the model generates config files, `tsconfig.json` entries, `package.json` scripts, or test runner setups that could silently break an existing pipeline.

---

## Example

**Input:**

```markdown
# build

- npm run build to compile
- make test to run vitest suites
```

**Output:**

```markdown
## [COMPILATION & TESTING PIPELINES]

The following commands validate this codebase. All generated code, configuration files, and project structure must remain compatible with these pipelines. Do not generate anything that breaks them.

- npm run build to compile
- make test to run vitest suites
```

---

## Prompt Template

```
## [COMPILATION & TESTING PIPELINES]

The following commands validate this codebase. All generated code, configuration files, and project structure must remain compatible with these pipelines. Do not generate anything that breaks them.

{body}
```
