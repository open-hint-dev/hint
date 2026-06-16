import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import { openTerminal } from '../terminal.js';
import type { ICommand } from './command.js';

export class ConfigCommand implements ICommand {
    static new(): ConfigCommand {
        return new ConfigCommand();
    }

    async execute(): Promise<void> {
        const projectRootPath = (await Transpiler.findProjectRoot(process.cwd())) ?? process.cwd();
        const existing = await Transpiler.loadConfig(projectRootPath);

        if (existing) {
            process.stdout.write(`${Transpiler.CONFIG_FILE_YML} already exists in ${projectRootPath}\n`);
        } else {
            await initConfig(projectRootPath);
        }

        process.stdout.write(`Run 'hint apply' to set up AGENTS.md and CLAUDE.md.\n`);
    }
}

async function initConfig(projectRootPath: string): Promise<Transpiler.ConfigData> {
    const defaultName = Path.basename(projectRootPath);

    const config: Transpiler.ConfigData = process.stdin.isTTY
        ? await askConfig(defaultName)
        : {
              name: defaultName,
              description: '',
              books: [],
          };

    await Transpiler.saveConfig(projectRootPath, config);
    process.stdout.write(`Created ${Transpiler.CONFIG_FILE_YML} in ${projectRootPath}\n`);

    return config;
}

async function askConfig(defaultName: string): Promise<Transpiler.ConfigData> {
    const terminal = openTerminal();

    try {
        const name = (await terminal.ask(`Project name (${defaultName}): `)).trim() || defaultName;
        const description = (await terminal.ask('Project description: ')).trim();

        return {
            name,
            description,
            books: [],
        };
    } finally {
        terminal.close();
    }
}
