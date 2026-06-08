import { compileFiles } from './command.js';

export async function executeDefault(filePaths: string[]): Promise<string> {
    return compileFiles(filePaths);
}
