# Knowledge repositories

HINT can be the engine of a persistent team wiki, not only a specification layer beside code. In a knowledge repository the `.hint` files are the maintained artifact: agents ingest sources into typed topics, retrieve only the topics relevant to a question, and lint the links that make the wiki compound over time.

The official [`@openhint/hintbook-librarian`](https://github.com/open-hint/hintbook-librarian) supplies this domain: provenance, concepts, entities, evidence-backed claims, decisions, open questions, supersession, chronology, and typed cross-links. Its prompts address a knowledge reader and maintainer rather than a software implementer.

## Repository shape

```text
_.hint                         # index and repository-wide knowledge
hint.yml
raw/
  source-a.md                  # immutable source material
  source-a.md.hint             # provenance and notes about that source
wiki/
  attention/_.hint             # one topic
  transformers/_.hint          # another topic
```

Use `wiki/<topic>/_.hint` for topics. Folder hints make the topic path directly queryable and allow sections below it to inherit topic framing. Keep original material under `raw/`; do not silently rewrite a source after it has been ingested. A root `_.hint` acts as the index and records policies that govern every topic.

Initialize the repository:

```bash
npx -y @openhint/cli config
npx -y @openhint/cli add --local @openhint/hintbook-librarian
```

Then set the repository profile and, optionally, a reference depth guard:

```yaml
repo: knowledge
refs_depth: 2
books:
  - npm://@openhint/hintbook-librarian
```

Run `npx -y @openhint/cli apply` after registering the book.

## Ingest, query, lint

**Ingest.** Add the source under `raw/`, create its companion `.hint`, and update every affected topic. Claims name their evidence; a changed conclusion supersedes the old claim instead of erasing history.

**Query.** Start with `hint search "question or intent"`, then read useful targets with `hint wiki/<topic>`. A path-shaped `relates` block includes the referenced topic through the normal reference closure. `refs_depth` limits this breadth-first traversal; omitted references are always named on stderr.

**Lint.** Run `hint lint . --graph`. The graph pass reports dead references, unreferenced target-less hints, ids duplicated across files, and duplicate or near-miss block names. These are advisory notes by default. Use `--strict-graph` to promote them to findings and exit `1` in CI.

`repo: knowledge` changes ergonomics, not the exit taxonomy: a missing topic still exits `2`, but stderr adds nearest search results; status suppresses target-less `pending` noise; code-oriented staleness advisories are disabled. Without the profile, all existing code-repository behavior is unchanged.

## What the contract commands mean here

Usually, nothing. A knowledge repository does not have generated code targets, and the librarian vocabulary declares no verifiable surfaces. Do not run `verify`, `lock`, `diff`, `emit`, or `extract` unless the repository deliberately adds another hintbook that defines such an artifact workflow.

## Migrating a Markdown wiki

1. Move immutable inputs into `raw/` without rewriting them.
2. Create `wiki/<topic>/_.hint` topics around durable concepts, not around a temporary task list.
3. Convert factual prose into evidence-backed claims and preserve unresolved conflicts as open questions.
4. Replace informal links with path-shaped `relates` blocks, then run `hint lint . --graph`.
5. Add the root index last, after the topic boundaries have emerged from real material.

The Markdown remains readable and reviewable in git. HINT adds scoped inheritance, deterministic retrieval, domain synonyms, bounded link closure, and structural graph checks; it does not introduce a database, embedding index, or network dependency.
