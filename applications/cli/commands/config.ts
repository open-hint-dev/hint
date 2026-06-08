import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { ErrorCode, create } from '@openhint/transpiler';

export const CONFIG_INSTRUCTION = `## HINT

When you encounter \`.hint\` files in this repository: run \`hint <file>\` to compile the specification into an AI-ready implementation prompt. Use the compiled output as your primary implementation context instead of reading the raw \`.hint\` file directly.

If \`hint\` is not installed globally, use \`npx @openhint/cli <file>\` instead.`;

async function findProjectRoot(startDir: string = process.cwd()): Promise<string> {
    let current = resolve(startDir);
    for (;;) {
        for (const marker of ['hint.yml', 'hint.yaml']) {
            const markerPath = join(current, marker);
            try {
                const stats = await stat(markerPath);
                if (stats.isFile()) {
                    return current;
                }
            } catch (err: unknown) {
                const e = err as NodeJS.ErrnoException;
                if (e.code !== 'ENOENT') {
                    throw create(ErrorCode.IO_ERROR, `Failed to inspect '${markerPath}': ${e.message}`);
                }
            }
        }
        const parent = dirname(current);
        if (parent === current) {
            throw create(ErrorCode.IO_ERROR, 'No hint.yml found — not inside a HINT project');
        }
        current = parent;
    }
}

async function appendInstruction(projectRoot: string, filename: string): Promise<void> {
    const filePath = join(projectRoot, filename);
    let content: string;
    try {
        content = await readFile(filePath, 'utf8');
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
            try {
                await writeFile(filePath, CONFIG_INSTRUCTION, 'utf8');
            } catch (writeErr: unknown) {
                throw create(ErrorCode.IO_ERROR, `Failed to write '${filePath}': ${(writeErr as Error).message}`);
            }
            return;
        }
        throw create(ErrorCode.IO_ERROR, `Failed to read '${filePath}': ${(err as Error).message}`);
    }
    if (content.includes('## HINT')) {
        return;
    }
    try {
        await writeFile(filePath, `${content}\n\n${CONFIG_INSTRUCTION}`, 'utf8');
    } catch (writeErr: unknown) {
        throw create(ErrorCode.IO_ERROR, `Failed to write '${filePath}': ${(writeErr as Error).message}`);
    }
}

export async function executeConfig(projectRoot?: string): Promise<void> {
    const root =
        projectRoot !== undefined
            ? resolve(process.cwd(), projectRoot)
            : await findProjectRoot(process.cwd());
    await appendInstruction(root, 'AGENTS.md');
    await appendInstruction(root, 'CLAUDE.md');
}
