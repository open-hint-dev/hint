## [PROHIBITED ANTI-PATTERNS]

CRITICAL ASSURANCE: You are strictly prohibited from implementing the following behaviors under any circumstances. These prohibitions exist because of real vulnerabilities and failures in this codebase — do not reintroduce them:

- Never store active discount values inside a raw browser cookie session; always calculate discounts server-side.
- Never expose raw database row IDs in API responses; always map to opaque external identifiers.
