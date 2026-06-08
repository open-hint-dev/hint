import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { ErrorCode, create } from '@openhint/transpiler';

export const CONFIG_INSTRUCTION = `## HINT

When you encounter \`.hint\` files in this repository: run \`hint <file>\` to compile the specification into an AI-ready implementation prompt. Use the compiled output as your primary implementation context instead of reading the raw \`.hint\` file directly.

If \`hint\` is not installed globally, use \`npx @openhint/cli <file>\` instead.`;

async function findProjectRoot(startDir: string): Promise<string> {
    let current = startDir;
    for (;;) {
        if (existsSync(join(current, 'hint.yml')) || existsSync(join(current, 'hint.yaml'))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            throw create(ErrorCode.IO_ERROR, 'No hint.yml found — not inside a HINT project.');
        }
        current = parent;
    }
}

async function appendInstruction(projectRoot: string, filename: string): Promise<void> {
    const filePath = join(projectRoot, filename);
    if (!existsSync(filePath)) {
        await writeFile(filePath, CONFIG_INSTRUCTION, 'utf8');
        return;
    }
    const content = await readFile(filePath, 'utf8');
    if (content.includes('## HINT')) {
        return;
    }
    await writeFile(filePath, `${content}\n\n${CONFIG_INSTRUCTION}`, 'utf8');
}

export async function executeConfig(projectRoot?: string): Promise<void> {
    const root = projectRoot ?? (await findProjectRoot(process.cwd()));
    await appendInstruction(root, 'AGENTS.md');
    await appendInstruction(root, 'CLAUDE.md');
}
