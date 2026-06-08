## [ENFORCED CODING DESIGN PATTERNS]

Apply every pattern and practice listed below in all generated code without exception. These are validated, required standards for this codebase — do not substitute alternatives, even equivalent-seeming ones:

- Always wrap DB query logic inside a database transaction to prevent race conditions.
- Ensure all pricing computations operate strictly on whole integers to avoid floating point errors.
