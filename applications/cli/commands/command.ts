import { spawn } from 'node:child_process';

import { type CompilerInput, ErrorCode, compile, create, parse } from '@openhint/transpiler';

export async function compileFiles(filePaths: string[]): Promise<string> {
    const result = await parse(filePaths);
    const input: CompilerInput = {
        projectRoot: result.projectRoot,
        targetPaths: result.targetPaths,
        ignore: result.config.ignore,
        blocks: result.blocks,
        reads: result.reads,
    };
    return compile(input);
}

export function spawnAgent(binary: string, args: string[], prompt: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const proc = spawn(binary, args, { stdio: ['pipe', 'inherit', 'inherit'] });

        proc.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ENOENT') {
                reject(create(ErrorCode.IO_ERROR, `Agent binary not found: '${binary}'. Make sure it is installed and on PATH.`));
            } else {
                reject(create(ErrorCode.IO_ERROR, `Failed to spawn '${binary}': ${err.message}`));
            }
        });

        proc.stdin!.write(prompt, 'utf8');
        proc.stdin!.end();

        proc.on('close', (code) => {
            if (code === 0 || code === null) {
                resolve();
            } else {
                reject(create(ErrorCode.IO_ERROR, `'${binary}' exited with code ${code}.`));
            }
        });
    });
}
