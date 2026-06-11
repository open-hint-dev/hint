# Hintbooks: The Keyword Vocabulary

A **hintbook** is an installable package of instruction templates that gives `.hint` keywords their meaning. The transpiler core has no built-in vocabulary — every keyword you write in a heading is rendered by an instruction from a hintbook registered in `hint.yml`.

Hintbooks are also how HINT adapts to a profession: the same core compiles software specifications or legal documents depending on the vocabulary you register. A hintbook is one profession's (or one team's) answer to the question "what may be declared, and what does the AI owe each declaration?"

This document covers using hintbooks, authoring your own, and distributing them.

---

## Using hintbooks

Register books in the `books` array of `hint.yml` — or let `hint install` do it for you:

```yaml
books:
    - npm://@openhint/hintbook-software-engineer
    - file://hintbooks/team-conventions
```

- `file://<path>` — a folder, resolved relative to the project root.
- `npm://<name>` — an npm package, resolved through the project's `node_modules` first, then global installs.
- A bare path behaves like `file://`.

A book entry points at a **base directory**; every directory inside it containing a `hintbook.json` is loaded as a hintbook. One entry can therefore provide a whole collection.

When several hintbooks define the same keyword, the first one in `books` order wins.

## Anatomy of a hintbook

```
my-hintbook/
├── hintbook.json          ← identity: marks this folder as a hintbook
├── __system__.md          ← tag glossary, injected into AGENTS.md / CLAUDE.md by `hint config`
├── __header__.md          ← role definition that opens every compiled prompt
├── __footer__.md          ← closing checklist that ends every compiled prompt
├── __header__.fix.md      ← header for `--mode fix`
├── __footer__.fix.md
├── __file__.md            ← wrapper for companion hint files
├── __folder__.md          ← wrapper for folder hints (_.hint)
├── entity.md              ← keyword instruction
├── flow.md
└── ...
```

### hintbook.json

The discovery marker and identity:

```json
{
    "id": "my-hintbook",
    "description": "What this vocabulary is for"
}
```

A folder without `hintbook.json` is not a hintbook — resolution and `hint install` validation both key on this file.

### Instruction files

Every `*.md` file is one instruction. The file name is the keyword; the content is the template rendered for blocks using it:

```markdown
<data_structure name="{name}" id="{id}">

{body}

{children}

</data_structure>
```

Four placeholders are available — `{id}`, `{name}`, `{body}`, and `{children}` (the block's already-rendered child blocks). Every occurrence is replaced.

**The HTML-like tags are a convention, not a requirement.** An instruction is a pure markdown file, and the compiler does nothing but placeholder replacement — a template can be plain prose just as well:

```markdown
The section "{name}" must state the following, exactly and completely:

{body}

{children}
```

The official books wrap output in named tags because explicit delimiters and a glossary work well for AI agents — if you use tags, document them in `__system__.md` so the agent treats them as binding directives rather than decoration. But no part of authoring a hintbook involves code: if you can write a markdown document, you can build the vocabulary for your profession. HINT is for professionals, not just programmers — a lawyer, an analyst, or an editor can author and publish a hintbook without any programming experience.

### Front matter metadata

Instructions accept YAML front matter:

```markdown
---
synonyms:
    - application
exclude: false
---

<application_context name="{name}" id="{id}">
...
```

| Key        | Effect                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `synonyms` | Additional keywords that resolve to this instruction (`# application` → `app.md`).                                              |
| `exclude`  | When `true`, blocks with this keyword are dropped from the output entirely — children included. Useful for spec-internal notes. |

### Modes

A `.{mode}.md` suffix in the file name assigns an instruction to a mode: `__header__.fix.md` is the `__header__` instruction of the `fix` mode. No suffix means the default mode, `compile`.

At compile time, lookup tries the requested mode first and falls back to the default — so a mode only needs to override what actually differs (typically the header and footer; keyword templates are usually shared).

### Running instructions

Names of the form `__name__` are **running instructions** — structural slots the compiler and tooling fill, resolved through the same lookup as keywords:

| Name         | Role                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `__header__` | Opens the compiled prompt: the agent's role and operating rules for the mode.                                                                          |
| `__footer__` | Closes the prompt: verification checklist and report format.                                                                                           |
| `__file__`   | Template wrapping each companion hint file; `{name}` is the target path, `{body}` the file preamble, `{children}` the rendered blocks.                 |
| `__folder__` | Same for folder hints; `{name}` is the folder path (`.` for the project root).                                                                         |
| `__system__` | Not used during compilation — `hint config` emits it for the agent context files (AGENTS.md / CLAUDE.md). Put the tag glossary and reading rules here. |

## Authoring guidelines

- **One concept per keyword.** Small, sharply-defined vocabulary beats a sprawling one — every keyword is something a spec author must remember and an agent must obey.
- **Make templates binding.** Render into explicit tags with imperative bodies ("implement exactly", "do not rename") and define each tag in `__system__.md` in the same authoritative voice.
- **Keep `{children}` in every structural template.** Forgetting it silently swallows nested blocks.
- **Short keywords, generous synonyms.** `dep` with synonyms `deps`, `dependency`, `dependencies` keeps specs natural to write.
- **Test against real specs.** Compile representative `.hint` files and read the output as if you were the agent.

## Distributing

A hintbook is just files — distribute it any way `hint install` can fetch it:

```bash
hint install @openhint/hintbook-lawyer                   # npm (use -g for a global install)
hint install https://github.com/acme/hintbooks-platform   # git → cloned into hintbooks/<repo>
hint install file://hintbooks/team-conventions            # local folder, validated only
```

For npm distribution, publish the package with `hintbook.json` and the keyword files included (an `keywords/` subfolder is conventional). For git, any repository containing hintbooks works — every `hintbook.json` in the clone is discovered.

## Reference implementations

- [`@openhint/hintbook-software-engineer`](https://github.com/open-hint-dev/hintbook-software-engineer) is the official general-purpose vocabulary and the best example to copy from: ~30 keywords across data, behavior, UI, and constraint declarations, three modes, and a complete system glossary.
- [`@openhint/hintbook-lawyer`](https://github.com/open-hint-dev/hintbook-lawyer) shows the same machinery applied outside software entirely — legal document drafting with `party`, `clause`, `obligation`, and red-line vocabulary. Use it as the template when your domain is not code.
