import * as FsPromises from 'node:fs/promises';
import * as Path from 'node:path';

import * as YAML from 'yaml';

import { readFile, writeFile } from './helper.js';

export const CONFIG_INSTRUCTION = `## HINT

This repository is **Spec-as-Source**: its durable intent — decisions, invariants, constraints, hazards, conventions — lives in \`.hint\` files versioned alongside the code, and that spec is the authority the work answers to. Nothing is generated from it; the \`hint\` CLI returns the part of the spec that governs a given path or intent, and tells you when the work has drifted away from it.

**Before you modify code, get the knowledge that applies to it — unless you already have it in this session.**

- Know the path: \`hint <path...>\` prints the knowledge for those paths on stdout. It costs about as much as there is to say; a path nothing applies to returns almost nothing.
- Know only the intent: \`hint search "<what you are about to do>"\` ranks every \`.hint\` in the repository and prints JSON — \`hint\` (the file), \`target\` (the path it governs), \`score\`, and \`weak\`. It is fast, offline, and reads nothing into your context. Run it whenever you do not already know which knowledge covers the work. Then \`hint <target>\` on the results worth reading. If every result is \`weak\`, treat it as "nothing covers this yet".
- Knowledge is inherited: a path picks up its own \`.hint\` plus every folder \`_.hint\` above it, up to the repository root. A path with no \`.hint\` of its own still inherits, and \`hint\` says so on stderr.
- Scope the request to what you are touching. A folder path returns that folder's own knowledge, not the whole subtree — use a glob (\`hint 'src/api/**'\`) when you want everything beneath it.
- Referenced specs come along automatically, with shared context emitted once, so you do not need a second call for a path the first one pointed at. \`--no-refs\` turns that off.

**Reading stderr and exit codes.** stdout is the knowledge; stderr is the verdict, and its first line is the one that matters. Exit \`0\` succeeded, \`1\` a check failed, \`2\` nothing you asked for matched — a typo, or a path this repository says nothing about. Empty stdout with exit 0 means there is genuinely nothing to say; proceed normally.

**Staleness.** stderr may say that a hint has not been updated while the code under it moved. That is an observation, not a verdict: read the knowledge, decide whether it still holds, and if it does not, fix it in the same change you are already making. This is the one moment the correction is cheap. \`hint status\` inventories the whole repository the same way — knowledge the code has moved away from, specs whose target was deleted, drift against \`hint.lock\`.

**Authoring.** You may read \`.hint\` files directly whenever you are writing or editing them — that is the only way to edit them, and it is expected. Do not read them directly to *consume* knowledge; \`hint <path>\` gives you that in the form agents are meant to receive, with inheritance resolved. Run \`hint author <path...>\` first for the keyword vocabulary and syntax, then write the files yourself.

**Recording what you learn.** When you discover something durable that future work on this repository should know — an architectural decision, a subsystem invariant, an operational hazard, a security constraint, an approach that does not work and why — record it in the most specific \`.hint\` that applies: the file's companion \`<file>.hint\`, else the folder's \`_.hint\`, else the root \`_.hint\`. Prefer this over a separate agent-memory file, so the knowledge is versioned with the code and available to every tool. Do not record session state, task progress, or anything that stops being true when the task ends.

Write knowledge that *explains* — a decision and its rationale, an invariant, a hazard — not knowledge that *restates* code. A block that copies a signature, a schema, or the contents of another file is a snapshot that goes stale silently and then steers the next reader wrong; reference the file by path and state the constraint instead. Commit the \`.hint\` in the same change as the code it describes.

**Emit (optional).** If this project registers an emitter, \`hint emit <path...>\` writes the artifact a spec produces and \`hint emit --check\` verifies that what is committed still matches. Only companion \`<file>.hint\` specs emit. A generated file has three zones and every marker names the one it opens or closes: **above** \`hint:begin\` are the imports, **inside** the region is what the spec owns and rewrites on every run, and **below** \`hint:end\` is yours for helpers. Write implementations in a \`hint:hole(...)\`, whose constraints are listed directly above it and which closes with \`hint:end of hole\`. A hole is addressed by the block that owns it, so two implementations in one file never cross. Once you fill a hole it is never overwritten — but if stderr says the spec changed since it was implemented, re-check that body against the spec. Where the emitter lists names that need importing, resolve them to this project's modules and add the imports above the region; the list shrinks as you do and disappears when nothing is left.

**Adopting a repository that has no specs yet.** \`hint extract <path...>\` drafts a \`.hint\` from the symbols a source file already declares, where a language adapter is installed. It records shape only and says so — the rationale is the half no parser can recover, and it is the half worth having, so add it and delete whatever was already obvious from the code.

**Contracts (optional).** Only for specs that declare surfaces the code must contain. \`hint verify <path...>\` checks them deterministically and exits non-zero on failure. \`hint lock <path...>\` records a snapshot so later \`hint --prompt\` runs skip unchanged work (a plain read is never gated); \`hint diff <path...>\` shows what drifted since. These operate on companion \`<file>.hint\` specs only — folder knowledge has no single generated file to check, and they will say so rather than report a hollow success. A repository that never uses them is a normal HINT repository.

**Notes.** \`hint --prompt <path...>\` wraps the knowledge in a full implementation prompt, for piping to a fresh agent that has no other instructions; you do not need it mid-session. \`hint --help\` lists the complete CLI surface — consult it rather than assuming this block is exhaustive. If \`hint\` is not installed, use \`npx @openhint/cli\`. Run \`hint\` silently as part of your normal workflow; if it fails unexpectedly, diagnose against https://github.com/open-hint-dev/hint/blob/main/docs/troubleshooting/01-intro.md before relaying the error.
`;

export const CONFIG_FILE_YML = 'hint.yml';
export const CONFIG_FILE_YAML = 'hint.yaml';

const CONFIG_NAMES = [
    CONFIG_FILE_YML,
    CONFIG_FILE_YAML,
];

export type ConfigData = {
    name?: string;
    description?: string;
    ignore?: string[];
    books?: string[];
};

export async function findConfig(projectRootPath: string): Promise<string | null> {
    for (const configName of CONFIG_NAMES) {
        const configPath = Path.join(projectRootPath, configName);

        try {
            const stats = await FsPromises.stat(configPath);
            if (stats.isFile()) {
                return configPath;
            }
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                continue;
            }

            throw new Error(`Failed to access '${configPath}': ${(err as any).message}`);
        }
    }

    return null;
}

export async function findProjectRoot(startPath: string): Promise<string | null> {
    let currentPath = Path.resolve(startPath);

    while (true) {
        const configPath = await findConfig(currentPath);
        if (configPath) {
            return currentPath;
        }

        const parentPath = Path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }

        currentPath = parentPath;
    }

    return null;
}

export async function loadConfig(projectRootPath: string): Promise<ConfigData | null> {
    const configPath = await findConfig(projectRootPath);
    if (!configPath) {
        return null;
    }

    try {
        const content = await readFile(configPath);
        if (content === null) {
            return null;
        }

        return YAML.parse(content) as ConfigData;
    } catch (err: unknown) {
        throw new Error(`Failed to read '${configPath}': ${(err as any).message}`);
    }
}

export async function saveConfig(projectRootPath: string, config: ConfigData): Promise<void> {
    let configPath = await findConfig(projectRootPath);
    if (!configPath) {
        configPath = Path.join(projectRootPath, CONFIG_NAMES[0]!);
    }

    const content = YAML.stringify(config, { lineWidth: 0 });

    try {
        await writeFile(configPath, content);
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        throw new Error(`Failed to write '${configPath}': ${e.message}`);
    }
}
