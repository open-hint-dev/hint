import * as Transpiler from '@openhint/transpiler';
import { Command, Option } from 'commander';

import type { EmitOptions } from './commands/emit.js';
import type { ExtractOptions } from './commands/extract.js';
import type { StatusOptions } from './commands/status.js';
import { AddCommand } from './commands/add.js';
import { ApplyCommand } from './commands/apply.js';
import { AuthorCommand } from './commands/author.js';
import { BootstrapCommand } from './commands/bootstrap.js';
import { CompileCommand } from './commands/compile.js';
import { ConfigCommand } from './commands/config.js';
import { DiffCommand } from './commands/diff.js';
import { EmitCommand } from './commands/emit.js';
import { ExtractCommand } from './commands/extract.js';
import { LockCommand } from './commands/lock.js';
import { LintCommand } from './commands/lint.js';
import { RemoveCommand } from './commands/remove.js';
import { SearchCommand } from './commands/search.js';
import { StatusCommand } from './commands/status.js';
import { VerifyCommand } from './commands/verify.js';
import { findCliVersion, VersionCommand } from './commands/version.js';
import { UnresolvedError } from './commands/report.js';
import { runMcpServer } from './mcp.js';

type ContextOptions = {
    strict: boolean;
    force: boolean;
    refs: boolean;
    prompt: boolean;
    standalone: boolean;
};

type AddOptions = {
    local: boolean;
};

// Examples come before options and commands: agents routinely read only the head of a command's output,
// so the most actionable lines have to be the first ones they see.
const EXAMPLES = `Examples:
  hint src/auth/token.ts               what HINT knowledge applies to this path
  hint search "service account auth"   which knowledge covers this intent (JSON)
  hint author src/auth/token.ts        how to write or update a .hint spec
  hint status                          which recorded knowledge has come loose from the code
  hint extract src/billing             draft specs from code that already exists
  hint emit src/billing/invoice.ts     write the artifact this spec produces
  hint emit --check                    CI: every artifact still matches its spec
  hint mcp                             MCP: serve the same read-only engine over stdio
  hint bootstrap                       print a setup prompt for Claude Code, Codex, Cursor, or Copilot
  hint apply                           install HINT instructions into AGENTS.md / CLAUDE.md
  hint version                         CLI version and installed hintbooks

Contracts (optional — only for specs that declare surfaces the code must contain):
  hint verify src/auth/token.ts        check the code contains every declared surface
  hint lock src/auth/token.ts          record a contract snapshot
  hint diff src/auth/token.ts          show which blocks drifted since that snapshot

Exit codes: 0 succeeded · 1 a check failed · 2 nothing matched the given paths.`;

export async function main(): Promise<void> {
    const program = new Command();
    const version = await findCliVersion();

    program.exitOverride();

    program
        .name('hint')
        .description('Return the repository knowledge that applies to a path, for any coding agent to consume.')
        .version(`@openhint/cli ${version}`, '-v, --version', 'print the CLI version')
        .argument('[paths...]', 'paths to source files, folders, or .hint files (globs supported)')
        .option('--prompt', 'wrap the knowledge in a standalone implementation prompt, for piping to a fresh agent', false)
        .option('--strict', 'exit non-zero when a given path has no spec of its own, instead of returning inherited context', false)
        .option('--force', 'ignore hint.lock and regenerate every file, even unchanged ones (affects --prompt; a plain read is never gated)', false)
        .option('--no-refs', 'return only the named specs, not the specs they reference (references are included by default)')
        .option('--standalone', 'implies --prompt, and prepends the tag glossary for an agent that never loaded AGENTS.md', false)
        // Renamed to --strict, which says what it does. Accepted silently so existing scripts keep working.
        .addOption(new Option('--dry-run').hideHelp())
        .action(async (paths: string[], options: ContextOptions & { dryRun?: boolean }) => {
            if (paths.length === 0) {
                program.outputHelp();

                return;
            }

            await CompileCommand.new(paths, {
                strict: options.strict || Boolean(options.dryRun),
                force: options.force,
                refs: options.refs,
                prompt: options.prompt || options.standalone,
                standalone: options.standalone,
            }).execute();
        });

    program
        .command('search')
        .description(
            'Find the knowledge closest to a query — a fast, offline, dependency-free relevance search over ' +
                'every .hint in the project. Prints JSON: the hint file, the path it governs, a score, and ' +
                'whether the match is weak.',
        )
        .argument('<query...>', 'search terms, e.g. service account authentication')
        .option('--limit <n>', 'maximum number of results (use a negative value for no limit)', '20')
        .action(async (query: string[], options: { limit: string }) => {
            const limit = Number(options.limit);

            if (!Number.isInteger(limit)) {
                process.stderr.write(`hint: invalid --limit '${options.limit}' — expected an integer.\n`);
                process.exitCode = 2;
                return;
            }

            await SearchCommand.new(query.join(' '), limit).execute();
        });

    program
        .command('author')
        .description(
            'Print the guidance for writing .hint knowledge: the keyword vocabulary of the registered ' +
                'hintbooks, the file kinds, and the syntax. Read it before creating or editing a spec.',
        )
        .argument('[paths...]', 'target files or folders the .hint specs will describe')
        .option('--json', 'print the installed keyword vocabulary as JSON', false)
        .action(async (paths: string[], options: { json: boolean }) => {
            await AuthorCommand.new(paths, options.json).execute();
        });

    program
        .command('bootstrap')
        .description('Print a self-contained prompt that tells a coding agent how to initialize HINT and configure its MCP client.')
        .action(async () => {
            await BootstrapCommand.new().execute();
        });

    program
        .command('config')
        .description(`Initialize ${Transpiler.CONFIG_FILE_YML} in the project root. Run 'hint apply' afterwards.`)
        .action(async () => {
            await ConfigCommand.new().execute();
        });

    program
        .command('apply')
        .description(
            `Write the HINT instruction block from ${Transpiler.CONFIG_FILE_YML} into AGENTS.md and CLAUDE.md — ` +
                'a deterministic find-and-replace on the <hint> tags. Run it after adding or removing a hintbook.',
        )
        .option('--check', 'do not write; exit 1 when the generated instruction block is missing or differs', false)
        .action(async (options: { check: boolean }) => {
            await ApplyCommand.new(options.check).execute();
        });

    program
        .command('add')
        .description(`Install hintbooks and register them in ${Transpiler.CONFIG_FILE_YML}. Run 'hint apply' afterwards.`)
        .argument('<books...>', 'hintbooks to add: a file:// path, a git repository URL, or an npm package name')
        .option('--local', 'install npm hintbooks into the project-local hintbooks/ store instead of globally', false)
        .action(async (books: string[], options: AddOptions) => {
            await AddCommand.new(books, options.local).execute();
        });

    program
        .command('remove')
        .description(`Remove hintbooks from ${Transpiler.CONFIG_FILE_YML} without uninstalling them. Run 'hint apply' afterwards.`)
        .argument('<books...>', 'hintbooks to remove (the npm:// or file:// prefix may be omitted)')
        .action(async (books: string[]) => {
            await RemoveCommand.new(books).execute();
        });

    program
        .command('extract')
        .description(
            'Draft a .hint spec from code that already exists, using the language adapter of the ' +
                'registered emit packs. Records shape only — the rationale is the half no parser can ' +
                'recover, and the draft says so. Existing specs are left alone unless --force.',
        )
        .argument('<paths...>', 'source files or folders to read')
        .option('--stdout', 'print the drafts instead of writing them', false)
        .option('--overwrite', 'replace a .hint that already exists', false)
        .action(async (paths: string[], options: ExtractOptions) => {
            await ExtractCommand.new(paths, options).execute();
        });

    program
        .command('status')
        .description(
            'Inventory every .hint in the project and report what has come loose from the code it describes: ' +
                'knowledge the code has moved away from, specs whose target was deleted, and drift against hint.lock.',
        )
        .option('--json', 'print the inventory as JSON instead of a table', false)
        .option('--exit-code', 'exit 1 when anything needs attention, for CI', false)
        .action(async (options: StatusOptions) => {
            await StatusCommand.new(options).execute();
        });

    program
        .command('emit')
        .description(
            'Write the artifacts the given specs produce, through the emit templates of the registered ' +
                'hintbooks. Deterministic and model-free. Code outside the generated region and any filled ' +
                'hole body are preserved. Only companion <file>.hint specs emit; a folder hint describes ' +
                'everything beneath it and has no single output.',
        )
        .argument('[paths...]', 'paths to companion specs or the files they describe (globs supported; --check defaults to the whole project)')
        .option('--check', 'do not write; exit 1 when an artifact differs from what its spec produces', false)
        .option('--json', 'with --check, print stable JSON findings', false)
        .option('--stdout', 'print the artifacts instead of writing them', false)
        .option('--target <name>', 'force an emitter instead of selecting one from the output path')
        .option('--drop-orphans', 'write even when an implemented hole has nowhere left to go, discarding it', false)
        .option('--adopt', 'append a generated region to a file that already has content and none', false)
        .action(async (paths: string[], options: { target?: string; check: boolean; json: boolean; stdout: boolean; dropOrphans: boolean; adopt: boolean }) => {
            if (paths.length === 0 && !options.check) {
                process.stderr.write(`hint: emit requires paths unless --check is used.\n`);
                process.exitCode = 2;
                return;
            }

            await EmitCommand.new(paths, {
                target: options.target,
                stdout: options.stdout,
                check: options.check,
                json: options.json,
                dropOrphans: options.dropOrphans,
                adopt: options.adopt,
            }).execute();
        });

    program
        .command('mcp')
        .description('Start the read-only HINT MCP server over stdio from the current project.')
        .action(async () => {
            await runMcpServer(version);
        });

    program
        .command('version')
        .description(`Print the CLI version and the hintbooks registered in ${Transpiler.CONFIG_FILE_YML}, with their versions.`)
        .action(async () => {
            await VersionCommand.new().execute();
        });

    program
        .command('verify')
        .description(
            'Contracts: check that every surface a spec declares appears in the generated file. Deterministic ' +
                'and token-free. Exits 1 on failure, 2 when no file spec matched — so agents and CI can gate on it.',
        )
        .argument('<paths...>', 'paths to companion specs or the files they describe (globs supported)')
        .option('--json', 'print stable JSON findings', false)
        .action(async (paths: string[], options: { json: boolean }) => {
            await VerifyCommand.new(paths, options.json).execute();
        });

    program
        .command('lint')
        .description('Check .hint files for near-miss keywords, broken includes, duplicate ids, and empty specs.')
        .argument('<paths...>', 'hint files, target files, or folders to inspect')
        .option('--json', 'print stable JSON findings', false)
        .option('--strict-vocab', 'treat every unknown keyword as a finding', false)
        .option('--graph', 'also check cross-file references, ids, orphans, and block names', false)
        .option('--strict-graph', 'run graph checks and promote their advisory notes to findings', false)
        .action(async (paths: string[], options: { json: boolean; strictVocab: boolean; graph: boolean; strictGraph: boolean }) => {
            options.graph ||= options.strictGraph;
            await LintCommand.new(paths, options).execute();
        });

    program
        .command('lock')
        .description(
            'Contracts: record the current spec hashes into hint.lock, marking the given files as generated. ' +
                'Later `hint --prompt` runs then skip files whose specs are unchanged; a plain read is never gated. Only companion <file>.hint specs are lockable.',
        )
        .argument('<paths...>', 'paths to companion specs or the files they describe (globs supported)')
        .action(async (paths: string[]) => {
            await LockCommand.new(paths).execute();
        });

    program
        .command('diff')
        .description('Contracts: show which spec blocks have drifted from hint.lock since the code was generated.')
        .argument('<paths...>', 'paths to companion specs or the files they describe (globs supported)')
        .option('--json', 'print stable JSON findings', false)
        .action(async (paths: string[], options: { json: boolean }) => {
            await DiffCommand.new(paths, options.json).execute();
        });

    program.addHelpText('beforeAll', `${EXAMPLES}\n`);

    try {
        await program.parseAsync();
    } catch (error: unknown) {
        const commander = error as { code?: string; exitCode?: number; message?: string };

        if (commander.exitCode === 0) return;

        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`hint: ${message}\n`);
        process.exitCode = error instanceof UnresolvedError ? 2 : 1;
    }
}
