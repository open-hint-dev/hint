import { globSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import type { Directive, RawBlock, ReadRef } from './parser';
import { ErrorCode, fire } from './error';
import { footer, getKeyword, header, keywordOrder, renderKeyword } from './keywords';
import { createIgnoreMatcher } from './parser';

export type CompilerInput = {
    projectRoot: string;
    targetPaths: string[];
    ignore: string[];
    blocks: RawBlock[];
    reads: Map<string, ReadRef>;
};

export type SpecificationSource = {
    id: string;
    path: string;
    kind: 'baseline' | 'direct' | 'file';
};

export type ImplementationTarget = {
    path: string;
    specification: string;
    sourceId: string;
};

export type RepositoryContext = {
    root: '.';
    targets: ImplementationTarget[];
    sources: SpecificationSource[];
};

export type FilteredCompilerInput = {
    targetPaths: string[];
    blocks: RawBlock[];
    reads: Map<string, ReadRef>;
};

function toPosix(path: string): string {
    return path.split(sep).join('/');
}

function projectRelative(projectRoot: string, path: string): string {
    return toPosix(relative(resolve(projectRoot), resolve(projectRoot, path))).replace(/^\.\//, '');
}

function filterGlob(glob: string, projectRoot: string, ignored: ReturnType<typeof createIgnoreMatcher>): string | undefined {
    const matches = globSync(glob, { cwd: projectRoot }).map(toPosix);
    if (matches.length === 0) {
        return ignored.matches(resolve(projectRoot, glob)) ? undefined : glob;
    }
    const retained = matches.filter((path) => !ignored.matches(resolve(projectRoot, path)));
    if (retained.length === 0) {
        return undefined;
    }
    return retained.length === matches.length ? glob : retained.join(',');
}

export function filterIgnored(input: CompilerInput): FilteredCompilerInput {
    const matcher = createIgnoreMatcher(input.projectRoot, input.ignore);
    const targetPaths = input.targetPaths.filter((path) => !matcher.matches(path)).map((path) => projectRelative(input.projectRoot, path));
    const reads = new Map<string, ReadRef>();
    for (const [
        name,
        read,
    ] of input.reads) {
        const glob = filterGlob(read.glob, input.projectRoot, matcher);
        if (glob !== undefined) {
            reads.set(name, { ...read, glob });
        }
    }
    const blocks = input.blocks
        .filter((block) => !matcher.matches(block.sourcePath) && (block.directive !== 'read' || (block.name !== undefined && reads.has(block.name))))
        .map((block) => ({
            ...block,
            sourcePath: projectRelative(input.projectRoot, block.sourcePath),
        }));
    return { targetPaths, blocks, reads };
}

export function buildRepositoryContext(input: FilteredCompilerInput): RepositoryContext {
    const sources: SpecificationSource[] = [];
    const sourceIds = new Map<string, string>();
    for (const block of input.blocks) {
        const path = toPosix(block.sourcePath).replace(/^\.\//, '');
        if (sourceIds.has(path)) {
            continue;
        }
        const id = `S${sources.length + 1}`;
        sourceIds.set(path, id);
        sources.push({ id, path, kind: block.sourceKind });
    }

    const targets = input.targetPaths.flatMap((specification) => {
        const normalized = toPosix(specification).replace(/^\.\//, '');
        const sourceId = sourceIds.get(normalized);
        if (sourceId === undefined) {
            return [];
        }
        return [
            {
                path: normalized.endsWith('.hint') ? normalized.slice(0, -'.hint'.length) : normalized,
                specification: normalized,
                sourceId,
            },
        ];
    });
    return { root: '.', targets, sources };
}

function escapeXml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function renderRepositoryContext(context: RepositoryContext): string {
    const targets = context.targets
        .map(
            (target) =>
                `<target path="${escapeXml(target.path)}" specification="${escapeXml(target.specification)}" source="${escapeXml(target.sourceId)}" />`,
        )
        .join('\n');
    const sources = context.sources
        .map((source) => `<source id="${escapeXml(source.id)}" path="${escapeXml(source.path)}" kind="${source.kind}" />`)
        .join('\n');

    return `<repository_context root=".">

All paths in this prompt are relative to the repository root above. Inspect existing target files before editing them. Create a target only when it does not already exist. Keep every change inside the declared targets unless a contract explicitly requires another repository path.

<implementation_targets>

${targets}

</implementation_targets>

<specification_sources>

${sources}

</specification_sources>

</repository_context>`;
}

export function renderSourceMarker(sourceIds: string[]): string {
    return `<source_ref ids="${escapeXml([...new Set(sourceIds)].join(','))}" />`;
}

function resolveReferences(body: string, names: Set<string>): string {
    return body.replace(/(?<!\{)\{([A-Za-z][A-Za-z0-9_.-]*)}(?!})/g, (_match, name: string) => {
        if (!names.has(name)) {
            fire(ErrorCode.REFERENCE_ERROR, `Unresolved reference: ${name}.`, { meta: { name } });
        }
        return name;
    });
}

function renderBlock(block: RawBlock, reads: Map<string, ReadRef>, names: Set<string>): string {
    return renderKeyword(block, resolveReferences(block.body, names), reads);
}

type RenderGroup = {
    block: RawBlock;
    sourceIds: string[];
};

function groupBlocks(blocks: RawBlock[], sourceIds: Map<string, string>): Map<Directive, RenderGroup[]> {
    const groups = new Map<Directive, RenderGroup[]>();
    for (const block of blocks) {
        const definition = getKeyword(block.directive);
        if (definition.merge === 'drop' || block.directive === 'read') {
            continue;
        }
        const id = sourceIds.get(block.sourcePath);
        if (id === undefined) {
            continue;
        }
        const existing = groups.get(block.directive) ?? [];
        if (definition.merge === 'replace') {
            groups.set(block.directive, [{ block, sourceIds: [id] }]);
        } else if (definition.merge === 'concat') {
            const group = existing[0];
            if (group === undefined) {
                groups.set(block.directive, [{ block: { ...block }, sourceIds: [id] }]);
            } else {
                group.block.body = [
                    group.block.body,
                    block.body,
                ]
                    .filter(Boolean)
                    .join('\n\n');
                group.sourceIds.push(id);
            }
        } else if (definition.merge === 'by-name') {
            const group = existing.find((item) => item.block.name === block.name);
            if (group === undefined) {
                existing.push({ block: { ...block }, sourceIds: [id] });
            } else {
                group.block.body = [
                    group.block.body,
                    block.body,
                ]
                    .filter(Boolean)
                    .join('\n\n');
                group.sourceIds.push(id);
            }
            groups.set(block.directive, existing);
        } else if (definition.merge === 'append') {
            existing.push({ block, sourceIds: [id] });
            groups.set(block.directive, existing);
        }
    }
    return groups;
}

export async function compile(input: CompilerInput): Promise<string> {
    const filtered = filterIgnored(input);
    if (filtered.blocks.length === 0 && filtered.reads.size === 0) {
        return '';
    }

    const context = buildRepositoryContext(filtered);
    const sourceIds = new Map(
        context.sources.map((source) => [
            source.path,
            source.id,
        ]),
    );
    const names = new Set<string>();
    for (const block of filtered.blocks) {
        if (block.name !== undefined) {
            names.add(block.name);
        }
    }
    for (const name of filtered.reads.keys()) {
        names.add(name);
    }

    const sections: string[] = [
        header,
        renderRepositoryContext(context),
    ];

    const renderedReads = new Set<string>();
    for (let index = filtered.blocks.length - 1; index >= 0; index -= 1) {
        const block = filtered.blocks[index];
        if (block?.directive !== 'read' || block.name === undefined || renderedReads.has(block.name) || !filtered.reads.has(block.name)) {
            continue;
        }
        renderedReads.add(block.name);
        const id = sourceIds.get(block.sourcePath);
        if (id !== undefined) {
            sections.splice(2, 0, `${renderSourceMarker([id])}\n\n${renderBlock(block, filtered.reads, names)}`);
        }
    }

    const groups = groupBlocks(filtered.blocks, sourceIds);
    for (const directive of keywordOrder) {
        for (const group of groups.get(directive) ?? []) {
            const rendered = renderBlock(group.block, filtered.reads, names);
            sections.push(`${renderSourceMarker(group.sourceIds)}\n\n${rendered}`);
        }
    }
    sections.push(footer);
    return sections.join('\n\n');
}
