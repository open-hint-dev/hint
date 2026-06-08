import { compileFiles, spawnAgent } from './command.js';

export async function executeCodex(filePaths: string[]): Promise<void> {
    const prompt = await compileFiles(filePaths);
    if (prompt === '') {
        return;
    }
    await spawnAgent('codex', [], prompt);
}
