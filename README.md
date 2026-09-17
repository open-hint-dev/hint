# HINT

HINT is path-scoped research memory for coding agents. It keeps a connected
**Hypothesis → Iteration → Notice → Thesis** record in ordinary Markdown, then
returns only the accepted guidance that applies to a path.

```console
npm install --global @openhint/cli
hint guide
hint src/waiter.ts
```

A file's knowledge lives in `<file>.hint`. A folder's `_.hint` applies to that
folder and its descendants. A normal read includes the file companion and
ancestor folder files, but not unrelated history or descendant folders.

```markdown
---
hint-format: 1
---
# Current theses

## Thesis T-request-id: Match by request identity
Status: accepted
Based-on: N-race

### Guidance
Match responses to the waiting request ID, not only their route.

### Rationale
Concurrent requests can share a route.

# Investigations

# Historical theses
```

## Write a cycle

Run any write command without payload to see its exact destination, current
revision, and template. It does not prompt or open an editor.

```console
hint hypothesis src/waiter.ts --text "Route matching may complete the wrong waiter"
hint iteration src/waiter.ts --file iteration.md
hint notice src/waiter.ts --iteration I-race --file notice.md
hint thesis src/waiter.ts --based-on N-race --file thesis.md
```

`--file` and `--stdin` accept one complete record. `--id` updates a record;
`--expected-revision` prevents stale writes. Writes serialize through a
same-file lock and publish with atomic rename. `hint check <paths>` validates
the format, links, state, evidence, and optional working-file fingerprints.

## High-quality mode

An optional project-root `.hintrc` enables stronger evidence rules:

```yaml
high-quality-mode: true
```

Before attempt one, record the goal, required criteria with stable `C-...`
IDs, verification methods and one evidence result for every criterion,
and a subjective score rubric. Success requires current evidence for every
criterion, no material shortcoming, and a score of at least 8. A maximum of
ten completed attempts and stagnation detection bound the loop; neither turns
failure into success. Blocked and abandoned Notices apply the same Iteration
status and consume no attempt. Later negative evidence is preserved and marks
an older completed Thesis as needing review. A newer open Iteration likewise
keeps current completion false until its evidence passes. Attempt numbers
order history; the limit counts completed Iterations, not their numeric value.
HINT never executes commands from
Markdown or calls an evaluator model.

## Commands and documentation

```text
hint <path...> [--history | --open] [--json]
hint guide
hint hypothesis|iteration|notice|thesis <path> [...]
hint check <path...> [--json]
```

- [CLI reference](docs/cli.md)
- [Markdown format](docs/format.md)
- [Workflow and quality](docs/workflow.md)
- [Breaking migration](docs/migration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Independent-agent event redelivery demo](https://github.com/open-hint-dev/hint-demo)

HINT requires Node.js 24 or newer. It works without Git, configuration,
network access, or any external knowledge package. License: MIT.
