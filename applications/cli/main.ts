import * as Transpiler from '@openhint/transpiler';
import { Command } from 'commander';

import { CompileCommand } from './commands/compile.js';
import { ConfigCommand } from './commands/config.js';
import { InstallCommand } from './commands/install.js';

type CompileOptions = {
    mode?: string;
    dryRun: boolean;
};

type InstallOptions = {
    global: boolean;
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
            `Initialize ${Transpiler.CONFIG_FILE_YML} and print an AI agent prompt that sets up AGENTS.md and CLAUDE.md. ` +
                `The files are not modified directly — pipe the output to your agent to apply it, e.g. 'hint config | claude -p'.`,
        )
        .action(async () => {
            await ConfigCommand.new().execute();
        });

    program
        .command('install')
        .description(`Install hintbooks and register them in ${Transpiler.CONFIG_FILE_YML}.`)
        .argument('<books...>', 'hintbooks to install: a file:// path, a git repository URL, or an npm package name')
        .option('-g, --global', 'install npm hintbooks globally', false)
        .action(async (books: string[], options: InstallOptions) => {
            await InstallCommand.new(books, options.global).execute();
        });

    try {
        await program.parseAsync();
    } catch (error: unknown) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
