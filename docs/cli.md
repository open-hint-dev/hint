# HINT CLI

HINT has one package, `@openhint/cli`, and one executable, `hint`.

```text
hint <path...> [--history | --open] [--json]
hint guide [--json]
hint hypothesis <path> [--text TEXT | --file FILE | --stdin]
hint iteration <path> [--hypothesis ID] [--file FILE | --stdin]
hint notice <path> [--iteration ID] [--text TEXT | --file FILE | --stdin]
hint thesis <path> [--based-on REF] [--supersedes ID] [--file FILE | --stdin]
hint check <path...> [--json]
hint --help
hint --version
```

All write commands also accept `--id ID` and
`--expected-revision SHA256`. Exactly one of `--text`, `--file`, and
`--stdin` may be supplied. Without one, a write command is a read-only
preparation: it prints the destination, current revision, a valid template,
and locally related records. It never opens an editor or prompts.

`--text` creates a minimal record. Hypothesis text becomes the claim;
Notice text becomes the observation; Thesis text becomes guidance and needs
`--based-on`. Iteration uses Markdown payload because it must describe an
action and either link a hypothesis or include its own Claim and Check.
Markdown payload is one complete `##` record as defined in
[format.md](format.md). Command options fill missing link metadata but may
not contradict payload metadata.

For a future file target, pass its intended file path. For a folder scope,
pass an existing directory or a path ending in `/`. HINT reports the exact
companion or `_.hint` destination before a prepared write. It rejects paths
outside the project boundary, including escapes through symlinks.

## Reading

`hint <path...>` prints accepted current Thesis guidance, a short rationale,
its source file, and its `Based-on` reference. For a file, sources are its
companion and every ancestor `_.hint` up to the project root. For a folder,
sources are its own and ancestor `_.hint` files; descendants are not scanned.
Multiple paths deduplicate the same source record by canonical file and ID.

`--history` prints all records in the resolved source files. `--open` prints
only open Hypotheses and Iterations plus proposed Theses. The two flags are
mutually exclusive. An existing scope with no accepted theses succeeds with
an explicit empty result; an unresolved read path exits 2.

The project boundary is the nearest Git worktree root, otherwise the nearest
ancestor containing `.hintrc`, otherwise the current working directory.
`.hintrc` is loaded once from that root. An absent or empty file means:

```yaml
high-quality-mode: false
```

No other keys or value types are valid. Legacy `hint.yml` and `hint.yaml`
cause a migration warning and are never loaded.

## Writing and conflicts

Writes use a same-directory lock and atomic rename. After acquiring the lock,
HINT rereads the file; concurrent writers therefore serialize rather than
overwrite each other. `--expected-revision` compares the lowercase SHA-256
of the exact current bytes (or `missing`) and exits 1 on mismatch. Temporary
or partial content is never the destination. A stale lock is not broken
automatically.

`--id` updates that record. Allowed status transitions are listed in
[workflow.md](workflow.md). A retry with the same ID and canonical content is
successful and does not duplicate it. Updating unknown Markdown is refused
if HINT cannot preserve it safely. Thesis replacement is one atomic file
mutation; cross-file replacement exits 1.

Writing a Notice atomically closes its linked open Iteration. A blocked or
abandoned Notice applies the matching terminal status rather than
`completed`; those outcomes consume no quality attempt. Previously accepted
completed guidance never blocks a later Notice. Its loss of current support
appears as a read warning, a `check` finding, and a NEXT instruction to revisit
the Thesis.

`Attempt` is a unique positive sequence number, not a bounded slot. Blocked
and abandoned Iterations may therefore be followed by Attempt 11 or higher
without consuming quality budget. The CLI refuses a new Iteration only after
ten Iterations for that Hypothesis have actually reached `completed`. It also
refuses a second simultaneously open Iteration. Any open latest Iteration
makes `workflow.quality[].completed` false until its Notice passes.

## Checks, output, and exit codes

`hint check` validates front matter, grammar, IDs, statuses, section and
metadata requirements, links, state transitions expressible in the file,
replacement conflicts, complete criterion-ID evidence, attempt
limit/stagnation, and the latest fingerprints it can recompute. It never
executes commands written in Markdown. A changed or unavailable current
fingerprint is `unknown`, not pass; older fingerprint snapshots remain
historical and are not rewritten.

Text mode reserves stdout for requested records/data and stderr for the first
decisive verdict, warnings, and `NEXT`. JSON mode writes one JSON value to
stdout and no prose there:

```json
{
  "data": {},
  "workflow": {},
  "next_action": null,
  "warnings": []
}
```

Exit `0` means success, `1` validation/check/conflict failure, and `2` usage
or unresolved address. `check` exits 2 when it finds no HINT files. Saving a
Notice successfully says nothing about whether the implementation passed.
