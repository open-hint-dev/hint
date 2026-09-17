# Migration from HINT 1.x

HINT 2 is a breaking replacement, not a compatibility layer. The old
Spec-as-Source engine, hintbooks, `hint.yml`, remote imports, MCP server,
search, emit/extract, contracts, status/staleness, lock/diff, editor extension,
and workspace packages are removed.

Keep the durable conclusions from an old `.hint`, but rewrite them as accepted
Theses with a concise Guidance and Rationale. Do not mechanically promote old
templates, generated shapes, task status, or unverified assertions. Keep old
evidence as linked Notices when it remains useful.

Replace agent setup with the short protocol in `AGENTS.md`. Delete `hint.yml`
and optionally create `.hintrc` with only `high-quality-mode: true|false`.
There is no runtime hintbook or external knowledge repository to install.

Published 1.x npm artifacts and Git history remain available; the 2.x CLI
does not execute their APIs or commands.
