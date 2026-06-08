import { existsSync, globSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { Directive, RawBlock, ReadRef, SourceKind } from './keywords/index.js';
import { ErrorCode, fire, wrap } from './error.js';
import { normalizeDirective } from './keywords/index.js';

export type { Directive, RawBlock, ReadRef, SourceKind } from './keywords/index.js';

export type ParsedFile = {
    hintPath: string;
    sourceKind: SourceKind;
    blocks: RawBlock[];
    reads: ReadRef[];
};

export type ProjectConfig = {
    ignore: string[];
};

export type ReadExtraction = {
    content: string;
    reads: ReadRef[];
};

export type IgnoreMatcher = {
    matches: (path: string) => boolean;
    matchedRule: (path: string) => string | undefined;
};

export type ParseResult = {
    targetPaths: string[];
    files: ParsedFile[];
    blocks: RawBlock[];
    reads: Map<string, ReadRef>;
    projectRoot: string;
    config: ProjectConfig;
};

function toPosix(path: string): string {
    return path.split(sep).join('/');
}

function parseYamlScalar(value: string, line: number): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        fire(ErrorCode.PARSE_ERROR, `Empty ignore entry at line ${line}.`);
    }

    if (trimmed.startsWith('"')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (typeof parsed !== 'string') {
                throw new Error('not a string');
            }
            return parsed;
        } catch (raw) {
            throw wrap(raw, ErrorCode.PARSE_ERROR, { line });
        }
    }

    if (trimmed.startsWith("'")) {
        if (!trimmed.endsWith("'") || trimmed.length < 2) {
            fire(ErrorCode.PARSE_ERROR, `Invalid quoted ignore entry at line ${line}.`);
        }
        return trimmed.slice(1, -1).replaceAll("''", "'");
    }

    if (/^(?:null|~|true|false|[-+]?(?:\d+\.?\d*|\.\d+))$/i.test(trimmed) || /^[{[]/.test(trimmed)) {
        fire(ErrorCode.PARSE_ERROR, `Ignore entry at line ${line} must be a string.`);
    }

    return trimmed;
}

export async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig> {
    const ymlPath = resolve(projectRoot, 'hint.yml');
    const yamlPath = resolve(projectRoot, 'hint.yaml');
    const configPath = existsSync(ymlPath) ? ymlPath : yamlPath;
    let content: string;

    try {
        content = await readFile(configPath, 'utf8');
    } catch (raw) {
        throw wrap(raw, ErrorCode.IO_ERROR, { path: configPath });
    }

    const ignore: string[] = [];
    let inIgnore = false;

    for (const [
        index,
        rawLine,
    ] of content.replaceAll('\r\n', '\n').split('\n').entries()) {
        const line = index + 1;
        if (rawLine.trim() === '' || rawLine.trimStart().startsWith('#')) {
            continue;
        }

        if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
            const match = /^([A-Za-z][\w-]*):(?:\s*(.*))?$/.exec(rawLine);
            if (match === null || match[1] !== 'ignore') {
                fire(ErrorCode.PARSE_ERROR, `Unsupported project configuration at line ${line}.`, {
                    meta: { path: configPath, line },
                });
            }
            if ((match[2] ?? '').trim() !== '') {
                fire(ErrorCode.PARSE_ERROR, `ignore must be an indented string sequence at line ${line}.`, {
                    meta: { path: configPath, line },
                });
            }
            inIgnore = true;
            continue;
        }

        if (!inIgnore || rawLine.includes('\t')) {
            fire(ErrorCode.PARSE_ERROR, `Malformed indentation at line ${line}.`, {
                meta: { path: configPath, line },
            });
        }

        const item = /^(\s+)-\s+(.+)$/.exec(rawLine);
        if (item === null) {
            fire(ErrorCode.PARSE_ERROR, `ignore must contain only string entries at line ${line}.`, {
                meta: { path: configPath, line },
            });
        }
        ignore.push(parseYamlScalar(item[2] ?? '', line));
    }

    return { ignore };
}

function globFragmentToRegex(pattern: string): string {
    let output = '';
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index] ?? '';
        if (char === '*') {
            if (pattern[index + 1] === '*') {
                index += 1;
                if (pattern[index + 1] === '/') {
                    index += 1;
                    output += '(?:.*/)?';
                } else {
                    output += '.*';
                }
            } else {
                output += '[^/]*';
            }
        } else if (char === '?') {
            output += '[^/]';
        } else if (char === '[') {
            const end = pattern.indexOf(']', index + 1);
            if (end === -1) {
                output += '\\[';
            } else {
                const range = pattern.slice(index + 1, end).replace(/^!/, '^');
                output += `[${range}]`;
                index = end;
            }
        } else {
            output += char.replace(/[\\^$+?.()|{}]/g, '\\$&');
        }
    }
    return output;
}

function compileIgnorePattern(pattern: string): RegExp {
    const directory = pattern.endsWith('/');
    const anchored = pattern.startsWith('/');
    let normalized = pattern.replace(/^\//, '').replace(/\/$/, '');
    const hasSlash = normalized.includes('/');
    normalized = globFragmentToRegex(normalized);

    const prefix = anchored || hasSlash ? '^' : '(?:^|.*/)';
    const suffix = directory ? '(?:/.*)?$' : '(?:$|/.*$)';
    return new RegExp(`${prefix}${normalized}${suffix}`);
}

export function createIgnoreMatcher(projectRoot: string, patterns: string[]): IgnoreMatcher {
    const absoluteRoot = resolve(projectRoot);
    const rules = patterns.flatMap((original) => {
        let pattern = original;
        if (pattern.trim() === '') {
            return [];
        }
        if (pattern.startsWith('\\#') || pattern.startsWith('\\!')) {
            pattern = pattern.slice(1);
        } else if (pattern.startsWith('#')) {
            return [];
        }

        const negated = pattern.startsWith('!');
        if (negated) {
            pattern = pattern.slice(1);
        }
        return [{ original, negated, regex: compileIgnorePattern(pattern) }];
    });

    const normalize = (candidate: string): string | undefined => {
        const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(absoluteRoot, candidate);
        const projectRelative = relative(absoluteRoot, absolute);
        if (projectRelative === '..' || projectRelative.startsWith(`..${sep}`) || isAbsolute(projectRelative)) {
            return undefined;
        }
        return toPosix(projectRelative).replace(/^\.\//, '');
    };

    const evaluatePath = (normalized: string): { ignored: boolean; rule: string | undefined } => {
        let ignored = false;
        let rule: string | undefined;
        for (const current of rules) {
            if (current.regex.test(normalized)) {
                ignored = !current.negated;
                rule = current.original;
            }
        }
        return { ignored, rule };
    };

    const evaluate = (candidate: string): { ignored: boolean; rule: string | undefined } => {
        const normalized = normalize(candidate);
        if (normalized === undefined) {
            return { ignored: false, rule: undefined };
        }

        const result = evaluatePath(normalized);
        if (result.ignored) {
            return result;
        }

        const segments = normalized.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            const parent = evaluatePath(segments.slice(0, index).join('/'));
            if (parent.ignored) {
                return parent;
            }
        }
        return result;
    };

    return {
        matches: (path) => evaluate(path).ignored,
        matchedRule: (path) => evaluate(path).rule,
    };
}

export function normalizeInputPaths(paths: string[]): string[] {
    return paths.map((path) => (path.endsWith('.hint') ? path : `${path}.hint`));
}

export async function findProjectRoot(startDir: string): Promise<string> {
    let current = resolve(startDir);
    while (true) {
        if (existsSync(resolve(current, 'hint.yml')) || existsSync(resolve(current, 'hint.yaml'))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            fire(ErrorCode.IO_ERROR, 'Could not find hint.yml or hint.yaml project marker.', {
                meta: { startDir: resolve(startDir) },
            });
        }
        current = parent;
    }
}

export function discoverHierarchy(hintPath: string, projectRoot: string, isIgnored: IgnoreMatcher): string[] {
    const absoluteHint = resolve(hintPath);
    const targetDir = dirname(absoluteHint);
    const directoryPath = relative(resolve(projectRoot), targetDir);
    const directories = [resolve(projectRoot)];
    if (directoryPath !== '') {
        let current = resolve(projectRoot);
        for (const segment of directoryPath.split(sep)) {
            current = resolve(current, segment);
            directories.push(current);
        }
    }

    const hierarchy: string[] = [];
    for (const directory of directories) {
        const baseline = resolve(directory, '_.hint');
        if (existsSync(baseline) && !isIgnored.matches(baseline)) {
            hierarchy.push(baseline);
        }
    }

    const withoutHint = absoluteHint.slice(0, -'.hint'.length);
    const sourceExtension = extname(withoutHint);
    if (sourceExtension !== '') {
        const direct = `${withoutHint.slice(0, -sourceExtension.length)}.hint`;
        if (direct !== absoluteHint && existsSync(direct) && !isIgnored.matches(direct)) {
            hierarchy.push(direct);
        }
    }

    if (!isIgnored.matches(absoluteHint)) {
        hierarchy.push(absoluteHint);
    }
    return hierarchy;
}

export async function loadFile(filePath: string): Promise<string> {
    try {
        return await readFile(filePath, 'utf8');
    } catch (raw) {
        throw wrap(raw, ErrorCode.IO_ERROR, { path: filePath });
    }
}

export async function resolveIncludes(content: string, baseDir: string, visited: Set<string>, isIgnored: IgnoreMatcher): Promise<string> {
    const lines = content.replaceAll('\r\n', '\n').split('\n');
    const output: string[] = [];

    for (const line of lines) {
        const include = /^\s*@include\s+(.+?)\s*$/.exec(line);
        if (include === null) {
            output.push(line);
            continue;
        }

        const includePath = resolve(baseDir, include[1] ?? '');
        if (isIgnored.matches(includePath)) {
            output.push('');
            continue;
        }
        if (visited.has(includePath)) {
            fire(ErrorCode.PARSE_ERROR, `Circular include detected at ${includePath}.`, {
                meta: { path: includePath },
            });
        }

        visited.add(includePath);
        const included = await loadFile(includePath);
        output.push(await resolveIncludes(included, dirname(includePath), visited, isIgnored));
        visited.delete(includePath);
    }

    return output.join('\n');
}

function deriveReadName(glob: string): string {
    const clean = glob.replace(/[*?[\]{}]/g, '').replace(/\/+$/, '');
    const stem = clean.split('/').filter(Boolean).at(-1) ?? 'reference';
    const words = stem
        .replace(/\.[^.]+$/, '')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    const name = words
        .map((word, index) => (index === 0 ? `${word.charAt(0).toLowerCase()}${word.slice(1)}` : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
        .join('');
    return name || 'reference';
}

function readHeader(line: string): { glob: string; name: string } | undefined {
    const match = /^#\s+read\s+\{([^}]+)\}(?:\s+as\s+\[?([^\]\s]+)\]?)?\s*$/i.exec(line);
    if (match === null) {
        return undefined;
    }
    const glob = (match[1] ?? '').trim();
    return { glob, name: match[2] ?? deriveReadName(glob) };
}

function filterReadGlob(glob: string, projectRoot: string, isIgnored: IgnoreMatcher): string | undefined {
    const matches = globSync(glob, { cwd: projectRoot }).map(toPosix);
    if (matches.length === 0) {
        return isIgnored.matches(resolve(projectRoot, glob)) ? undefined : glob;
    }
    const retained = matches.filter((path) => !isIgnored.matches(resolve(projectRoot, path)));
    if (retained.length === 0) {
        return undefined;
    }
    return retained.length === matches.length ? glob : retained.join(',');
}

export function extractReads(content: string, projectRoot: string, isIgnored: IgnoreMatcher): ReadExtraction {
    const lines = content.replaceAll('\r\n', '\n').split('\n');
    const output: string[] = [];
    const reads: ReadRef[] = [];
    let index = 0;

    while (index < lines.length) {
        const header = readHeader(lines[index] ?? '');
        if (header === undefined) {
            output.push(lines[index] ?? '');
            index += 1;
            continue;
        }

        const block = [lines[index] ?? ''];
        const body: string[] = [];
        index += 1;
        while (index < lines.length && !/^#\s+\S/.test(lines[index] ?? '') && !/^---\s*$/.test(lines[index] ?? '')) {
            block.push(lines[index] ?? '');
            body.push(lines[index] ?? '');
            index += 1;
        }

        const filteredGlob = filterReadGlob(header.glob, projectRoot, isIgnored);
        if (filteredGlob !== undefined) {
            const filteredHeader = `# read {${filteredGlob}} as [${header.name}]`;
            output.push(filteredHeader, ...block.slice(1));
            reads.push({
                name: header.name,
                glob: filteredGlob,
                description: body.join('\n').trim(),
            });
        }
    }

    return { content: output.join('\n'), reads };
}

function parseHeader(line: string): { directive: Directive; name: string | undefined } | undefined {
    const match = /^#\s+([A-Za-z][\w-]*)(?:\s+(.*?))?\s*$/.exec(line);
    if (match === null) {
        return undefined;
    }
    const rawDirective = (match[1] ?? '').toLowerCase();
    const directive = normalizeDirective(rawDirective);
    if (directive === undefined) {
        fire(ErrorCode.PARSE_ERROR, `Unknown directive: ${rawDirective}.`);
    }

    let name = match[2]?.trim() || undefined;
    if (directive === 'read') {
        const read = readHeader(line);
        name = read?.name;
    } else if (directive === 'test' && name?.startsWith('for ')) {
        name = name.slice(4).trim() || undefined;
    }
    return { directive, name };
}

export function tokenize(content: string, sourcePath: string, sourceKind: SourceKind): RawBlock[] {
    const lines = content.replaceAll('\r\n', '\n').split('\n');
    const blocks: RawBlock[] = [];
    let current: { directive: Directive; name: string | undefined; body: string[] } | undefined;
    let discardUntilHeader = false;

    const close = (): void => {
        if (current !== undefined && current.directive !== 'notes') {
            blocks.push({
                directive: current.directive,
                name: current.name,
                body: current.body.join('\n').trim(),
                sourcePath,
                sourceKind,
            });
        }
        current = undefined;
    };

    for (const line of lines) {
        const header = parseHeader(line);
        if (header !== undefined) {
            close();
            if (!discardUntilHeader) {
                current = { ...header, body: [] };
            }
            continue;
        }
        if (/^---\s*$/.test(line)) {
            close();
            discardUntilHeader = true;
            continue;
        }
        if (current !== undefined && !discardUntilHeader) {
            current.body.push(line);
        }
    }
    close();
    return blocks;
}

export async function parseFile(
    hintPath: string,
    sourceKind: SourceKind,
    includeVisited: Set<string>,
    isIgnored: IgnoreMatcher,
): Promise<ParsedFile | undefined> {
    const absolutePath = resolve(hintPath);
    if (isIgnored.matches(absolutePath)) {
        return undefined;
    }

    includeVisited.add(absolutePath);
    try {
        const content = await loadFile(absolutePath);
        const expanded = await resolveIncludes(content, dirname(absolutePath), includeVisited, isIgnored);
        const projectRoot = await findProjectRoot(dirname(absolutePath));
        const extraction = extractReads(expanded, projectRoot, isIgnored);
        return {
            hintPath: absolutePath,
            sourceKind,
            blocks: tokenize(extraction.content, absolutePath, sourceKind),
            reads: extraction.reads,
        };
    } finally {
        includeVisited.delete(absolutePath);
    }
}

export async function parse(inputPaths: string[]): Promise<ParseResult> {
    const normalized = normalizeInputPaths(inputPaths).map((path) => resolve(path));
    const start = normalized[0] === undefined ? process.cwd() : dirname(normalized[0]);
    const projectRoot = await findProjectRoot(start);
    const config = await loadProjectConfig(projectRoot);
    const matcher = createIgnoreMatcher(projectRoot, config.ignore);
    const targetPaths = normalized.filter((path) => !matcher.matches(path));
    const files: ParsedFile[] = [];
    const seen = new Set<string>();

    for (const targetPath of targetPaths) {
        for (const hintPath of discoverHierarchy(targetPath, projectRoot, matcher)) {
            if (seen.has(hintPath)) {
                continue;
            }
            seen.add(hintPath);
            const sourceKind: SourceKind = hintPath === targetPath ? 'file' : hintPath.endsWith(`${sep}_.hint`) ? 'baseline' : 'direct';
            const parsed = await parseFile(hintPath, sourceKind, new Set(), matcher);
            if (parsed !== undefined) {
                files.push(parsed);
            }
        }
    }

    const blocks = files.flatMap((file) => file.blocks);
    const reads = new Map<string, ReadRef>();
    for (const file of files) {
        for (const read of file.reads) {
            reads.set(read.name, read);
        }
    }

    return { targetPaths, files, blocks, reads, projectRoot, config };
}
