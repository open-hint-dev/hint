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
            if (/^https?:\/\//.test(book) && !isGitUrl(book)) {
                process.stderr.write(
                    `hint: unsupported source '${book}' — use an npm package (or npm://), a file:// path, or a git URL (.git, GitHub, GitLab, or Bitbucket).\n`,
                );
                process.exitCode = 2;
                return;
            }

            const entry = await installBook(projectRootPath, book, this.local);

            if (!books.includes(entry)) {
                books.push(entry);
            }

            // Persist each success before announcing it. If a later install fails, retrying starts
            // from an honest config rather than from an unregistered package already on disk.
            config.books = books;
            await Transpiler.saveConfig(projectRootPath, config);
            process.stdout.write(`Installed ${entry}\n`);
        }

        process.stdout.write(`Run 'hint apply' to refresh AGENTS.md and CLAUDE.md.\n`);
    }
}

function isGitUrl(book: string): boolean {
    if (/^(git@|ssh:\/\/|git:\/\/)/.test(book)) return true;
    if (!/^https?:\/\//.test(book)) return false;

    try {
        const url = new URL(book);
        return (
            book.endsWith('.git') ||
            [
                'github.com',
                'gitlab.com',
                'bitbucket.org',
            ].includes(url.hostname.toLowerCase())
        );
    } catch {
        return false;
    }
}

function gitRepoName(url: string): string {
    const path = url
        .replace(/^[a-z]+:\/\//i, '')
        .replace(/^git@/, '')
        .replace(/:/g, '/')
        .replace(/\.git$/, '');
    const parts = path.split('/').filter(Boolean);
    const repo = parts.at(-1) ?? 'hintbook';
    const owner = parts.at(-2) ?? 'repo';

    return `${owner}__${repo}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function run(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
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
    if (isGitUrl(book)) {
        return installGitBook(projectRootPath, book);
    }

    const entry = await fetchBook(projectRootPath, book, local);

    if ((await Transpiler.resolveHintbookPaths(projectRootPath, entry)).length === 0) {
        throw new Error(`No hintbook found in '${book}'`);
    }

    return entry;
}

let cloneSequence = 0;

async function installGitBook(projectRootPath: string, book: string): Promise<string> {
    const store = Path.join(projectRootPath, HINTBOOKS_FOLDER);
    const folder = gitRepoName(book);
    const finalPath = Path.join(store, folder);
    const entry = `${Transpiler.URL_FILE_PREFIX}${Path.join(HINTBOOKS_FOLDER, folder)}`;

    if (await Transpiler.isPathExists(finalPath)) {
        if ((await Transpiler.resolveHintbookPaths(projectRootPath, entry)).length === 0) {
            throw new Error(`No hintbook found in existing clone '${finalPath}'`);
        }
        return entry;
    }

    await FsPromises.mkdir(store, { recursive: true });
    const temporaryFolder = `.${folder}.${process.pid}.${cloneSequence++}.clone`;
    const temporaryPath = Path.join(store, temporaryFolder);
    const temporaryEntry = `${Transpiler.URL_FILE_PREFIX}${Path.join(HINTBOOKS_FOLDER, temporaryFolder)}`;

    try {
        await run(
            'git',
            [
                'clone',
                book,
                Path.join(HINTBOOKS_FOLDER, temporaryFolder),
            ],
            projectRootPath,
        );

        if ((await Transpiler.resolveHintbookPaths(projectRootPath, temporaryEntry)).length === 0) {
            throw new Error(`No hintbook found in '${book}'`);
        }

        await FsPromises.rename(temporaryPath, finalPath);
        return entry;
    } catch (error: unknown) {
        await FsPromises.rm(temporaryPath, { recursive: true, force: true });
        throw error;
    }
}

async function fetchBook(projectRootPath: string, book: string, local: boolean): Promise<string> {
    if (book.startsWith(Transpiler.URL_FILE_PREFIX)) {
        return book;
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
