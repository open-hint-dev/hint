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
        let settled = false;

        const proc = spawn(binary, args, { stdio: ['pipe', 'inherit', 'inherit'] });

        proc.on('error', (err: NodeJS.ErrnoException) => {
            if (settled) return;
            settled = true;
            if (err.code === 'ENOENT') {
                reject(create(ErrorCode.IO_ERROR, `Agent binary not found: '${binary}'. Make sure it is installed and on PATH.`));
            } else {
                reject(create(ErrorCode.IO_ERROR, `Failed to spawn '${binary}': ${err.message}`));
            }
        });

        proc.stdin!.on('error', (err: Error) => {
            if (settled) return;
            settled = true;
            reject(create(ErrorCode.IO_ERROR, `Failed to write prompt to '${binary}': ${err.message}`));
        });

        proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            if (settled) return;
            settled = true;
            if (code === 0) {
                resolve();
            } else if (code === null) {
                reject(create(ErrorCode.IO_ERROR, `'${binary}' exited due to signal ${signal ?? 'unknown'}.`));
            } else {
                reject(create(ErrorCode.IO_ERROR, `'${binary}' exited with code ${code}.`));
            }
        });

        proc.stdin!.write(prompt, 'utf8', (err) => {
            if (err) {
                if (settled) return;
                settled = true;
                reject(create(ErrorCode.IO_ERROR, `Failed to write prompt to '${binary}': ${err.message}`));
            } else {
                proc.stdin!.end();
            }
        });
    });
}
