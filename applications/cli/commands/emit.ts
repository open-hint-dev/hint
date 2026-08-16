import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

import type { ICommand } from './command.js';
import { EXIT_FAILED, EXIT_UNRESOLVED, reportResolution } from './report.js';

export type EmitOptions = {
    target?: string;
    stdout: boolean;
    check: boolean;
    // Write even when re-emission would leave an implementation with nowhere to go. Not `--force`: the
    // root command already defines that, and a program-level flag never reaches a subcommand.
    dropOrphans: boolean;
    // Append a generated region to a file that already holds content and has none. Off by default,
    // because doing it silently produces a second copy of every declaration the spec makes.
    adopt: boolean;
};

// What happened to one output. `differs` only occurs under --check; `refused` means writing would
// have deleted an implementation, which is the one outcome worth failing over.
type Outcome = 'created' | 'updated' | 'unchanged' | 'differs' | 'refused' | 'unmanaged';

type Written = {
    output: string;
    outcome: Outcome;
    restored: number;
    drifted: string[];
    orphaned: string[];
};

export class EmitCommand implements ICommand {
    private paths: string[] = [];
    private options: EmitOptions = { stdout: false, check: false, dropOrphans: false, adopt: false };

    constructor() {}

    static new(paths: string[], options: EmitOptions): EmitCommand {
        const command = new EmitCommand();

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
        const targets = Transpiler.availableTargets(hintbooks);

        // Nothing downstream can succeed without an emitter, and the reason is worth separating from
        // "your paths matched nothing" — one is a missing install, the other a typo.
        if (targets.length === 0) {
            process.stderr.write(`hint: no emitters registered — the hintbooks in ${Transpiler.CONFIG_FILE_YML} provide no emit templates.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        if (this.options.target && !targets.includes(this.options.target)) {
            process.stderr.write(`hint: no emitter for target '${this.options.target}'. Available: ${targets.join(', ')}.\n`);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const resolution = await Transpiler.resolveRequests(projectRootPath, await this.expandFolders(projectRootPath));

        await reportResolution(projectRootPath, resolution);

        const hints = await Transpiler.parseHintFiles(projectRootPath, resolution.hintPaths);
        const plan = Transpiler.planEmit(hints, hintbooks, this.options.target);

        if (plan.units.length === 0) {
            this.reportEmptyPlan(plan, targets);
            process.exitCode = EXIT_UNRESOLVED;

            return;
        }

        const written: Written[] = [];

        for (const unit of plan.units) {
            if (this.options.stdout) {
                // Nothing on disk is consulted: what goes to stdout is what the spec produces for a
                // file that does not exist yet, which is the only reading that is the same every run.
                process.stdout.write(`${Transpiler.renderArtifact(unit, hintbooks)}\n`);

                continue;
            }

            written.push(await this.applyUnit(projectRootPath, unit, hintbooks));
        }

        if (this.options.stdout) {
            this.reportPlan(plan);

            return;
        }

        this.reportWritten(written, plan);
    }

    // Merge, then either compare or write. The comparison is against the *merged* result rather than
    // the raw artifact, so a filled hole is never reported as a difference — otherwise `--check` would
    // fail every repository the moment anyone implemented anything.
    private async applyUnit(projectRootPath: string, unit: Transpiler.EmitUnit, hintbooks: Transpiler.HintbookData[]): Promise<Written> {
        const outputPath = Path.join(projectRootPath, unit.output);
        const existing = await Transpiler.readFile(outputPath);
        // Rendered against what the file already has above the region, so the import advice covers only
        // what is still outstanding. Same file in, same artifact out, which is what --check rests on.
        const artifact = Transpiler.renderArtifact(unit, hintbooks, Transpiler.readPreamble(existing));
        const merged = Transpiler.mergeArtifact(existing, artifact, unit.emitter.comment, `${unit.output}${Transpiler.HINT_EXT}`);

        const orphaned = merged.orphaned.map((hole) => hole.label);

        // A file with content and no region is not HINT's to write into. Appending one puts a second
        // copy of every declared surface into it, which does not fail loudly — it produces a file that
        // no longer compiles — and the run would report a cheerful "created" while doing it.
        if (merged.adopted && !this.options.adopt && !this.options.check) {
            return { output: unit.output, outcome: 'unmanaged', restored: 0, drifted: [], orphaned: [] };
        }

        // An implementation the new artifact has nowhere to put would simply vanish, and vanished work
        // cannot be recovered. The write is refused and the labels are named; the fix is to restore the
        // spec block, give it a stable `{#id}` so a rename is followed, or move the code out by hand.
        if (orphaned.length > 0 && !this.options.dropOrphans && !this.options.check) {
            return { output: unit.output, outcome: 'refused', restored: 0, drifted: [], orphaned };
        }

        const unchanged = existing === merged.content;
        const outcome: Outcome = unchanged ? 'unchanged' : this.options.check ? 'differs' : merged.created ? 'created' : 'updated';

        if (!unchanged && !this.options.check) {
            await FsPromises.mkdir(Path.dirname(outputPath), { recursive: true });
            await Transpiler.writeFile(outputPath, merged.content);
        }

        return { output: unit.output, outcome, restored: merged.restored, drifted: merged.drifted, orphaned };
    }

    // A folder never emits, so `hint emit src/` can only mean "everything beneath src". Reading it the
    // way `hint src/` does — that folder's own `_.hint` — would make every folder argument a dead end.
    // Scoped to this command: it does not change what a plain read means.
    private async expandFolders(projectRootPath: string): Promise<string[]> {
        const expanded: string[] = [];

        for (const path of this.paths) {
            const absolute = Path.resolve(projectRootPath, path);
            const isFolder = (await Transpiler.isPathExists(absolute)) && (await Transpiler.isPathFolder(absolute));

            expanded.push(isFolder ? `${path.replace(/\/+$/, '')}/**` : path);
        }

        return expanded;
    }

    // "Nothing to emit" has several distinct causes and each one has a different fix, so it is worth
    // saying which happened rather than emitting one blanket failure.
    private reportEmptyPlan(plan: Transpiler.EmitPlan, targets: string[]): void {
        if (plan.skipped.length > 0) {
            const outputs = plan.skipped.map((skip) => skip.output).slice(0, 3);

            process.stderr.write(
                `hint: no emitter matched ${plan.skipped.length} file spec(s) — ${outputs.join(', ')}${plan.skipped.length > outputs.length ? ', …' : ''}. ` +
                    `Registered targets: ${targets.join(', ')}.\n`,
            );

            return;
        }

        if (plan.folders > 0) {
            process.stderr.write(
                `hint: ${plan.folders} folder hint(s) matched and no file specs. A folder hint describes everything beneath it and has no single output, ` +
                    `so it never emits — write a companion <file>.hint for what you want produced.\n`,
            );

            return;
        }

        process.stderr.write(`hint: nothing to emit.\n`);
    }

    private reportPlan(plan: Transpiler.EmitPlan): void {
        process.stderr.write(`hint: rendered ${plan.units.length} artifact(s).\n`);

        if (plan.skipped.length > 0) {
            process.stderr.write(`hint: ${plan.skipped.length} file spec(s) skipped — no emitter matches their output path.\n`);
        }
    }

    private reportWritten(written: Written[], plan: Transpiler.EmitPlan): void {
        const differing = written.filter((entry) => entry.outcome === 'differs');
        const drifted = written.filter((entry) => entry.drifted.length > 0);

        if (this.options.check) {
            // The verdict goes first: under --check the answer is the exit code, and the first stderr
            // line is the one a truncating reader keeps.
            if (differing.length === 0) {
                process.stderr.write(`hint: ${written.length} artifact(s) match their specs.\n`);
            } else {
                process.stderr.write(`hint: ${differing.length} of ${written.length} artifact(s) differ from what their specs produce.\n`);

                for (const entry of differing) {
                    process.stderr.write(`hint:   ${entry.output} — run 'hint emit ${entry.output}' to reconcile.\n`);
                }

                process.exitCode = EXIT_FAILED;
            }
        } else {
            const counts = (
                [
                    'created',
                    'updated',
                    'unchanged',
                    'refused',
                    'unmanaged',
                ] as const
            )
                .map((outcome) => ({ outcome, count: written.filter((entry) => entry.outcome === outcome).length }))
                .filter((entry) => entry.count > 0)
                .map((entry) => `${entry.count} ${entry.outcome}`);

            process.stderr.write(`hint: ${counts.join(', ')}.\n`);
        }

        const unmanaged = written.filter((entry) => entry.outcome === 'unmanaged');

        for (const entry of unmanaged) {
            process.stderr.write(
                `hint: ${entry.output} — not written: the file already has content and no hint:begin region, so emitting ` +
                    `would append a second copy of everything the spec declares. Delete the hand-written declarations the ` +
                    `spec now owns and pass --adopt, or keep the spec at the verify rung and run 'hint verify' instead.\n`,
            );
        }

        const refused = written.filter((entry) => entry.outcome === 'refused');

        for (const entry of refused) {
            process.stderr.write(
                `hint: ${entry.output} — not written: ${entry.orphaned.length} implemented hole(s) have nowhere to go ` +
                    `(${entry.orphaned.join(', ')}). The spec block that owned them was removed or renamed. Restore it, ` +
                    `give it a stable {#id} so a rename is followed, move the code out of the generated region, or pass ` +
                    `--drop-orphans to discard it.\n`,
            );
        }

        if (refused.length > 0 || unmanaged.length > 0) {
            process.exitCode = EXIT_FAILED;
        }

        const restored = written.reduce((total, entry) => total + entry.restored, 0);

        if (restored > 0) {
            process.stderr.write(`hint: ${restored} filled hole(s) preserved.\n`);
        }

        // A body written against a spec that has since moved is the one thing here nothing else
        // catches, so it is stated rather than folded into a count.
        for (const entry of drifted) {
            process.stderr.write(
                `hint: ${entry.output} — spec changed since ${entry.drifted.join(', ')} was implemented; re-check the body against it.\n`,
            );
        }

        if (plan.skipped.length > 0) {
            process.stderr.write(`hint: ${plan.skipped.length} file spec(s) skipped — no emitter matches their output path.\n`);
        }
    }
}
