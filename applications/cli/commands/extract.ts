import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { EXIT_UNRESOLVED } from './report.js';

export type ExtractOptions = {
    stdout: boolean;
    // Not `--force`: the root command already defines that (ignore `hint.lock`), and commander gives a
    // program-level flag to the program, so a subcommand of the same name never sees it.
    overwrite: boolean;
};

type Drafted = {
    source: string;
    hintPath: string;
    outcome: 'written' | 'exists' | 'empty';
};

export class ExtractCommand implements ICommand {
    private paths: string[] = [];
    private options: ExtractOptions = { stdout: false, overwrite: false };

    constructor() {}

    static new(paths: string[], options: ExtractOptions): ExtractCommand {
        const command = new ExtractCommand();

        command.paths = paths;
        command.options = options;

        return command;
    }

    async execute(): Promise<void> {
        const projectRootPath = await Transpiler.findProjectRoot(process.cwd());

        if (!projectRootPath) {
            throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found — run 'hint config' to initialize the project.`);
        }

        const config = await Transpiler.loadConfig(projectRootPath);
        const hintbooks = await Transpiler.loadHintbooks(projectRootPath, config?.books ?? []);

        const sources = await this.collectSources(projectRootPath);

        if (sources.length === 0) {
            process.stderr.write(`hint: no source files matched.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const drafted: Drafted[] = [];

        let unsupported = 0;

        for (const source of sources) {
            const emitter = Transpiler.selectEmitter(hintbooks, source);
            const map = Transpiler.extractMap(emitter);

            // Two separate reasons a file cannot be drafted, and both are the project's setup rather
            // than the file's fault: no emit pack claims this path, or the pack claims it but declares
            // no mapping from its symbol kinds onto the vocabulary's keywords.
            if (!map || !emitter?.symbols) {
                unsupported += 1;

                continue;
            }

            const reading = await Transpiler.readSymbols(projectRootPath, emitter.symbols, source);

            if (reading.symbols === null) {
                process.stderr.write(`hint: ${source} — the '${emitter.target}' adapter ${reading.failure ?? 'returned nothing'}; skipped.\n`);

                continue;
            }

            drafted.push(await this.draft(projectRootPath, source, Transpiler.draftSpec(reading.symbols, map)));
        }

        this.report(drafted, sources.length, unsupported);
    }

    private async draft(projectRootPath: string, source: string, spec: string): Promise<Drafted> {
        const hintPath = `${source}${Transpiler.HINT_EXT}`;

        if (!spec) {
            return { source, hintPath, outcome: 'empty' };
        }

        if (this.options.stdout) {
            process.stdout.write(`${spec}`);

            return { source, hintPath, outcome: 'written' };
        }

        // A spec already on disk is knowledge somebody wrote, and a draft assembled from the code
        // cannot be worth more than that. Overwriting it needs to be asked for.
        if (!this.options.overwrite && (await Transpiler.isPathExists(Path.join(projectRootPath, hintPath)))) {
            return { source, hintPath, outcome: 'exists' };
        }

        await Transpiler.writeFile(Path.join(projectRootPath, hintPath), spec);

        return { source, hintPath, outcome: 'written' };
    }

    // Source files, not hint files: extraction reads code. A folder argument means everything beneath
    // it, and `.hint` files are excluded so a second run cannot try to draft a spec from a spec.
    private async collectSources(projectRootPath: string): Promise<string[]> {
        const sources = new Set<string>();

        for (const path of this.paths) {
            const absolute = Path.resolve(projectRootPath, path);

            if (!(await Transpiler.isPathExists(absolute))) {
                process.stderr.write(`hint: ${path} does not exist in this repository.\n`);

                continue;
            }

            if (await Transpiler.isPathFolder(absolute)) {
                for await (const match of FsPromises.glob('**/*', { cwd: absolute, withFileTypes: true })) {
                    if (match.isFile()) {
                        sources.add(Transpiler.repositoryPath(projectRootPath, Path.join(match.parentPath, match.name)));
                    }
                }

                continue;
            }

            sources.add(Transpiler.repositoryPath(projectRootPath, absolute));
        }

        return [...sources].filter((source) => Path.extname(source) !== Transpiler.HINT_EXT && !source.split('/').includes('node_modules')).sort();
    }

    private report(drafted: Drafted[], scanned: number, unsupported: number): void {
        const written = drafted.filter((entry) => entry.outcome === 'written');
        const exists = drafted.filter((entry) => entry.outcome === 'exists');

        if (written.length === 0 && exists.length === 0) {
            process.stderr.write(
                `hint: nothing drafted from ${scanned} file(s)` +
                    `${unsupported > 0 ? ` — ${unsupported} had no emit pack declaring an adapter and an extract map` : ''}.\n`,
            );
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        if (!this.options.stdout) {
            process.stderr.write(`hint: drafted ${written.length} spec(s).\n`);
        }

        if (exists.length > 0) {
            process.stderr.write(`hint: ${exists.length} spec(s) already exist and were left alone (use --overwrite).\n`);
        }

        if (unsupported > 0) {
            process.stderr.write(`hint: ${unsupported} file(s) skipped — no emit pack declares an adapter and an extract map for them.\n`);
        }

        // The half a parser cannot recover is the half that matters, and a draft that reads as finished
        // is worse than no draft at all.
        if (written.length > 0 && !this.options.stdout) {
            process.stderr.write(`hint: these record shape only. Add the rationale, then delete whatever is already obvious from the code.\n`);
        }
    }
}
