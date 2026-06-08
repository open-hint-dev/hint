## [ENVIRONMENT RUNTIME & LANGUAGE]

Write all code strictly targeting the following language specification. Apply the correct module syntax, standard library APIs, and runtime-specific idioms throughout. Do not use syntax, features, or tools that do not belong to this target.

TypeScript (Node.js v22+ / ESM)

### Approved Dependency Whitelist

You are strictly forbidden from installing or importing any package outside of this list:

- Prisma ORM for database connectivity
- Redis client for ephemeral session state
- Avoid heavy external math libraries; use native integer arithmetic.
