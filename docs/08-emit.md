# Emit: producing artifacts from specs

`hint emit` renders the artifact a spec produces — TypeScript, Go, a contract document, anything a hintbook has templates for. It is deterministic and model-free: the same spec and the same templates always produce byte-identical output, which is what makes `hint emit --check` an assertion rather than an opinion.

This is the part of HINT that makes **Spec-as-Source** literal rather than aspirational. It is also entirely optional — a repository that only records knowledge never installs an emitter and loses nothing.

```bash
hint emit src/billing/invoice.ts    # write the artifact
hint emit --check                   # CI: what is committed equals what the spec produces
hint emit --stdout src/billing      # preview without touching the working tree
```

---

## The rule that keeps generation precise

**A companion `<file>.hint` is the unit of emission. A folder `_.hint` never emits.**

A companion spec already names exactly one output path — that *is* its target. A folder spec describes everything beneath it and has no single output, so it contributes constraints, not code. This is the same unit `hint lock`, `hint diff`, and `hint verify` already operate on.

| Hint kind | Emits | Role when something below it emits |
| --- | --- | --- |
| `_.hint` (root or folder) | **never** | Supplies inherited constraints to holes; may pin the target for its subtree. |
| `invoice.ts.hint` | yes | The unit. The output path's extension selects the emitter. |
| `agreement.md.hint` | yes | Identical machinery; the document emitter has no holes at all. |
| A block with no template in the selected target | never | Flows into holes as constraint text. |
| A block whose keyword no hintbook defines | never | Passed through as prose, exactly as at render time. |

Three consequences, which together are the whole reason output stays small:

- A root `_.hint` full of `decision` blocks is **not** multiplied into the forty files beneath it. It appears only where a hole needs it — and holes are the only place a model reads anything.
- `decision`, `rule`, and `bad` have no TypeScript template, so they never produce code. That falls out of template lookup; nothing configures it.
- `hint emit src/billing/` means "emit every companion spec beneath this folder", never "emit the folder". A folder argument is expanded to its subtree, because reading it any other way would make every folder argument a dead end.

---

## Emit packs

An emit pack is a hintbook that carries `<keyword>.tmpl` templates instead of `<keyword>.md` instructions. It is distinguished by one field — `target` — and resolves through exactly the same machinery, so registering the vocabulary package also registers every emitter it ships.

```text
hintbook-software-engineer/
  keywords/                    ← the vocabulary
    hintbook.json              { "id": "hintbook-se" }
    entity.md
    func.md
  emit/typescript/             ← an emitter
    hintbook.json              { "id": "emit-se-ts", "target": "typescript", … }
    entity.tmpl
    func.tmpl
  emit/go/
    hintbook.json              { "id": "emit-se-go", "target": "go", … }
    func.tmpl
```

Hintbook resolution globs `**/hintbook.json` recursively, so a project that registers `npm://@openhint/hintbook-software-engineer` picks all of these up with no second list in `hint.yml`. A team wanting a target the vocabulary author never wrote publishes a folder containing only `emit/kotlin/` and registers it alongside.

### The manifest

```json
{
    "id": "emit-se-typescript",
    "target": "typescript",
    "match": ["*.ts", "*.tsx"],
    "comment": "// {text}"
}
```

| Field | Purpose |
| --- | --- |
| `target` | Names the emitter. Its presence is what makes this an emit pack rather than a vocabulary. Overridable per run with `--target`. |
| `match` | Globs matched against the **output** path, so the file extension selects the emitter and the engine never learns a language. A pattern with no `/` matches the basename. Omit it to make the pack selectable only by an explicit `--target`. |
| `comment` | How this target writes a comment, as a `{text}` pattern — `// {text}`, `# {text}`, `<!-- {text} -->`. Used for region markers and for `{doc}`. |
| `symbols` | An external command reporting a file's real symbols as JSON, consumed by `hint verify`. `{file}` is substituted; the path is passed as one argument, never through a shell. A pack may declare only this and carry no templates, making it a pure language adapter. |

An emit pack ships no glossary and defines no vocabulary. It never appears in `hint author` output, never contributes to the `AGENTS.md` glossary, and never shadows an instruction — which matters because hintbook folders resolve in sorted order, and `emit/go` sorts before `keywords`.

---

## Template syntax

Emit templates use the same `{placeholder}` shape as instruction templates, plus what code needs and prose does not.

| Placeholder | Renders |
| --- | --- |
| `{name}` `{id}` `{body}` | The block's name, `{#id}`, and markdown body. |
| `{doc}` | `body` rewrapped as a comment block using the pack's `comment` pattern. |
| `{ident}` `{type}` | `name` split on its **first colon**. `## field total: Decimal` gives both; `## field total` gives an ident and an empty type. |
| `{children}` | Every child that has a template in this target, in document order. |
| `{children:arg}` | Only children whose keyword — or a synonym of it — is `arg`. |
| `{children:arg sep=", "}` | The same, joined by a separator instead of newlines. |
| `{child:result}` | The first such child, or nothing. |
| `{?...}` | An optional group: renders only if every placeholder inside resolves non-empty, otherwise the whole segment vanishes. |
| `{type\|any}` | A literal fallback for when the placeholder is empty. |
| `{hole:body\|<stub>}` | A region the emitter cannot fill. See [Holes](#holes). |

A multi-line expansion is re-indented to the column its placeholder sat on, so a hole written one indent in emits a block one indent in.

**A child keyword only appears if its parent's template asks for it.** Giving `error` a template does nothing unless some template says `{children:error}`. When a keyword describes behaviour rather than a declaration — the software vocabulary's `error` is "throw X when Y" — leaving it without a template is the right choice: it then reaches the implementer as a hole constraint instead.

**Braces that mean themselves are left alone.** A `{` opens a placeholder only when a well-formed expression closes it on the same line, and only when the target defines that name with the right arity. `func f() {`, `type X = { id: string }`, and `` `${x}` `` all pass through untouched.

### A type is always optional

`## arg invoice` is a legitimate spec written by a person. Requiring `## arg invoice: Invoice` would turn authoring back into programming, which is precisely what a `.hint` file exists not to be.

So degradation lives in the **template**, not in a requirement on the author — because how to cope with a missing type is a property of the language, not of the intent:

| Target | Template | `## arg invoice: Invoice` | `## arg invoice` |
| --- | --- | --- | --- |
| TypeScript | `{ident}{?: {type}}` | `invoice: Invoice` | `invoice` |
| Go | `{ident} {type\|any}` | `invoice Invoice` | `invoice any` |

Emit always produces the best artifact the stated intent supports.

### Example

```markdown
# func validateInvoice

Validates an Invoice before persisting.

## arg invoice: Invoice
## arg options
## result: Invoice
```

```text
emit/typescript/func.tmpl
──────────────────────────────────────────────
{doc}
export function {name}({children:arg sep=", "}){?: {child:result}} {
    {hole:body|throw new Error("not implemented");}
}

emit/typescript/arg.tmpl      {ident}{?: {type}}
emit/typescript/result.tmpl   {name}
```

The same machinery on a legal vocabulary needs no holes, no adapter, and no model:

```text
emit/markdown/clause.tmpl     ### {name}\n\n{body}\n\n{children}
emit/markdown/obligation.tmpl {ident} shall {body}
```

---

## Holes

A hole is a region the deterministic emitter provably cannot fill. It is emitted with the constraints that govern it already attached, assembled from the same root-down chain `hint <path>` returns:

```go
func main() (any, error) {
    // Honor:
    //   flow:
    //     1. Read all of stdin and trim surrounding whitespace.
    //     2. If the trimmed payload is empty, emit `PP_EMPTY_INPUT` and stop.
    //     3. Generate the `request_id` (UUID v4 from `crypto/rand`).
    //   error PP_EMPTY_INPUT:
    //     Raised when stdin is empty or whitespace-only. Emit the shared error envelope…
    //   plus the knowledge inherited from ., orchestrator-go — run `hint orchestrator-go/main.go`
    // hint:hole(body) spec=ac816893
    return nil, errors.New("not implemented")
    // hint:end
}
```

The constraint list is **derived, not declared**: it is every block that produces no code in this target. A block with an emit template becomes the artifact; a block without one exists to constrain it. No keyword list is hardcoded, so a new vocabulary needs no changes.

Three rules keep it useful rather than noisy:

- **Scoped to the hole.** Constraints come from the block that owns the hole — recursively, so a `flow` or a declared `error` nested under a `func` is the specification of that function's body — plus the file's own blocks. Not the whole repository.
- **In full, not summarized.** Because the list is scoped, it is a handful of blocks rather than a repository's worth. A `flow` truncated to its first line would be exactly the wrong half.
- **Inherited folder knowledge is named, not inlined.** `hint <path>` already returns that chain in full; reproducing it inside every hole of every file would duplicate the retrieval layer into the artifact, which is the opposite of the reason scoping exists.

**A keyword the hintbook marks `exclude: true` never reaches a hole.** That flag is how a vocabulary says a block must never leave the spec — `notes` is a private scratchpad — and a generated file is the last place that promise may quietly break.

**A hole is addressed by the block that owns it**, not by the label its template uses. Every `func` renders the same `{hole:body}`, so an unqualified label made two functions in one file address the same body — and re-emission wrote one implementation into both while reporting success. The marker carries `<block>:<label>`, and a declared `{#id}` replaces the block part outright, because an id survives a rename and a hole body is the one thing in the artifact that cannot be regenerated.

**A filled hole is never overwritten.** Everything between the marker and `hint:end` belongs to whoever wrote it. The instructions sit *above* the marker precisely so the regenerated header stays outside that span.

`spec=` records a hash of the governing block when the body was written. When the spec later changes, the hashes diverge and `hint emit` says so — the body is still not touched, only flagged:

```
hint: src/invoice.ts — spec changed since body was implemented; re-check the body against it.
```

---

## Guarded regions

The orthodox formulation of spec-as-source fails on contact with reality because it forbids hand-editing the output. Guarded regions dissolve the problem: the generator owns the marked span, the human owns everything else, and both survive regeneration.

```ts
// hint:begin
export interface Invoice { … }
// hint:end

export function settle(invoice: Invoice) {   // hand-written — never touched
    return ledger.settle(invoice);
}
```

| Situation | What happens |
| --- | --- |
| The output does not exist | Created, wrapped in a region. |
| The output exists with a region | The region's contents are replaced; everything outside is preserved. |
| The output exists with **no** region | The file is kept in full and gains a region at the end — adopting a hand-written file never begins by truncating it. |
| A hole body was filled | Carried over verbatim; reported if its governing spec moved. |
| A filled body has nowhere to go | **The write is refused.** The spec block that owned it was removed or renamed, so re-emission would delete work nobody can get back. |

Markers are matched by their token, not by comment syntax, so `//`, `#`, and `<!-- -->` all work.

---

### When an implementation has nowhere to go

```
hint: src/svc.ts — not written: 1 implemented hole(s) have nowhere to go (func settle:body).
      The spec block that owned them was removed or renamed. Restore it, give it a stable {#id}
      so a rename is followed, move the code out of the generated region, or pass --drop-orphans
      to discard it.
```

Exit `1`, and the file is left exactly as it was. Giving a block a stable `{#id}` up front is what makes a rename a non-event: the body follows the id rather than the name.

---

## The lifecycle

What actually happens across a full cycle, and what survives each step:

| Step | Generated declarations | Hole bodies | Code outside the region |
| --- | --- | --- | --- |
| `hint emit` on a new spec | written | stubs | — |
| an agent implements | untouched | **written by the agent** | the agent may add anything |
| the spec changes | — | — | — |
| `hint emit --check` | reports a difference, exit `1` | — | — |
| `hint emit` again | **regenerated** | **preserved**, flagged if their spec moved | **untouched** |

Nothing is rewritten from scratch. An agent revisits only the bodies whose governing spec actually moved — `hint status` lists them as `outdated`, and the emit run names them. A body whose spec is unchanged is never touched and never re-derived.

The one thing that is *not* preserved is code written **inside the generated region but outside a hole**. That space belongs to the emitter. Put hand-written code outside `hint:end`, or give it a hole in the spec.

---

## `--check`

Because the whole operation is a pure function of spec plus existing file, CI can assert that what is committed equals what the spec produces:

```yaml
- run: npx @openhint/cli emit --check
```

The comparison is against the **merged** result, not the raw artifact, so a filled hole is never reported as a difference.

| Result | Exit |
| --- | --- |
| Every artifact matches its spec | `0` |
| An artifact differs, or does not exist | `1`, naming each file |
| No emitter matched, or nothing resolved | `2`, with the reason |

---

## Options

| Option | Effect |
| --- | --- |
| `--check` | Do not write. Exit `1` when an artifact differs from what its spec produces. |
| `--stdout` | Print the artifacts instead of writing them. |
| `--target <name>` | Force an emitter instead of selecting one from the output path. |

Exit codes follow the usual taxonomy: `0` succeeded, `1` a check failed, `2` nothing resolved. A run that matched no emittable spec says which of the three reasons applied — no emitters registered, no emitter for these output paths, or only folder hints matched — rather than reporting a clean build over an empty set.

---

## Knowing what is left

`hint emit` reports hole state for the paths it was given. [`hint status`](06-cli.md#hint-status--what-has-come-loose) does it repository-wide, as part of the same inventory that reports stale and orphaned knowledge:

```
outdated  src/billing/settle.ts     1 implemented hole(s) written against an older spec: body
unfilled  src/billing/refund.ts     1 hole(s) still hold their emitted stub: body
```

Both are **derived, not tracked** — a fresh render supplies the stubs, the file on disk supplies what was written — so there is no bookkeeping file that could itself fall out of date.

There is deliberately no separate hole list in `hint --prompt`. The constraints already sit inline at each hole in the artifact, and copying them into the prompt as well would repeat exactly the duplication that scoping exists to prevent. An agent implementing a hole reads the file it is editing.

---

## Language adapters

Emission produces the shape a spec describes. The other direction — does the file actually contain it? — needs to read the code, and that is the one thing the engine deliberately cannot do.

An adapter is an external command that reports a file's symbols as JSON:

```json
{
    "symbols": [
        { "kind": "function", "name": "settle",
          "params": [{ "name": "invoice", "type": "Invoice" }],
          "returns": "Receipt" },
        { "kind": "interface", "name": "Invoice",
          "fields": [{ "name": "total", "type": "Decimal" }] }
    ]
}
```

`kind` is the adapter's own word for it; nothing in HINT interprets it, so a new language needs no changes here. A member with no `type` is treated exactly like a spec that stated none.

`@openhint/adapter-typescript` is the reference implementation, and `@openhint/hintbook-software-engineer` already declares it. It parses syntactically — no program, no type checker, no `tsconfig` resolution — and reports each type as the annotation the author *wrote*, because that is what a human-written spec can honestly be compared against.

Keeping this external is deliberate. Vendoring a TypeScript, Go, and Python parser into the CLI would multiply its install size and its failure modes, and would put language expertise in the one place that has stayed language-free. Vocabularies are plugins; languages should be too — and an adapter that is missing or broken degrades `verify` to the presence lint rather than to a pass it never established.

---

## `hint extract` — the brownfield on-ramp

Every other part of HINT assumes the spec came first. A repository that did not start that way needs a way in, or adoption means writing every spec by hand — which is why most spec-driven tooling only ever gets used on greenfield work.

```bash
hint extract src/billing          # draft a .hint beside every source file
hint extract --stdout src/a.ts    # preview
hint extract --overwrite src      # replace drafts that already exist
```

It reads the same symbol table `verify` compares against, so a language costs one adapter and gets conformance checking and brownfield adoption together. The emit pack declares how its symbol kinds map onto the vocabulary — the engine knows no keywords, and a template cannot be read backwards:

```json
"extract": {
    "function": "func", "interface": "entity", "class": "entity",
    "type": "entity", "enum": "entity", "const": "data",
    "param": "arg", "field": "field", "result": "result"
}
```

A kind the pack has not mapped is skipped rather than guessed at. An existing `.hint` is knowledge somebody wrote and is left alone unless `--overwrite`.

**What it cannot recover is the half that matters**, and the draft says so in its own preamble: shape is in the code already, and a spec that only restates the code is a copy that will drift. The work after running it is to add the rationale — the decisions, the invariants, the approaches that were tried and abandoned — and delete whatever was already obvious.

---

## Where this sits

Emission is the third rung of the spec-driven ladder, and a repository does not have to pick one rung for all of itself:

| What is on disk | Effective rung | What that buys |
| --- | --- | --- |
| Folder `_.hint` only | knowledge | Retrieval and staleness. |
| Companion spec, no emit template matched | spec-anchored | `verify` and drift against the spec. |
| Companion spec with templates in the target | **spec-as-source** | `emit --check` proves the artifact matches the spec. |

None of this needs configuring — it falls out of what was written. Strictness can be graded per path only because *scope* is per path.

---

- [CLI Reference](06-cli.md) — every command and flag.
- [Hintbooks](05-hintbooks.md) — authoring a vocabulary.
- [Introduction](01-intro.md) — Spec-as-Source, and why the generator is optional.
