import * as Readline from 'node:readline';

export type Terminal = {
    ask(question: string): Promise<string>;
    close(): void;
};

export function openTerminal(): Terminal {
    const readline = Readline.createInterface({ input: process.stdin, output: process.stderr });

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
            process.stderr.write(question);

            const bufferedLine = bufferedLines.shift();

            if (bufferedLine !== undefined) {
                return Promise.resolve(bufferedLine);
            }

            if (closed) {
                return Promise.resolve('');
            }

            return new Promise((resolve) => waiters.push(resolve));
        },
        close(): void {
            readline.close();
        },
    };
}
