import * as Transpiler from '@openhint/transpiler';
import { Command } from 'commander';

import { AddCommand } from './commands/add.js';
import { ApplyCommand } from './commands/apply.js';
import { CompileCommand } from './commands/compile.js';
import { ConfigCommand } from './commands/config.js';
import { InstructCommand } from './commands/instruct.js';
import { RemoveCommand } from './commands/remove.js';
import { VersionCommand } from './commands/version.js';

type CompileOptions = {
    mode?: string;
    dryRun: boolean;
};

type AddOptions = {
    local: boolean;
};

export async function main(): Promise<void> {
    const program = new Command();

    program
        .name('hint')
        .description('Compile HINT specification files into AI-ready implementation prompts.')
        .argument('<paths...>', 'paths to .hint files, their target files, or folders (globs supported)')
        .option('--mode <mode>', 'compile keywords for the given hintbook mode (e.g. fix, review)')
        .option('--dry-run', 'fail on hint files that cannot be resolved instead of skipping them', false)
        .action(async (paths: string[], options: CompileOptions) => {
            await CompileCommand.new(paths, options.mode ?? '', options.dryRun).execute();
        });

    program
        .command('config')
        .description(
            `Initialize ${Transpiler.CONFIG_FILE_YML} in the project root. ` +
                `Run 'hint apply' afterwards to set up AGENTS.md and CLAUDE.md.`,
        )
        .action(async () => {
            await ConfigCommand.new().execute();
        });

    program
        .command('instruct')
        .description(
            `Print an AI agent prompt that sets up AGENTS.md and CLAUDE.md from ${Transpiler.CONFIG_FILE_YML}. ` +
                `The files are not modified directly — pipe the output to your agent to apply it, e.g. 'hint instruct | claude -p --permission-mode acceptEdits'.`,
        )
        .action(async () => {
            await InstructCommand.new().execute();
        });

    program
        .command('apply')
        .description(
            `Write the <hint> block from ${Transpiler.CONFIG_FILE_YML} directly into AGENTS.md and CLAUDE.md — ` +
                `a deterministic find-and-replace on the <hint> tags, no agent needed. Use instead of 'hint instruct | claude -p'.`,
        )
        .action(async () => {
            await ApplyCommand.new().execute();
        });

    program
        .command('add')
        .description(
            `Install hintbooks and register them in ${Transpiler.CONFIG_FILE_YML}. ` +
                `Run 'hint apply' afterwards to refresh AGENTS.md and CLAUDE.md.`,
        )
        .argument('<books...>', 'hintbooks to add: a file:// path, a git repository URL, or an npm package name')
        .option('--local', 'install npm hintbooks into the project-local hintbooks/ store instead of globally', false)
        .action(async (books: string[], options: AddOptions) => {
            await AddCommand.new(books, options.local).execute();
        });

    program
        .command('remove')
        .description(
            `Remove hintbooks from ${Transpiler.CONFIG_FILE_YML} without uninstalling them. ` +
                `Run 'hint apply' afterwards to refresh AGENTS.md and CLAUDE.md.`,
        )
        .argument('<books...>', 'hintbooks to remove, as listed in the books array (the npm:// or file:// prefix may be omitted)')
        .action(async (books: string[]) => {
            await RemoveCommand.new(books).execute();
        });

    program
        .command('version')
        .description(`Print the CLI version and the versions of the hintbooks registered in ${Transpiler.CONFIG_FILE_YML}.`)
        .action(async () => {
            await VersionCommand.new().execute();
        });

    program
        .command('help')
        .description('Show usage for the hint CLI and its commands.')
        .action(() => {
            program.outputHelp();
        });

    program.addHelpText(
        'after',
        `
Examples:
  hint config                                   initialize hint.yml in the project root
  hint apply                                    write AGENTS.md / CLAUDE.md directly from hint.yml
  hint instruct | claude -p --permission-mode acceptEdits   ...or have your agent do it
  hint add @openhint/hintbook-lawyer            install and register a hintbook
  hint remove @openhint/hintbook-lawyer         unregister a hintbook
  hint src/billing/invoice.ts | claude -p       compile the spec for a file and pipe it to an agent
  hint --mode review src/billing | claude -p    audit existing code against the spec
  hint version                                  show CLI and hintbook versions

Piping into 'claude -p' that should write files needs '--permission-mode acceptEdits' (or '--dangerously-skip-permissions').`,
    );

    try {
        await program.parseAsync();
    } catch (error: unknown) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
