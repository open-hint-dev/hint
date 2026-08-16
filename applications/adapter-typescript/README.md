# @openhint/adapter-typescript

The TypeScript **language adapter** for [HINT](https://github.com/open-hint-dev/hint#readme). It reports the symbols a file actually declares, so `hint verify` can check a spec against the *shape* of the code instead of the presence of a name.

```bash
npx @openhint/adapter-typescript src/billing/invoice.ts
```

```json
{
    "symbols": [
        { "kind": "interface", "name": "Invoice", "fields": [{ "name": "total", "type": "Decimal" }] },
        { "kind": "function", "name": "settle", "params": [{ "name": "invoice", "type": "Invoice" }], "returns": "Receipt" }
    ]
}
```

## Registering it

An adapter is declared on an emit pack, which is how a target gains conformance checking without any new concept in the engine:

```json
{
    "target": "typescript",
    "match": ["*.ts", "*.tsx"],
    "symbols": "npx --yes @openhint/adapter-typescript {file}"
}
```

`@openhint/hintbook-software-engineer` ships this already. With it installed:

```console
$ hint verify src/billing/invoice.ts
- src/billing/invoice.ts: 1 conformance failure(s):
    - func settle — parameter 'invoice' is string, spec says Invoice
```

That is a mismatch no presence lint can see: the name is in the file, the shape is wrong.

## Two decisions worth knowing

**Types are reported as written, not as resolved.** The spec says `## arg invoice: Invoice`, written by a person; the honest comparison is against the annotation a person wrote in the code. Resolving `Invoice` to its structural shape would make every such comparison fail for a reason nobody asked about.

**Parsing is syntactic — no program, no type checker, no `tsconfig` resolution.** "What does this file declare?" is answerable from the file alone, so the adapter costs milliseconds and cannot fail because some unrelated file does not compile.

## What it reports

| Declaration | `kind` | Carries |
| --- | --- | --- |
| `function f() {}` | `function` | `params`, `returns` |
| `const f = () => {}` | `function` | `params`, `returns` |
| `interface X {}` | `interface` | `fields` |
| `type X = { … }` | `type` | `fields` |
| `class X {}` | `class` | `fields` (properties) |
| `enum X {}` | `enum` | `fields` (members) |
| `const X: T = …` | `const` | `returns` |

A destructured or computed parameter has no single name a spec could have declared, so it is omitted rather than guessed at.

## Contract

Exit `0` with the JSON on stdout, or non-zero with nothing on stdout when there is no answer. HINT falls back to its presence lint on any failure — never to a pass it did not establish.

Details → [`docs/08-emit.md`](https://github.com/open-hint-dev/hint/blob/main/docs/08-emit.md#language-adapters)

## License

MIT
