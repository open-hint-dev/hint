import { compileFiles, spawnAgent } from './command.js';

export async function executeClaude(filePaths: string[]): Promise<void> {
    const prompt = await compileFiles(filePaths);
    if (prompt === '') {
        return;
    }
    await spawnAgent('claude', ['--print'], prompt);
}
