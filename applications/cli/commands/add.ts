import { spawn } from 'node:child_process';
import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

const HINTBOOKS_FOLDER = 'hintbooks';

export class AddCommand implements ICommand {
    private books: string[] = [];
    private global: boolean = false;

    constructor() {}

    static new(books: string[], global: boolean): AddCommand {
        const command = new AddCommand();

        command.books = books;
        command.global = global;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = (await Transpiler.loadConfig(projectRootPath)) ?? {};
        const books = config.books ?? [];

        for (const book of this.books) {
            const entry = await installBook(projectRootPath, book, this.global);

            if (!books.includes(entry)) {
                books.push(entry);
            }

            process.stdout.write(`Installed ${entry}\n`);
        }

        config.books = books;
        await Transpiler.saveConfig(projectRootPath, config);

        process.stdout.write(`Run 'hint instruct | claude -p' to refresh AGENTS.md and CLAUDE.md.\n`);
    }
}

function isGitUrl(book: string): boolean {
    return /^(git@|ssh:\/\/|git:\/\/|https?:\/\/)/.test(book);
}

function gitRepoName(url: string): string {
    return url
        .split(/[/:]/)
        .filter(Boolean)
        .at(-1)!
        .replace(/\.git$/, '');
}

function run(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: [
                'ignore',
                process.stderr,
                'inherit',
            ],
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`'${command} ${args.join(' ')}' failed with exit code ${code}`));
            }
        });
    });
}

async function installBook(projectRootPath: string, book: string, global: boolean): Promise<string> {
    const entry = await fetchBook(projectRootPath, book, global);

    if ((await Transpiler.resolveHintbookPaths(projectRootPath, entry)).length === 0) {
        throw new Error(`No hintbook found in '${book}'`);
    }

    return entry;
}

async function fetchBook(projectRootPath: string, book: string, global: boolean): Promise<string> {
    if (book.startsWith(Transpiler.URL_FILE_PREFIX)) {
        return book;
    }

    if (isGitUrl(book)) {
        const bookFolder = Path.join(HINTBOOKS_FOLDER, gitRepoName(book));

        if (!(await Transpiler.isPathExists(Path.join(projectRootPath, bookFolder)))) {
            await FsPromises.mkdir(Path.join(projectRootPath, HINTBOOKS_FOLDER), { recursive: true });
            await run(
                'git',
                [
                    'clone',
                    book,
                    bookFolder,
                ],
                projectRootPath,
            );
        }

        return `${Transpiler.URL_FILE_PREFIX}${bookFolder}`;
    }

    const packageName = book.startsWith(Transpiler.URL_NPM_PREFIX) ? book.slice(Transpiler.URL_NPM_PREFIX.length) : book;

    const npmArgs = global
        ? [
              'install',
              '--global',
              packageName,
          ]
        : [
              'install',
              packageName,
          ];

    await run('npm', npmArgs, projectRootPath);

    return `${Transpiler.URL_NPM_PREFIX}${packageName}`;
}
