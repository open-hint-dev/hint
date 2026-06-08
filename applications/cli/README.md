# @openhint/cli

Compile HINT specification files into AI-ready implementation prompts and dispatch them to AI coding agents.

**Requirements:** Node.js 22 or newer.

## Installation

```sh
npm install -g @openhint/cli
```

Or run without installing:

```sh
npx @openhint/cli <file>
```

## Usage

```
hint [command] [file ...]
```

### Commands

| Command | Description |
|---|---|
| *(default)* | Compile `.hint` files and write the prompt to stdout. |
| `validate` | Compile and prepend a spec-review directive — prompts the AI to critique the spec rather than implement it. |
| `claude` | Compile and pipe the prompt to the `claude` CLI (`--print` mode). |
| `codex` | Compile and pipe the prompt to the `codex` CLI via stdin. |
| `config` | Append HINT integration instructions to `AGENTS.md` and `CLAUDE.md` at the project root. |

### Examples

```sh
# Compile a single spec and write the prompt to stdout
hint src/domain/auth/login.ts

# Review a spec before implementing
hint validate src/domain/auth/login.ts.hint

# Compile and send directly to Claude
hint claude src/domain/auth/login.ts.hint

# Register HINT with AI agent config files
hint config
```

## Links

- [Documentation](https://github.com/neprel/hint)
- [HINT Syntax Reference](https://github.com/neprel/hint/blob/main/docs/03-syntax.md)
- [Issues](https://github.com/neprel/hint/issues)

## License

MIT
