import { ErrorCode, fire } from '../error.js';

export const directives = [
    'read',
    'lang',
    'deps',
    'build',
    'app',
    'lib',
    'namespace',
    'module',
    'res',
    'rule',
    'entity',
    'function',
    'ui',
    'action',
    'good',
    'bad',
    'example',
    'test',
    'notes',
] as const;

export type Directive = (typeof directives)[number];
export type SourceKind = 'baseline' | 'direct' | 'file';

export type RawBlock = {
    directive: Directive;
    name: string | undefined;
    body: string;
    sourcePath: string;
    sourceKind: SourceKind;
};

export type ReadRef = {
    name: string;
    glob: string;
    description: string;
};

export type KeywordInput = {
    block: RawBlock;
    directive: Directive;
    name: string | undefined;
    body: string;
    reads: Map<string, ReadRef>;
};

export type NamePolicy = 'forbidden' | 'optional' | 'required';
export type MergePolicy = 'append' | 'replace' | 'concat' | 'by-name' | 'drop';

export type KeywordDefinition = {
    directive: Directive;
    name: NamePolicy;
    merge: MergePolicy;
    order: number;
    bodyRequired?: boolean;
    namePattern?: RegExp;
    render: (input: KeywordInput) => string;
};

const aliases: Readonly<Record<string, Directive>> = {
    language: 'lang',
    dependencies: 'deps',
    pipeline: 'build',
    ci: 'build',
    application: 'app',
    library: 'lib',
    ns: 'namespace',
    package: 'namespace',
    resource: 'res',
    rules: 'rule',
    constraint: 'rule',
    constraints: 'rule',
    struct: 'entity',
    model: 'entity',
    schema: 'entity',
    func: 'function',
    fn: 'function',
    method: 'function',
    screen: 'ui',
    view: 'ui',
    page: 'ui',
    component: 'ui',
    macro: 'action',
    automation: 'action',
    pattern: 'good',
    patterns: 'good',
    'best-practice': 'good',
    'best-practices': 'good',
    antipattern: 'bad',
    antipatterns: 'bad',
    forbidden: 'bad',
    prohibit: 'bad',
    sample: 'example',
    demo: 'example',
    verify: 'test',
    spec: 'test',
    criteria: 'test',
    note: 'notes',
    comment: 'notes',
    todo: 'notes',
    fixme: 'notes',
    draft: 'notes',
};

const directiveSet = new Set<string>(directives);

export function normalizeDirective(value: string): Directive | undefined {
    const normalized = value.toLowerCase();
    return aliases[normalized] ?? (directiveSet.has(normalized) ? (normalized as Directive) : undefined);
}

export function defineKeyword(definition: KeywordDefinition): KeywordDefinition {
    return definition;
}

export function interpolate(template: string, fields: Record<string, string | undefined>): string {
    let output = template;
    output = output.replace(/\{\{#(\w+)}}([\s\S]*?)\{\{\/\1}}/g, (_match, field: string, body: string) => (fields[field] ? body : ''));
    output = output.replace(/\{\{\^(\w+)}}([\s\S]*?)\{\{\/\1}}/g, (_match, field: string, body: string) => (fields[field] ? '' : body));
    output = output.replace(/\{\{(\w+)}}/g, (_match, field: string) => fields[field] ?? '');
    return output.trim();
}

export function templateKeyword(definition: Omit<KeywordDefinition, 'render'> & { template: string }): KeywordDefinition {
    return defineKeyword({
        ...definition,
        render: ({ name, body }) => interpolate(definition.template, { name, body }),
    });
}

export function validateKeyword(definition: KeywordDefinition, block: RawBlock): void {
    if (definition.name === 'forbidden' && block.name !== undefined) {
        fire(ErrorCode.PARSE_ERROR, `${block.directive} blocks cannot have a name.`, {
            meta: { sourcePath: block.sourcePath },
        });
    }
    if (definition.name === 'required' && block.name === undefined) {
        fire(ErrorCode.PARSE_ERROR, `${block.directive} blocks require a name.`, {
            meta: { sourcePath: block.sourcePath },
        });
    }
    if (definition.bodyRequired === true && block.body === '') {
        fire(ErrorCode.PARSE_ERROR, `${block.directive} blocks cannot be empty.`, {
            meta: { sourcePath: block.sourcePath },
        });
    }
    if (block.name !== undefined && definition.namePattern !== undefined && !definition.namePattern.test(block.name)) {
        fire(ErrorCode.PARSE_ERROR, `Invalid ${block.directive} name: ${block.name}.`, {
            meta: { sourcePath: block.sourcePath },
        });
    }
}

export type SubBlock = {
    kind: string;
    label: string | undefined;
    content: string;
};

export function splitSubBlocks(body: string): {
    intro: string;
    subBlocks: SubBlock[];
} {
    const lines = body.split('\n');
    const intro: string[] = [];
    const subBlocks: SubBlock[] = [];
    let current:
        | {
              kind: string;
              label: string | undefined;
              content: string[];
          }
        | undefined;

    for (const line of lines) {
        const match = /^##\s+(\S+)(?:\s+(.*))?$/.exec(line);
        if (match !== null) {
            if (current !== undefined) {
                subBlocks.push({
                    ...current,
                    content: current.content.join('\n').trim(),
                });
            }
            current = {
                kind: normalizeSubBlockKind(match[1] ?? ''),
                label: match[2]?.trim() || undefined,
                content: [],
            };
        } else if (current === undefined) {
            intro.push(line);
        } else {
            current.content.push(line);
        }
    }
    if (current !== undefined) {
        subBlocks.push({
            ...current,
            content: current.content.join('\n').trim(),
        });
    }
    return { intro: intro.join('\n').trim(), subBlocks };
}

function normalizeSubBlockKind(kind: string): string {
    const normalized = kind.toLowerCase();
    if (normalized === 'argument') {
        return 'arg';
    }
    if (normalized === 'returns') {
        return 'return';
    }
    return normalized;
}
