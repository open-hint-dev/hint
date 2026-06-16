import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { AGENT_FILE_NAMES, buildHintBlock, collectHintbookSections, HINT_TAG } from './instruct.js';

const HINT_BLOCK_PATTERN = new RegExp(`<${HINT_TAG}>[\\s\\S]*?<\\/${HINT_TAG}>`);

type Target = {
    path: string;
    name: string;
    strip: boolean;
};

export class ApplyCommand implements ICommand {
    static new(): ApplyCommand {
        return new ApplyCommand();
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());
        const config = projectRootPath ? await Transpiler.loadConfig(projectRootPath) : null;

        if (!projectRootPath || !config) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const block = buildHintBlock(await collectHintbookSections(projectRootPath, config));

        for (const target of await resolveTargets(projectRootPath)) {
            const message = target.strip ? await stripHintBlock(target) : await writeHintBlock(target, block);

            if (message) {
                process.stdout.write(`${message}\n`);
            }
        }
    }
}

// AGENTS.md and CLAUDE.md each get the block — unless CLAUDE.md only `@AGENTS.md`-includes it, in which
// case the block belongs in AGENTS.md alone and any copy in CLAUDE.md is stripped to avoid duplication.
async function resolveTargets(projectRootPath: string): Promise<Target[]> {
    const [
        agentsName,
        claudeName,
    ] = AGENT_FILE_NAMES;

    const claudeContent = await Transpiler.readFile(Path.join(projectRootPath, claudeName!));

    if (claudeContent !== null && includesAgentsFile(claudeContent, agentsName!)) {
        return [
            { path: Path.join(projectRootPath, agentsName!), name: agentsName!, strip: false },
            { path: Path.join(projectRootPath, claudeName!), name: claudeName!, strip: true },
        ];
    }

    return AGENT_FILE_NAMES.map((name) => ({ path: Path.join(projectRootPath, name), name, strip: false }));
}

function includesAgentsFile(content: string, agentsName: string): boolean {
    return new RegExp(`(^|\\s)@${agentsName.replace(/\./g, '\\.')}(\\s|$)`).test(content);
}

async function writeHintBlock(target: Target, block: string): Promise<string> {
    const content = await Transpiler.readFile(target.path);

    if (content === null) {
        await Transpiler.writeFile(target.path, `${block}\n`);

        return `Created ${target.name} with the HINT block`;
    }

    if (HINT_BLOCK_PATTERN.test(content)) {
        const updated = content.replace(HINT_BLOCK_PATTERN, block);

        if (updated === content) {
            return `${target.name} already up to date`;
        }

        await Transpiler.writeFile(target.path, updated);

        return `Updated the HINT block in ${target.name}`;
    }

    await Transpiler.writeFile(target.path, `${content.replace(/\s+$/, '')}\n\n${block}\n`);

    return `Added the HINT block to ${target.name}`;
}

async function stripHintBlock(target: Target): Promise<string | null> {
    const content = await Transpiler.readFile(target.path);

    if (content === null || !HINT_BLOCK_PATTERN.test(content)) {
        return null;
    }

    const stripped = content
        .replace(HINT_BLOCK_PATTERN, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .replace(/\s+$/, '');

    await Transpiler.writeFile(target.path, stripped === '' ? '' : `${stripped}\n`);

    return `Removed the duplicate HINT block from ${target.name}`;
}
