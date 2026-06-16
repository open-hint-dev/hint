import { spawn } from 'node:child_process';
import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';

const HINTBOOKS_FOLDER = Transpiler.HINTBOOKS_FOLDER;

export class AddCommand implements ICommand {
    private books: string[] = [];
    private local: boolean = false;

    constructor() {}

    static new(books: string[], local: boolean): AddCommand {
        const command = new AddCommand();

        command.books = books;
        command.local = local;

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
            const entry = await installBook(projectRootPath, book, this.local);

            if (!books.includes(entry)) {
                books.push(entry);
            }

            process.stdout.write(`Installed ${entry}\n`);
        }

        config.books = books;
        await Transpiler.saveConfig(projectRootPath, config);

        process.stdout.write(`Run 'hint apply' to refresh AGENTS.md and CLAUDE.md.\n`);
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

async function installBook(projectRootPath: string, book: string, local: boolean): Promise<string> {
    const entry = await fetchBook(projectRootPath, book, local);

    if ((await Transpiler.resolveHintbookPaths(projectRootPath, entry)).length === 0) {
        throw new Error(`No hintbook found in '${book}'`);
    }

    return entry;
}

async function fetchBook(projectRootPath: string, book: string, local: boolean): Promise<string> {
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

    if (local) {
        // Install into an isolated npm prefix (hintbooks/) instead of the project root, so npm
        // never reads the host project's package.json. This keeps `hint add --local` working in
        // yarn/pnpm workspaces (whose `workspace:*` deps npm cannot parse) without requiring their
        // package manager — npm always ships with Node.
        const storePath = await ensureNpmStore(projectRootPath);

        await run(
            'npm',
            [
                'install',
                packageName,
                '--prefix',
                storePath,
                '--no-audit',
                '--no-fund',
            ],
            projectRootPath,
        );
    } else {
        await run(
            'npm',
            [
                'install',
                '--global',
                packageName,
            ],
            projectRootPath,
        );
    }

    return `${Transpiler.URL_NPM_PREFIX}${packageName}`;
}

async function ensureNpmStore(projectRootPath: string): Promise<string> {
    const storePath = Path.join(projectRootPath, HINTBOOKS_FOLDER);
    const manifestPath = Path.join(storePath, 'package.json');

    await FsPromises.mkdir(storePath, { recursive: true });

    if (!(await Transpiler.isPathExists(manifestPath))) {
        // A private manifest makes npm treat this folder as its own project root, so it does not
        // walk up into the host workspace when resolving where to install.
        await Transpiler.writeFile(manifestPath, `${JSON.stringify({ name: 'hint-hintbooks', private: true }, null, 4)}\n`);
    }

    return storePath;
}
