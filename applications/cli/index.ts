import { ErrorCode, is } from '@openhint/transpiler';

import { executeClaude } from './commands/claude.js';
import { executeCodex } from './commands/codex.js';
import { executeConfig } from './commands/config.js';
import { executeDefault } from './commands/default.js';
import { executeValidate } from './commands/validate.js';

const KNOWN_COMMANDS = ['validate', 'claude', 'codex', 'config'] as const;

function printUsage(): void {
    process.stderr.write(
        `Usage: hint [command] [file ...]

Commands:
  (default)  Compile .hint files and write the prompt to stdout.
  validate   Compile .hint files and prepend a spec-review directive instead of an implementation directive.
  claude     Compile .hint files and pipe the prompt to the claude CLI (--print mode).
  codex      Compile .hint files and pipe the prompt to the codex CLI.
  config     Add HINT CLI integration instructions to AGENTS.md and CLAUDE.md at the project root.

Arguments:
  file    Path to a .hint file or to the source file whose companion .hint should be compiled.
          Accepts multiple paths and standard shell glob patterns.
          Not required for the config command.

Examples:
  hint src/domain/auth/login.ts
  hint src/domain/auth/login.ts.hint
  hint src/domain/**/*.hint
  hint validate src/domain/auth/login.ts.hint
  hint claude src/domain/auth/login.ts.hint
  hint codex src/domain/auth/login.ts.hint
  hint config
`,
    );
}

function parseArgv(argv: string[]): { command: string | undefined; filePaths: string[] } {
    const first = argv[0];
    if (first !== undefined && (KNOWN_COMMANDS as ReadonlyArray<string>).includes(first)) {
        return { command: first, filePaths: argv.slice(1) };
    }
    return { command: undefined, filePaths: argv };
}

async function run(filePaths: string[], command: string | undefined): Promise<void> {
    if (command !== 'config' && filePaths.length === 0) {
        printUsage();
        process.exit(1);
    }

    if (command === 'config' && filePaths.length > 1) {
        printUsage();
        process.exit(1);
    }

    try {
        if (command === 'config') {
            await executeConfig(filePaths[0]);
            process.exit(0);
        }

        if (command === 'claude') {
            await executeClaude(filePaths);
            process.exit(0);
        }

        if (command === 'codex') {
            await executeCodex(filePaths);
            process.exit(0);
        }

        let result: string;
        if (command === 'validate') {
            result = await executeValidate(filePaths);
        } else {
            result = await executeDefault(filePaths);
        }

        if (result !== '') {
            process.stdout.write(`${result}\n`);
        }
        process.exit(0);
    } catch (error: unknown) {
        if (is(error, ErrorCode.REFERENCE_ERROR)) {
            process.stderr.write(`Reference error: ${error.message}\n`);
        } else if (is(error, ErrorCode.PARSE_ERROR)) {
            process.stderr.write(`Parse error: ${error.message}\n`);
        } else if (is(error, ErrorCode.IO_ERROR)) {
            process.stderr.write(`IO error: ${error.message}\n`);
        } else {
            process.stderr.write(`${String(error)}\n`);
        }
        process.exit(1);
    }
}

const { command, filePaths } = parseArgv(process.argv.slice(2));
void run(filePaths, command);
