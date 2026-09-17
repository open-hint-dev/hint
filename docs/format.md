# HINT Markdown format v1

HINT files are ordinary UTF-8 Markdown. A companion file is named
`<target>.hint`; a folder file is named `_.hint`. Every HINT file starts with
this exact front matter:

```yaml
---
hint-format: 1
---
```

The parser recognises records only below one of these level-one headings:
`# Current theses`, `# Investigations`, and `# Historical theses`. A record
heading has the form `## <Kind> <ID>: <title>`, where kind and ID prefix are
`Hypothesis H-`, `Iteration I-`, `Notice N-`, or `Thesis T-`. Headings inside
fenced code blocks are prose, not records. Prose may use any language and
inline or fenced Markdown.

Metadata is a contiguous group of `Name: value` lines immediately after a
record heading. Section bodies start with level-three headings. Unknown
metadata and sections are preserved by updates but reported by `hint check`;
unknown level-one sections outside the three managed sections are preserved
and ignored.

## Records

### Hypothesis

Required metadata: `Status`, one of `open`, `supported`, `refuted`,
`inconclusive`, `abandoned`.

Required sections: `Claim`, `Check`, `Scope`, `Finish conditions`.

### Iteration

Required metadata: `Status`, one of `open`, `completed`, `blocked`,
`abandoned`; and either `Hypothesis: H-...` or both inline sections `Claim`
and `Check`. A linked and an inline hypothesis cannot coexist. `Attempt` is a
positive integer, unique within its Hypothesis, and is required in
high-quality mode. It orders history but does not identify one of ten budget
slots, so its value may exceed 10 after blocked or abandoned Iterations.

Required section: `Action`. High-quality mode also requires `Goal`,
`Required criteria`, `Verification`, and `Score rubric` before the first
attempt. New records give each criterion a stable ID and use
`- [ ] C-<id>: <description>`; each verification line reuses that ID and
names how it will be checked. Version 1 also accepts descriptive rows such as
`- [ ] unit tests pass`, matched by their complete normalized description.
IDs or descriptions must be unique within the attempt. `Scope` may narrow the
target but cannot expand the task which invoked HINT.

### Notice

Metadata `Iteration: I-...` links the Notice to an Iteration; it is optional
for an observation-first Notice. `Result` is required and is one of `pass`,
`fail`, `unknown`, `error`, `blocked`, `abandoned`. A Notice has no `Status`: it is an
observation, never an automatic verdict about its hypothesis.

Saving a linked Notice closes an open Iteration in the same atomic write.
`Result: blocked` maps the Iteration to `Status: blocked`, and
`Result: abandoned` maps it to `Status: abandoned`; other Results map it to
`Status: completed`. A completed Iteration must have exactly one Notice. An
open Iteration has no Notice yet, so Scope comparison begins only when the
Notice exists.
Only one Iteration per Hypothesis may be open. While it is open, an older pass
remains in history but cannot establish current completion or support a new
`Task-outcome: completed` Thesis.

Required sections: `Observation` and `Evidence`. `Known shortcomings` is
optional by default. In high-quality mode `Attempt`, `Score` (an integer from
0 through 10), and `Scope` metadata plus `Known shortcomings` and
`Fingerprints` sections are required. Fingerprint rows use
`- path: sha256:<64 lowercase hex>` for current working-file bytes, including
dirty content; unavailable evidence is never a pass. An `error` Notice
consumes the bounded attempt, but is not evidence for or against the claim.
In high-quality mode each Evidence row uses
`- [x] C-<id>: pass|fail|unknown` (or the same full description for a
descriptive criterion). An unchecked box is not passing. Every required key
must occur exactly once; duplicate, missing, or undeclared keys are invalid.

### Thesis

Required metadata: `Status`, one of `proposed`, `accepted`, `superseded`,
`withdrawn`. Required sections: `Guidance` and `Rationale`; accepted theses
also require `Based-on`, containing a Notice ID or an explicit authority such
as `user:<description>` or `decision:<description>`. `Revisit when` is
recommended.

An accepted Thesis may contain `Supersedes: T-...`. The old Thesis is moved,
not copied, to `# Historical theses`, its status becomes `superseded`, and it
gets `Superseded-by`. Both records must be in the same HINT file. A second
replacement of the same Thesis is a conflict. Superseded and withdrawn
Theses must be historical; accepted and proposed Theses must be current.

In high-quality mode an accepted Thesis also records `Task-outcome` as one of
`completed`, `blocked`, `limit-reached`, `stagnated`, `abandoned`,
`unsuccessful`, or `not-applicable`. `completed` is valid only when its Notice
basis leads to current passing quality evidence. This leaves room for durable
guidance about a failed approach without falsely completing the user's task.
If the working bytes later change or newer evidence no longer passes, normal
reads retain the Thesis but warn that its completion evidence is no longer
current. This staleness does not prevent recording the new evidence; `check`
reports it until the Thesis is withdrawn, superseded, or supported again.

## Identity, links, and history

IDs match `[HINT]-[A-Za-z0-9][A-Za-z0-9._-]*`, are unique within a file, and
never change when a record is edited. Links resolve within the selected HINT
file. HINT does not select records by timestamp, infer links from proximity,
load linked Markdown, or search the repository for an ID.

An update with the same ID and byte-equivalent canonical record is
idempotent. Changing the meaning of accepted guidance requires a new Thesis
and `Supersedes`; editorial correction may retain its ID. History remains in
the file and is omitted only from the default read view.

Text outside managed metadata and `###` section bodies is preserved during
record edits and when a Thesis moves to history. Editing a named section
replaces that section body; unrelated prose and comments are not re-rendered.

## Complete example

```markdown
---
hint-format: 1
---
# Current theses

## Thesis T-request-id: Match completion by request identity
Status: accepted
Based-on: N-wrong-waiter
Supersedes: T-route

### Guidance
Match a response to the waiting request ID, not only its route.

### Rationale
Concurrent requests can share a route; the regression check distinguished
their identities.

### Revisit when
The request identity model changes.

# Investigations

## Hypothesis H-route: Route matching completes the wrong waiter
Status: supported

### Claim
A response to another request on the same route completes the first waiter.

### Check
Complete the second request before the first in an isolated concurrency test.

### Scope
Request waiter matching.

### Finish conditions
The test either reproduces the wrong completion or rules it out.

## Iteration I-route-1: Reproduce concurrent completion
Status: completed
Hypothesis: H-route

### Action
Run the isolated concurrent-request regression test.

## Notice N-wrong-waiter: The first waiter completed early
Iteration: I-route-1
Result: pass

### Observation
The first waiter completed with the second request's response.

### Evidence
`request.test.ts`, concurrent request test, failed before identity matching.

# Historical theses

## Thesis T-route: Match completion by route
Status: superseded
Superseded-by: T-request-id

### Guidance
Match a response by route.

### Rationale
The former implementation assumed only one request per route.
```
