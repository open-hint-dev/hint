# Workflow and quality

HINT connects durable guidance to observable work:

1. **Hypothesis** states a scoped claim, a discriminating check, and finish
   conditions. It may also be created after an unexpected Notice.
2. **Iteration** records one bounded action. It links a Hypothesis, or embeds
   a Claim and Check for a short investigation.
3. **Notice** records what happened and the available evidence. It does not
   make the claim true merely by being saved.
4. **Thesis** turns evidence or explicit authority into current guidance. A
   changed conclusion explicitly supersedes the old Thesis without erasing it.

## State transitions

| Record | Initial | Allowed transitions | Terminal |
| --- | --- | --- | --- |
| Hypothesis | `open` | `supported`, `refuted`, `inconclusive`, `abandoned` | all except `open` |
| Iteration | `open` | `completed`, `blocked`, `abandoned` | all except `open` |
| Thesis | `proposed` or `accepted` | `proposed` → `accepted`/`withdrawn`; `accepted` → `superseded`/`withdrawn` | `superseded`, `withdrawn` |
| Notice | n/a | immutable observation; editorial updates retain ID | n/a |

A terminal status is not reopened. To try again, create another Iteration.
An Iteration remains `open` while its action is pending and therefore has no
Notice yet. Saving a linked Notice transitions it atomically: `blocked` and
`abandoned` Results set the matching Iteration status; every other Result
sets `completed`. Only the latter consumes an attempt.
At most one Iteration for a Hypothesis may be open. Starting it makes current
quality incomplete even if an older completed Iteration passed; that older
result remains historical evidence. Completion becomes current again only
after the open Iteration records passing evidence.
Hypothesis verdicts use the linked Notices; conflicting or insufficient
evidence is `inconclusive`, not whichever record appears last. Independent
cycles in one file are related only by explicit IDs.

## NEXT

NEXT is derived for the record just written or explicitly selected cycle:

| State | NEXT |
| --- | --- |
| open Hypothesis, no Iteration | prepare a distinguishing Iteration |
| open Iteration | perform its action, then record a Notice |
| completed Iteration, no Notice | record the observed result and evidence |
| Notice with useful evidence, open Hypothesis | assess the Hypothesis |
| supported Hypothesis, no accepted Thesis | record or accept a Thesis |
| failed/unknown evidence | choose a materially different check or report the blocker |
| new negative evidence after a completed Thesis | revisit, withdraw, or supersede that Thesis |
| accepted Thesis | apply it to the in-scope task; finish only when that task's criteria pass |
| blocked/abandoned/stagnated/limit reached | report that outcome; do not call it success |

Unrelated open cycles never become an obligation. A user decision can be a
Thesis basis (`user:...`) without a fictional experiment. HINT guides the
calling agent but cannot guarantee that an agent continues or has authority
to act.

## High-quality mode

Set `high-quality-mode: true` in the project-root `.hintrc`. The mode applies
consistently to preparation, Iteration, Notice, Thesis, guide, and check.

Before attempt 1, record the goal, required criteria (prefer unique stable
`C-...` IDs), a verification method for each criterion, and a subjective 0–10 score rubric. Changing criteria
later must be stated in the next Iteration with a reason and cannot silently
reduce the task. `Attempt` is a unique positive sequence label for preserved
history, not a budget slot, and may exceed 10 after non-consuming outcomes. A
completed Iteration with its Notice consumes one budget attempt, including
`Result: error`; blocked, abandoned, and open Iterations do not.

A successful quality result requires exactly one evidence row for every
required criterion ID, every row checked and passed, no undeclared or
duplicate IDs, no known material shortcoming, a current non-`unknown` working-tree
fingerprint, and self-reported `Score: 8` or higher. The score is explicitly
subjective. `Score: 10` cannot override a failed criterion.

Only the latest completed Iteration's fingerprints are compared with current
working bytes. Older snapshots remain immutable historical evidence and do
not keep `hint check` red after a newer successful verification. A completed
Thesis can be accepted only from that latest, currently valid Notice; later
changes or negative observations preserve the guidance and its history but
produce a stale-evidence warning on read and a `check` finding. They do not
block recording the new Notice. NEXT directs the agent to revisit the old
Thesis. A new completed Thesis remains forbidden until current evidence passes.

At most ten consumed attempts are allowed per linked Hypothesis or inline
cycle. Once ten Iterations have completed, another Iteration cannot start,
regardless of its sequence label. Two consecutive consumed attempts with the same result, observation,
evidence, and fingerprints are stagnation. The resulting task outcome is
one of `completed`, `blocked`, `limit-reached`, `stagnated`, or `abandoned`.
Only the first is success; cancellation remains abandoned. A Thesis may still
record why an unsuccessful approach failed, but it may not claim that the
user's task completed successfully. The Thesis `Task-outcome` field makes
that distinction explicit and mechanically checkable.

HINT validates reported evidence and fingerprints that refer to available
files. It does not execute verification commands, run a model evaluator, or
turn a self-score into an objective measurement.
