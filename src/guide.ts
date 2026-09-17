export const GUIDE = `# HINT agent protocol

HINT keeps path-scoped research as readable Markdown. Once per session, read
this guide. Before changing files, run \`hint <paths>\` and apply the accepted
Theses that are relevant to the user's task.

The cycle is Hypothesis → Iteration → Notice → Thesis:

1. State a bounded, testable Hypothesis with scope and finish conditions.
2. Run one Iteration that could distinguish the claim from alternatives.
3. Record a Notice: observable result, evidence, and known gaps. Saving a
   Notice does not make the work successful.
4. Turn sufficient evidence or an explicit user decision into a Thesis.
   Accepted Theses are current guidance. Replace changed guidance explicitly
   with Supersedes so history and rationale remain available.

Use \`<file>.hint\` for one file and \`_.hint\` for a folder subtree. A normal
read returns only accepted guidance from the companion and ancestor folder
files. Use \`--open\` for active work and \`--history\` for the full record.

Run a write command without payload to get the exact destination, revision,
and template. Supply one of \`--file\`, \`--stdin\`, or (where supported)
\`--text\`. Use \`--id\` plus \`--expected-revision\` to update safely. Follow
the returned NEXT only inside the current user task and your authority. An
unrelated open cycle is not your task. Stop and report blocked, abandoned,
stagnated, or limit-reached states honestly.

When high-quality mode is enabled in \`.hintrc\`, define goal, required
criteria with stable \`C-...\` IDs, verification for every ID, and a subjective
0–10 rubric before attempt 1. Each Notice records exactly one result for every
required ID, current working-file fingerprints, shortcomings, and score.
Success needs every required criterion passed, current evidence, no
material gap, and score at least 8. Ten completed attempts is the limit; an
error is recorded but is not evidence that a claim is false. A blocked or
abandoned Notice gives its Iteration the same terminal status and consumes no
attempt. New negative evidence is preserved even when an older Thesis claimed
completion: revisit that Thesis before claiming success again.
An open newer Iteration also makes completion pending until its Notice passes.
Attempt numbers uniquely order history; only completed Iterations consume the
ten-attempt budget, so blocked and abandoned records do not occupy slots.

HINT never executes commands from Markdown, runs an LLM evaluator, or proves
that a stored claim is true. Continue the actual task until its own finish
conditions pass. If the CLI is unavailable, read and edit the same companion
and ancestor Markdown files directly, preserving IDs, links, and history.`;
