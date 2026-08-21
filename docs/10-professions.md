# Profession hintbooks

HINT uses one engine for many kinds of high-stakes work. A profession hintbook supplies the vocabulary, operating rules, and optional deterministic emit templates; `.hint` files remain plain Markdown scoped to the artifacts they govern.

## Live books

<!-- profession-rows:begin -->
| Family | Profession | Package | What it governs | Demo |
| --- | --- | --- | --- | --- |
| Delivery | Software Engineers | [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer) | Architecture, contracts, data models, and anti-patterns | [demo-pied-piper](https://github.com/open-hint-dev/demo-pied-piper) |
| Law & assurance | Lawyers | [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) | Matters, clauses, obligations, sources, and red lines | [demo-pearson-specter-litt](https://github.com/open-hint-dev/demo-pearson-specter-litt) |
| Analysis & knowledge | Knowledge Librarians | [`@openhint/hintbook-librarian`](https://github.com/open-hint-dev/hintbook-librarian) | Sources, claims, decisions, open questions, and linked topics | [demo-knowledge-wiki](https://github.com/open-hint-dev/demo-knowledge-wiki) |
| Delivery | Business Analysts | [`@openhint/hintbook-business-analyst`](https://github.com/open-hint-dev/hintbook-business-analyst) | Traceable by construction; Rules win over prose; Gaps, not guesses Surfaces: requirement. Internal positions have no emit templates. | [demo-initech-requirements](https://github.com/open-hint-dev/demo-initech-requirements) |
| Delivery | Product Managers | [`@openhint/hintbook-product-manager`](https://github.com/open-hint-dev/hintbook-product-manager) | Stories trace to goals; No invented metrics; Non-goals stay out Surfaces: story, metric. Internal positions have no emit templates. | [demo-hooli-product](https://github.com/open-hint-dev/demo-hooli-product) |
| Delivery | QA Engineers | [`@openhint/hintbook-qa-engineer`](https://github.com/open-hint-dev/hintbook-qa-engineer) | Expected results trace; Negative paths are mandatory; Gherkin emitted, never retyped Surfaces: case. The emit pack contains only derivable structure. | [demo-nakatomi-qa](https://github.com/open-hint-dev/demo-nakatomi-qa) |
| Delivery | Technical Writers | [`@openhint/hintbook-technical-writer`](https://github.com/open-hint-dev/hintbook-technical-writer) | Required sections, emitted; One term, everywhere; Facts from source, not memory Surfaces: page. The emit pack contains only derivable structure. | [demo-pied-piper-docs](https://github.com/open-hint-dev/demo-pied-piper-docs) |
| Law & assurance | Compliance & Risk | [`@openhint/hintbook-compliance-officer`](https://github.com/open-hint-dev/hintbook-compliance-officer) | Owner and evidence for every control; Exceptions expire; No uncited regulation Surfaces: requirement, control. Internal positions have no emit templates. | [demo-wonka-compliance](https://github.com/open-hint-dev/demo-wonka-compliance) |
| Law & assurance | Auditors | [`@openhint/hintbook-auditor`](https://github.com/open-hint-dev/hintbook-auditor) | No finding without evidence; Severity from the scale; Scope is a wall Surfaces: finding. Internal positions have no emit templates. | [demo-wonka-audit](https://github.com/open-hint-dev/demo-wonka-audit) |
| Analysis & knowledge | Data & BI Analysts | [`@openhint/hintbook-data-analyst`](https://github.com/open-hint-dev/hintbook-data-analyst) | One metric, one definition; SQL verified, not trusted; Caveats travel with numbers Surfaces: metric. The emit pack contains only derivable structure. | [demo-dunder-mifflin-bi](https://github.com/open-hint-dev/demo-dunder-mifflin-bi) |
| Analysis & knowledge | Financial Analysts | [`@openhint/hintbook-financial-analyst`](https://github.com/open-hint-dev/hintbook-financial-analyst) | Every input sourced and dated; Scenarios change only declared inputs; Checks fail loudly Surfaces: input, output. Internal positions have no emit templates. | [demo-bluth-finance](https://github.com/open-hint-dev/demo-bluth-finance) |
| Commercial | Procurement | [`@openhint/hintbook-procurement-specialist`](https://github.com/open-hint-dev/hintbook-procurement-specialist) | Weights never reach the RFP; Vendor-neutral by rule; Budget from source only Surfaces: requirement. Internal positions have no emit templates. | [demo-springfield-procurement](https://github.com/open-hint-dev/demo-springfield-procurement) |
| Commercial | Sales & Proposals | [`@openhint/hintbook-proposal-manager`](https://github.com/open-hint-dev/hintbook-proposal-manager) | Claims carry proof; Commitments stay in the envelope; Comply means evidence Surfaces: none. Internal positions have no emit templates. | [demo-monorail-proposal](https://github.com/open-hint-dev/demo-monorail-proposal) |
| Commercial | Customer Support | [`@openhint/hintbook-support-agent`](https://github.com/open-hint-dev/hintbook-support-agent) | Policies never mix across tiers; Verify before disclosure; Unknown is an answer Surfaces: answer. Internal positions have no emit templates. | [demo-vandelay-support](https://github.com/open-hint-dev/demo-vandelay-support) |
| Commercial | Marketing & Brand | [`@openhint/hintbook-marketing-manager`](https://github.com/open-hint-dev/hintbook-marketing-manager) | One brand's rules never leak; Claims carry proof or a flag; Channel limits built in Surfaces: tagline. Internal positions have no emit templates. | [demo-sterling-cooper-brand](https://github.com/open-hint-dev/demo-sterling-cooper-brand) |
| Law & assurance | Policy Analysts | [`@openhint/hintbook-policy-analyst`](https://github.com/open-hint-dev/hintbook-policy-analyst) | No uncited instrument; Evidence and judgment separated; Options use declared criteria Surfaces: regulation, option. Internal positions have no emit templates. | [demo-pawnee-policy](https://github.com/open-hint-dev/demo-pawnee-policy) |
| Operations & learning | Clinical Operations | [`@openhint/hintbook-clinical-operations`](https://github.com/open-hint-dev/hintbook-clinical-operations) | Operations, never judgment; Every route has a source; Red flags first Surfaces: protocol. Internal positions have no emit templates. | [demo-sacred-heart-clinical](https://github.com/open-hint-dev/demo-sacred-heart-clinical) |
| Operations & learning | Educational Designers | [`@openhint/hintbook-instructional-designer`](https://github.com/open-hint-dev/hintbook-instructional-designer) | Alignment you can check; Rubrics consistent by construction; Facts from cited materials Surfaces: objective. Internal positions have no emit templates. | [demo-greendale-courses](https://github.com/open-hint-dev/demo-greendale-courses) |
<!-- profession-rows:end -->

All 18 official profession books, demos, pages, and packages are live. The reader-first setup guides are listed on [openhint.dev/professions.html](https://openhint.dev/professions.html).

## Combining books in one repository

Every official profession book carries the common core documented in [Hintbooks](05-hintbooks.md#common-core-and-composition). HINT resolves a duplicated keyword from the first registered book. Core collisions are safe because their tags, synonyms, and glossary meanings are identical; domain collisions are not automatically equivalent, so order the most task-specific book first:

```yaml
books:
  - npm://@openhint/hintbook-product-manager
  - npm://@openhint/hintbook-software-engineer
```

Use explicit collision-free names where the official books prescribe them: `bizrule`, `testdata`, `unit`, `audittest`, `identify`, and `record`.

## Which book when

- A business analyst book governs traceable requirements and business processes; a product manager book governs outcomes, personas, prioritization, and product trade-offs.
- A compliance book describes the framework, controls, and approved exceptions; an auditor book tests them and reports evidence-backed findings; a policy analyst book compares public-policy options under cited instruments.
- A procurement book publishes the buyer's neutral requirements while keeping evaluation weights internal; a proposal book answers those requirements from an approved offer and proof set.
