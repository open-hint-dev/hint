import * as Fs from 'node:fs';
import * as Readline from 'node:readline';
import * as Stream from 'node:stream';
import * as Tty from 'node:tty';

export type Terminal = {
    ask(question: string): Promise<string>;
    close(): void;
};

type TerminalStreams = {
    input: Stream.Readable;
    output: Stream.Writable;
    cleanup: () => void;
};

export function openTerminal(): Terminal {
    const { input, output, cleanup } = openTerminalStreams();
    const readline = Readline.createInterface({ input, output });

    const bufferedLines: string[] = [];
    const waiters: ((line: string) => void)[] = [];
    let closed = false;

    readline.on('line', (line: string) => {
        const waiter = waiters.shift();

        if (waiter) {
            waiter(line);
        } else {
            bufferedLines.push(line);
        }
    });

    readline.on('close', () => {
        closed = true;

        while (waiters.length > 0) {
            waiters.shift()!('');
        }
    });

    return {
        ask(question: string): Promise<string> {
            const bufferedLine = bufferedLines.shift();

            if (bufferedLine !== undefined) {
                return Promise.resolve(bufferedLine);
            }

            if (closed) {
                return Promise.resolve('');
            }

            readline.setPrompt(question);
            readline.prompt();

            return new Promise((resolve) => waiters.push(resolve));
        },
        close(): void {
            readline.close();
            cleanup();
        },
    };
}

// When stdout is piped (e.g. `hint config | claude -p`), prompts written to
// stdout would be swallowed by the pipe. Talk to the controlling terminal
// directly via /dev/tty so prompts and answers reach the user regardless of how
// stdout/stderr are redirected. Fall back to stdin/stderr when no tty exists.
function openTerminalStreams(): TerminalStreams {
    if (process.stdout.isTTY) {
        return { input: process.stdin, output: process.stderr, cleanup: () => {} };
    }

    return openControllingTty() ?? { input: process.stdin, output: process.stderr, cleanup: () => {} };
}

function openControllingTty(): TerminalStreams | undefined {
    let inputFd: number | undefined;
    let outputFd: number | undefined;

    try {
        inputFd = Fs.openSync('/dev/tty', 'r');
        outputFd = Fs.openSync('/dev/tty', 'w');

        const input = new Tty.ReadStream(inputFd);
        const output = new Tty.WriteStream(outputFd);

        return {
            input,
            output,
            cleanup: () => {
                input.destroy();
                output.destroy();
            },
        };
    } catch {
        if (inputFd !== undefined) {
            try {
                Fs.closeSync(inputFd);
            } catch {
                // ignore
            }
        }

        if (outputFd !== undefined) {
            try {
                Fs.closeSync(outputFd);
            } catch {
                // ignore
            }
        }

        return undefined;
    }
}
