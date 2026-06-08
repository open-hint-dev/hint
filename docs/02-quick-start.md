# HINT Quick Start Guide

Get up and running with HINT (Human Intent Native Transpiler) in less than 5 minutes. This guide walks you through setting up your project root baseline, creating a local module companion specification, and compiling high-density AI prompts.

---

## 1. Global Setup (`hint.yml` + root `_.hint`)

Every HINT project has two pieces at its root. A `hint.yml` (or `hint.yaml`) file **marks the project root** and may exclude paths through a gitignore-style `ignore` array. A root-level `_.hint` holds the **global baseline instructions** (`# lang`, `# deps`, `# build`) that every sub-directory and companion file inherits.

Create `hint.yml` in your repository root, then a root `_.hint` next to it:

```yaml
ignore:
    - node_modules/
    - dist/
    - '*.generated.hint'
    - '!src/contracts/generated.hint'
```

Patterns are evaluated relative to the project root in declaration order using gitignore semantics; the last matching pattern wins. Explicit CLI targets do not override ignored paths.

```markdown
# lang

TypeScript (Node.js v22+ / ESM)

# deps

- Express.js for local HTTP service routing
- Zod for runtime request boundary validation
- Avoid bloated external utilities; rely on native JavaScript modules wherever possible.

# build

- npm run build to run tsc compiler checks
- make test to fire local vitest suites
```

---

## 2. Local Setup (Companion Files)

HINT context lives exactly where your code lives. For any script file you intend to create or modify, simply place a companion `*.hint` file right next to it in the directory tree.

Imagine you are building an authentication domain. Inside `src/domain/auth/`, create your target logical contract file named `login.ts.hint`:

```markdown
# read {src/infrastructure/security/tokens.ts} as TokenEngine

This is our core localized encryption wrapper module. It manages jwt token signing operations.

# module loginFlow

This module coordinates the system login sequence and verifies user identities against our security parameters.

# entity Credentials

- username: string (must be an authenticated email pattern)
- password: string (min 8 characters, checked against argon2 hashes)

# function executeLogin

## arg inputs: {Credentials}

The incoming payload from the login route.

## return string

A signed, cryptographically stable bearer session token.

## error InvalidCredentialsException

Thrown if user is missing or password match fails.

## flow

1. Lookup the username in the database to fetch the associated secure profile record.
2. If profile is missing, break early and throw an InvalidCredentialsException.
3. Compare incoming password inputs against the database argon2 password hash field.
4. If comparison checks pass cleanly, pass the profile ID to the {TokenEngine} to sign a token wrapper.
5. Return the resulting string payload back to the client interface buffer.

# good

- Always sanitize username inputs by converting them to lowercase strings before querying.
- Return explicit HTTP status codes (401 Unauthorized) when catching failure states.

# bad

- Never leak structural data details or user existence states in generic failure message returns.

# notes

- TODO: Add support for multi-factor authentication (MFA) redirects inside the flow block next quarter.
```

---

## 3. Compiling the Prompt Payload

HINT does away with complex sub-command boilerplate. To transpile, simply fire the `hint` CLI binary tool directly passing target files, directories, or wild glob patterns:

```bash
# Compile a single file specification
hint src/domain/auth/login.ts.hint

# Compile multiple disjointed specifications simultaneously
hint src/domain/auth/login.ts.hint src/assets/configs/settings.json.hint

# Batch compile all specification file variations using standard terminal glob selectors
hint src/domain/**/*.hint
```

The transpiler immediately initiates its four-stage lifecycle:

1. Locates `hint.yml` to find the project root, then walks the `_.hint` cascade from that root down to your file, loading language, deps, and build parameters.
2. Resolves context directives: inlines any `@include` files, and emits read instructions for each `# read` (e.g. directing the model to read the `{TokenEngine}` source) without embedding their contents.
3. Chains local data entities, rule sets, and function constraints, dropping `# notes` scratchpads dynamically.
4. Validates cross-referenced tokens and wraps the result in a border contract — a header that fences the model to your architecture and forbids unspecified scope, and a footer that makes the model verify every clause and surface any assumptions before it writes code — then prints the optimized markdown prompt directly to `stdout`.

---

## 4. Bypassing the CLI (The Native Fallback)

If you are traveling, working away from your dev terminal, or interacting with a basic LLM browser interface (like Claude Web or ChatGPT), **you do not need the HINT CLI**.

Because your `login.ts.hint` and `_.hint` specifications are written in pure standard Markdown, you can copy, paste, or upload the raw text profiles straight to the AI chat window. The assistant will naturally interpret your strict structural intent boundaries out-of-the-box.
