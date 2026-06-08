## [CRITICAL SYSTEM MANDATES]

The following mandates are non-negotiable system-level constraints. Every function, data access pattern, and error path must satisfy all mandates listed here without exception:

- All operations within this module must complete within a strict 200ms latency ceiling.
- Under high-concurrency pressure, graceful degradation routines must default to standard database lookups.
