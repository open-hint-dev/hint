import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { AGENT_FILE_NAMES, buildHintBlock, collectConfigInstruction, collectHintbookSections, HINT_TAG } from './bootstrap.js';
import { EXIT_FAILED } from './report.js';

const HINT_BLOCK_PATTERN = new RegExp(`<${HINT_TAG}>[\\s\\S]*?<\\/${HINT_TAG}>`, 'g');

type Target = {
    path: string;
    name: string;
    strip: boolean;
};

export class ApplyCommand implements ICommand {
    private check = false;

    static new(check = false): ApplyCommand {
        const command = new ApplyCommand();
        command.check = check;
        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());
        const config = projectRootPath ? await Transpiler.loadConfig(projectRootPath) : null;

        if (!projectRootPath || !config) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const block = buildHintBlock(await collectHintbookSections(projectRootPath, config), await collectConfigInstruction(projectRootPath, config));

        const targets = await resolveTargets(projectRootPath);

        if (this.check) {
            const differing: string[] = [];

            for (const target of targets) {
                const current = (await Transpiler.readFile(target.path)) ?? '';
                const expected = desiredContent(current, target.strip ? null : block);
                if (current !== expected) differing.push(target.name);
            }

            if (differing.length === 0) {
                process.stderr.write(`hint: HINT instruction blocks are up to date.\n`);
            } else {
                process.stderr.write(`hint: HINT instruction block differs in ${differing.join(', ')} — run 'hint apply'.\n`);
                process.exitCode = EXIT_FAILED;
            }
            return;
        }

        for (const target of targets) {
            const message = target.strip ? await stripHintBlock(target) : await writeHintBlock(target, block);

            if (message) {
                process.stdout.write(`${message}\n`);
            }
        }
    }
}

function desiredContent(content: string, block: string | null): string {
    HINT_BLOCK_PATTERN.lastIndex = 0;
    if (block !== null) {
        let inserted = false;
        const replaced = content.replace(HINT_BLOCK_PATTERN, () => {
            if (inserted) return '';
            inserted = true;
            return block;
        });

        if (inserted) return replaced.replace(/\n{3,}/g, '\n\n');
        return content === '' ? `${block}\n` : `${content.replace(/\s+$/, '')}\n\n${block}\n`;
    }

    const stripped = content
        .replace(HINT_BLOCK_PATTERN, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .replace(/\s+$/, '');
    return stripped === '' ? '' : `${stripped}\n`;
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
        HINT_BLOCK_PATTERN.lastIndex = 0;
        const updated = desiredContent(content, block);

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
        HINT_BLOCK_PATTERN.lastIndex = 0;
        return null;
    }

    HINT_BLOCK_PATTERN.lastIndex = 0;

    await Transpiler.writeFile(target.path, desiredContent(content, null));

    return `Removed the duplicate HINT block from ${target.name}`;
}
