import * as FsPromises from 'node:fs/promises';
import * as Os from 'node:os';
import * as Path from 'node:path';

import type { HintbookData } from './hintbook.js';
import { findInstruction } from './compiler.js';
import { loadConfig } from './config.js';
import { availableTargets, canonicalKeyword, findEmitTemplate, matchesGlob, planEmit, renderArtifact, selectEmitter } from './emit.js';
import { parseHints } from './parser.js';
import { emitPacks, isEmitPack, loadHintbook, loadHintbooks, vocabularyBooks } from './hintbook.js';
import { countSurfaceKeywords } from './verify.js';

const roots: string[] = [];

async function write(root: string, path: string, content: string): Promise<void> {
    const filePath = Path.join(root, path);

    await FsPromises.mkdir(Path.dirname(filePath), { recursive: true });
    await FsPromises.writeFile(filePath, content, 'utf8');
}

async function makeBooks(): Promise<string> {
    const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-emit-'));

    roots.push(root);

    await write(root, 'keywords/hintbook.json', '{"id":"vocab"}');
    await write(root, 'keywords/app.md', '---\nsynonyms:\n    - application\n---\n\n<application>{name}</application>');
    await write(root, 'keywords/func.md', '---\nsurface: true\n---\n\n<function_contract>{name}</function_contract>');
    await write(root, 'keywords/decision.md', '<decision>{name}</decision>');

    await write(root, 'emit/typescript/hintbook.json', '{"id":"emit-ts","target":"typescript","match":["*.ts","*.tsx"],"comment":"// {text}","symbols":"adapter-ts {file}"}');
    await write(root, 'emit/typescript/func.tmpl', 'export function {name}() {}');
    await write(root, 'emit/typescript/app.tmpl', '// app {name}');

    await write(root, 'emit/go/hintbook.json', '{"id":"emit-go","target":"go","match":["*.go"],"comment":"// {text}"}');
    await write(root, 'emit/go/func.tmpl', 'func {name}() {}');

    return root;
}

async function loadAll(root: string): Promise<HintbookData[]> {
    // Sorted, exactly as `resolveHintbookPaths` returns them — which is why emit/ precedes keywords/.
    return [
        await loadHintbook(Path.join(root, 'emit/go')),
        await loadHintbook(Path.join(root, 'emit/typescript')),
        await loadHintbook(Path.join(root, 'keywords')),
    ];
}

afterAll(async () => {
    for (const root of roots) {
        await FsPromises.rm(root, { recursive: true, force: true });
    }
});

describe('loadHintbook', () => {
    it('reads the emitter manifest and loads .tmpl instead of .md', async () => {
        const pack = await loadHintbook(Path.join(await makeBooks(), 'emit/typescript'));

        expect(pack.target).toBe('typescript');
        expect(pack.match).toEqual([
            '*.ts',
            '*.tsx',
        ]);
        expect(pack.comment).toBe('// {text}');
        expect(pack.symbols).toBe('adapter-ts {file}');
        expect(pack.instructions.map((instruction) => instruction.name).sort()).toEqual([
            'app',
            'func',
        ]);
        expect(pack.instructions.find((instruction) => instruction.name === 'func')?.content).toContain('export function');
    });

    it('leaves a vocabulary book untouched — no target, .md only', async () => {
        const book = await loadHintbook(Path.join(await makeBooks(), 'keywords'));

        expect(book.target).toBeUndefined();
        expect(isEmitPack(book)).toBe(false);
        expect(book.instructions.map((instruction) => instruction.name).sort()).toEqual([
            'app',
            'decision',
            'func',
        ]);
    });

    it('ignores a .tmpl in a vocabulary book and a .md in an emit pack', async () => {
        const root = await makeBooks();

        await write(root, 'keywords/stray.tmpl', 'not a keyword');
        await write(root, 'emit/go/notes.md', 'not a template');

        const vocab = await loadHintbook(Path.join(root, 'keywords'));
        const pack = await loadHintbook(Path.join(root, 'emit/go'));

        expect(vocab.instructions.map((instruction) => instruction.name)).not.toContain('stray');
        expect(pack.instructions.map((instruction) => instruction.name)).not.toContain('notes');
    });
});

// Hintbook folders resolve in sorted order, so `emit/go` and `emit/typescript` both come before
// `keywords`. Every consumer of the vocabulary has to skip them or the wrong content wins.
describe('emit packs never shadow the vocabulary', () => {
    it('findInstruction resolves to the vocabulary even though emit packs sort first', async () => {
        const hintbooks = await loadAll(await makeBooks());

        expect(hintbooks[0]!.id).toBe('emit-go');
        expect(findInstruction(hintbooks, 'func')?.content).toContain('<function_contract>');
        expect(findInstruction(hintbooks, 'func')?.content).not.toContain('func {name}()');
    });

    it('resolves a synonym to the vocabulary instruction, not to an emit template', async () => {
        const hintbooks = await loadAll(await makeBooks());

        expect(findInstruction(hintbooks, 'application')?.content).toContain('<application>');
    });

    it('does not count emit templates as surface keywords', async () => {
        const hintbooks = await loadAll(await makeBooks());

        // `func` is surface-flagged once, in the vocabulary — not once per target.
        expect(countSurfaceKeywords(hintbooks)).toBe(1);
    });

    it('partitions books by kind', async () => {
        const hintbooks = await loadAll(await makeBooks());

        expect(vocabularyBooks(hintbooks).map((book) => book.id)).toEqual(['vocab']);
        expect(emitPacks(hintbooks).map((book) => book.id)).toEqual([
            'emit-go',
            'emit-ts',
        ]);
    });
});

describe('matchesGlob', () => {
    it('matches a bare pattern against the basename', () => {
        expect(matchesGlob('*.ts', 'src/billing/invoice.ts')).toBe(true);
        expect(matchesGlob('*.ts', 'src/billing/invoice.go')).toBe(false);
    });

    it('matches a pattern with a separator against the whole path', () => {
        expect(matchesGlob('src/**/*.ts', 'src/billing/invoice.ts')).toBe(true);
        expect(matchesGlob('src/*.ts', 'src/billing/invoice.ts')).toBe(false);
    });

    it('treats a dot as a literal', () => {
        expect(matchesGlob('*.ts', 'src/invoiceXts')).toBe(false);
    });
});

describe('selectEmitter', () => {
    it('selects by the output path when no target is given', async () => {
        const hintbooks = await loadAll(await makeBooks());

        expect(selectEmitter(hintbooks, 'src/billing/invoice.ts')?.target).toBe('typescript');
        expect(selectEmitter(hintbooks, 'cmd/serve/main.go')?.target).toBe('go');
    });

    it('returns null when nothing matches, rather than guessing', async () => {
        const hintbooks = await loadAll(await makeBooks());

        expect(selectEmitter(hintbooks, 'docs/readme.md')).toBeNull();
    });

    it('lets an explicit target override the path', async () => {
        const hintbooks = await loadAll(await makeBooks());

        expect(selectEmitter(hintbooks, 'src/billing/invoice.ts', 'go')?.target).toBe('go');
        expect(selectEmitter(hintbooks, 'src/billing/invoice.ts', 'kotlin')).toBeNull();
    });

    it('lists the targets that exist', async () => {
        expect(availableTargets(await loadAll(await makeBooks()))).toEqual([
            'go',
            'typescript',
        ]);
    });
});

describe('findEmitTemplate', () => {
    it('finds a template through the vocabulary synonym', async () => {
        const hintbooks = await loadAll(await makeBooks());
        const emitter = selectEmitter(hintbooks, 'src/a.ts')!;

        expect(canonicalKeyword(hintbooks, 'application')).toBe('app');
        expect(findEmitTemplate(emitter, hintbooks, 'application')?.content).toBe('// app {name}');
    });

    // The whole anti-bloat mechanism: no template, no output. Nothing configures this.
    it('returns null for a keyword the target has no template for', async () => {
        const hintbooks = await loadAll(await makeBooks());
        const emitter = selectEmitter(hintbooks, 'src/a.ts')!;

        expect(findEmitTemplate(emitter, hintbooks, 'decision')).toBeNull();
    });

    it('returns null for a keyword no vocabulary defines', async () => {
        const hintbooks = await loadAll(await makeBooks());
        const emitter = selectEmitter(hintbooks, 'src/a.ts')!;

        expect(findEmitTemplate(emitter, hintbooks, 'nonsense')).toBeNull();
    });
});

// ---------------------------------------------------------------------------------------------
// plan + render
// ---------------------------------------------------------------------------------------------

async function makeProject(): Promise<string> {
    const root = await FsPromises.mkdtemp(Path.join(await FsPromises.realpath(Os.tmpdir()), 'hint-emitp-'));

    roots.push(root);

    await write(root, 'books/keywords/hintbook.json', '{"id":"vocab"}');
    await write(root, 'books/keywords/entity.md', '<data_structure>{name}</data_structure>');
    await write(root, 'books/keywords/field.md', '<field>{name}</field>');
    await write(root, 'books/keywords/func.md', '<function_contract>{name}</function_contract>');
    await write(root, 'books/keywords/arg.md', '<argument>{name}</argument>');
    await write(root, 'books/keywords/result.md', '<return>{name}</return>');
    await write(root, 'books/keywords/decision.md', '<decision>{name}</decision>');
    await write(root, 'books/keywords/bad.md', '<prohibited>{name}</prohibited>');

    await write(root, 'books/ts/hintbook.json', '{"id":"emit-ts","target":"typescript","match":["*.ts"],"comment":"// {text}"}');
    await write(root, 'books/ts/entity.tmpl', '{doc}\nexport interface {name} {\n    {children:field sep="\\n"}\n}');
    await write(root, 'books/ts/field.tmpl', '{ident}{?: {type}};');
    await write(root, 'books/ts/arg.tmpl', '{ident}{?: {type}}');
    await write(root, 'books/ts/result.tmpl', '{name}');
    await write(root, 'books/ts/func.tmpl', 'export function {name}({children:arg sep=", "}){?: {child:result}} {\n    {hole:body}\n}');

    await write(root, 'books/go/hintbook.json', '{"id":"emit-go","target":"go","match":["*.go"],"comment":"// {text}"}');
    await write(root, 'books/go/arg.tmpl', '{ident} {type|any}');
    await write(root, 'books/go/func.tmpl', 'func {name}({children:arg sep=", "}) {\n    {hole:body}\n}');

    // The document target: no holes, no adapter, no model — deterministic end to end.
    await write(root, 'books/md/hintbook.json', '{"id":"emit-md","target":"markdown","match":["*.md"],"comment":"<!-- {text} -->"}');
    await write(root, 'books/md/entity.tmpl', '## {name}\n\n{body}\n\n{children}');
    await write(root, 'books/md/field.tmpl', '- **{ident}**{?: {type}} — {body}');

    await write(root, 'hint.yml', 'name: temp\nbooks:\n    - file://books\n');

    return root;
}

async function planFor(root: string, paths: string[], target?: string) {
    const config = await loadConfig(root);
    const hintbooks = await loadHintbooks(root, config?.books ?? []);
    const hints = await parseHints(root, paths);

    return { hintbooks, plan: planEmit(hints, hintbooks, target) };
}

describe('planEmit', () => {
    it('makes a unit per companion spec, and never for a folder hint', async () => {
        const root = await makeProject();

        await write(root, '_.hint', '# decision Money is integer minor units\n\nBecause decimals drifted.\n');
        await write(root, 'src/_.hint', '# bad SilentDefaults\n\nNever coerce invalid input valid.\n');
        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nThe persisted record.\n');

        const { plan } = await planFor(root, ['src/**']);

        expect(plan.units.map((unit) => unit.output)).toEqual(['src/invoice.ts']);
        expect(plan.folders).toBeGreaterThan(0);
    });

    it('skips a spec whose output no emitter matches', async () => {
        const root = await makeProject();

        await write(root, 'src/schema.sql.hint', '# entity Invoice\n\nbody\n');

        const { plan } = await planFor(root, ['src/schema.sql']);

        expect(plan.units).toEqual([]);
        expect(plan.skipped).toEqual([{ output: 'src/schema.sql', reason: 'no-emitter' }]);
    });

    it('produces no units at all for a folder-knowledge repository', async () => {
        const root = await makeProject();

        await write(root, 'src/_.hint', '# decision Only folder knowledge here\n\nbody\n');

        const { plan } = await planFor(root, ['src/**']);

        expect(plan.units).toEqual([]);
        expect(plan.skipped).toEqual([]);
        expect(plan.folders).toBeGreaterThan(0);
    });

    it('honors an explicit target over the output path', async () => {
        const root = await makeProject();

        await write(root, 'src/svc.ts.hint', '# func Run\n\nbody\n');

        expect((await planFor(root, ['src/svc.ts'])).plan.units[0]!.target).toBe('typescript');
        expect((await planFor(root, ['src/svc.ts'], 'go')).plan.units[0]!.target).toBe('go');
    });
});

describe('renderArtifact', () => {
    it('renders an entity with typed and untyped fields', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nThe persisted invoice record.\n\n## field id: string\n\n## field notes\n');

        const { hintbooks, plan } = await planFor(root, ['src/invoice.ts']);

        expect(renderArtifact(plan.units[0]!, hintbooks)).toBe(
            ['// The persisted invoice record.', 'export interface Invoice {', '    id: string;', '    notes;', '}'].join('\n'),
        );
    });

    // A block with no template in this target produces nothing. Nothing configures that.
    it('emits nothing for decision and bad blocks', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# decision Use integers\n\nbody\n\n# bad Floats\n\nbody\n');

        const { hintbooks, plan } = await planFor(root, ['src/invoice.ts']);

        expect(renderArtifact(plan.units[0]!, hintbooks)).toBe('');
    });

    it('degrades per target when the spec states no type', async () => {
        const root = await makeProject();

        await write(root, 'src/svc.ts.hint', '# func run\n\nbody\n\n## arg options\n');
        await write(root, 'src/svc.go.hint', '# func run\n\nbody\n\n## arg options\n');

        const ts = await planFor(root, ['src/svc.ts']);
        const go = await planFor(root, ['src/svc.go']);

        // TypeScript drops the annotation; Go, which cannot, falls back.
        expect(renderArtifact(ts.plan.units[0]!, ts.hintbooks)).toContain('run(options)');
        expect(renderArtifact(go.plan.units[0]!, go.hintbooks)).toContain('run(options any)');
    });

    it('renders a return type only when the spec declared one', async () => {
        const root = await makeProject();

        await write(root, 'src/a.ts.hint', '# func run\n\nbody\n\n## result: Invoice\n');
        await write(root, 'src/b.ts.hint', '# func run\n\nbody\n');

        const withResult = await planFor(root, ['src/a.ts']);
        const without = await planFor(root, ['src/b.ts']);

        expect(renderArtifact(withResult.plan.units[0]!, withResult.hintbooks)).toContain('run(): Invoice {');
        expect(renderArtifact(without.plan.units[0]!, without.hintbooks)).toContain('run() {');
    });

    it('carries the inherited constraints into the hole', async () => {
        const root = await makeProject();

        await write(root, '_.hint', '# decision Money is integer minor units\n\nBecause decimals drifted.\n');
        await write(root, 'src/_.hint', '# bad SilentDefaults\n\nNever coerce invalid input valid.\n');
        await write(root, 'src/svc.ts.hint', '# func settle\n\nSettles an invoice.\n');

        const { hintbooks, plan } = await planFor(root, ['src/svc.ts']);
        const artifact = renderArtifact(plan.units[0]!, hintbooks);

        expect(artifact).toContain('// hint:hole(body)');
        expect(artifact).toContain('// Settles an invoice.');
        expect(artifact).toContain('// Honor:');
        expect(artifact).toContain('decision Money is integer minor units — Because decimals drifted.  (root)');
        expect(artifact).toContain('bad SilentDefaults — Never coerce invalid input valid.  (src)');
        // The hole keeps the indentation of the template line it sat on.
        expect(artifact).toContain('\n    // Settles an invoice.');
        expect(artifact).toMatch(/\n {4}\/\/ hint:hole\(body\) spec=[0-9a-f]{8}/);
    });

    // The proof that the model generalizes past code: no holes, no adapter, no model.
    it('renders a document target end to end', async () => {
        const root = await makeProject();

        await write(root, 'contracts/nda.md.hint', '# entity Confidentiality\n\nThe receiving party protects it.\n\n## field Term: 5 years\n\nFrom the effective date.\n');

        const { hintbooks, plan } = await planFor(root, ['contracts/nda.md']);

        expect(plan.units[0]!.target).toBe('markdown');
        expect(renderArtifact(plan.units[0]!, hintbooks)).toBe(
            ['## Confidentiality', '', 'The receiving party protects it.', '', '- **Term**: 5 years — From the effective date.'].join('\n'),
        );
    });

    it('is deterministic', async () => {
        const root = await makeProject();

        await write(root, 'src/invoice.ts.hint', '# entity Invoice\n\nbody\n\n## field id: string\n');

        const first = await planFor(root, ['src/invoice.ts']);
        const second = await planFor(root, ['src/invoice.ts']);

        expect(renderArtifact(first.plan.units[0]!, first.hintbooks)).toBe(renderArtifact(second.plan.units[0]!, second.hintbooks));
    });
});
