// Merge is the one module here that can destroy work. Everything else produces a wrong answer that
// somebody reads and disagrees with; this one silently drops an implementation somebody wrote. Its
// behaviour was covered only end to end through the CLI, which exercises the happy path and leaves the
// boundaries — an unterminated hole, a region whose markers nest, a file with two regions — untested.

import { extractHoles, findRegion, inspectHoles, mergeArtifact, readPreamble } from './merge.js';

const COMMENT = '// {text}';

function generated(body: string): string {
    return `// hint:begin\n${body}\n// hint:end`;
}

describe('findRegion', () => {
    it('finds nothing in a file that has none', () => {
        expect(findRegion('export const a = 1;\n')).toBeNull();
    });

    // The nesting rule the whole format rests on: a hole closes with the same token the region does,
    // so a scanner that stops at the first `hint:end` would cut the region off inside a function and
    // treat everything after it as hand-written.
    it('does not mistake a hole’s terminator for the region’s', () => {
        const content = generated('function f() {\n// hint:hole(#f:body)\nreturn 1;\n// hint:end of hole.\n}');
        const region = findRegion(content);

        expect(region).not.toBeNull();
        expect(content.split('\n')[region!.end]).toContain('hint:end');
        expect(content.split('\n').slice(region!.begin, region!.end + 1).join('\n')).toContain('return 1;');
    });

    // An unterminated region is a file somebody edited by hand into a broken state. Reporting no
    // region means the caller treats it as unmanaged and refuses to write, which is the safe read.
    it('reports nothing when the region was never closed', () => {
        expect(findRegion('// hint:begin\nexport const a = 1;\n')).toBeNull();
    });
});

describe('readPreamble', () => {
    it('is empty for a file that does not exist yet', () => {
        expect(readPreamble(null)).toBe('');
    });

    // Not "everything before the first line of code" — a hand-written file with no region has no
    // preamble to speak of, because nothing in it is above a region.
    it('is empty for a file that has no region', () => {
        expect(readPreamble('import { A } from "./a.js";\n')).toBe('');
    });

    it('is everything above the region and nothing inside it', () => {
        const preamble = readPreamble(`import { A } from "./a.js";\n\n${generated('export const b = 1;')}\n\ntrailing();`);

        expect(preamble).toContain('import { A }');
        expect(preamble).not.toContain('export const b');
        expect(preamble).not.toContain('trailing');
    });
});

describe('extractHoles', () => {
    it('keeps the body verbatim, indentation and blank lines included', () => {
        const holes = extractHoles(generated('// hint:hole(#f:body) spec=abc12345\n    if (x) {\n\n        go();\n    }\n// hint:end of hole.'));

        expect(holes.get('#f:body')?.body).toBe('    if (x) {\n\n        go();\n    }');
        expect(holes.get('#f:body')?.spec).toBe('abc12345');
    });

    // Two holes in one file addressed by their owning blocks — the collision that used to write one
    // function's body into the other.
    it('keeps two holes in one file apart', () => {
        const holes = extractHoles(
            generated(
                '// hint:hole(#a:body)\nfirst();\n// hint:end of hole.\n// hint:hole(#b:body)\nsecond();\n// hint:end of hole.',
            ),
        );

        expect(holes.get('#a:body')?.body).toBe('first();');
        expect(holes.get('#b:body')?.body).toBe('second();');
    });

    it('treats marker text inside a hole body as user content', () => {
        const content = generated('// hint:hole(#a:body)\nconsole.log("hint:end");\nconst note = "hint:begin";\n// hint:end of hole.');
        expect(extractHoles(content).get('#a:body')?.body).toContain('console.log("hint:end")');
        expect(extractHoles(content).get('#a:body')?.body).toContain('"hint:begin"');
    });

    it('reads legacy labels containing parentheses through the last delimiter', () => {
        const holes = extractHoles(generated('// hint:hole(func settle(x):body) spec=abc12345\nreturn x;\n// hint:end of hole.'));
        expect(holes.get('func settle(x):body')?.spec).toBe('abc12345');
    });

    // A file truncated mid-hole. Nothing is recovered rather than the rest of the file being adopted
    // as a body, which would then be re-emitted into the next artifact.
    it('drops a hole that was never closed', () => {
        expect(extractHoles('// hint:begin\n// hint:hole(#a:body)\nfirst();\n').size).toBe(0);
    });
});

describe('mergeArtifact', () => {
    const artifact = 'export function f(): void {\n// hint:hole(#f:body) spec=beef0001\nthrow new Error("todo");\n// hint:end of hole.\n}';

    it('wraps a fresh artifact and marks it created', () => {
        const merged = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');

        expect(merged.created).toBe(true);
        expect(merged.adopted).toBe(false);
        expect(merged.content).toContain('hint:begin');
        expect(merged.orphaned).toEqual([]);
    });

    it('carries a filled body across and leaves everything outside the region alone', () => {
        const first = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');
        const filled = `${first.content.replace('throw new Error("todo");', 'return go();')}\n\nfunction helper() {}\n`;
        const second = mergeArtifact(filled, artifact, COMMENT, 'src/a.ts.hint');

        expect(second.restored).toBe(1);
        expect(second.content).toContain('return go();');
        expect(second.content).toContain('function helper() {}');
        expect(second.drifted).toEqual([]);
    });

    // The body was written against a spec that has since changed. It is kept — nobody's work is
    // thrown away over this — and named, because nothing else in the pipeline would notice.
    it('reports a body written against a spec that has since moved', () => {
        const first = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');
        const filled = first.content.replace('throw new Error("todo");', 'return go();');
        const second = mergeArtifact(filled, artifact.replace('beef0001', 'beef0002'), COMMENT, 'src/a.ts.hint');

        expect(second.drifted).toEqual(['#f:body']);
        expect(second.content).toContain('return go();');
    });

    // The block that owned the body is gone from the spec. The merge reports it rather than dropping
    // it, and the caller refuses the write — a body with nowhere to go cannot be recovered afterwards.
    it('reports an implementation the new artifact has nowhere to put', () => {
        const first = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');
        const filled = first.content.replace('throw new Error("todo");', 'return go();');
        const second = mergeArtifact(filled, 'export const unrelated = 1;', COMMENT, 'src/a.ts.hint');

        expect(second.orphaned.map((hole) => hole.label)).toEqual(['#f:body']);
        expect(second.orphaned[0]?.body).toBe('return go();');
    });

    // A file somebody wrote by hand. Appending a region would put a second copy of every declaration
    // into it, so this is flagged and the caller decides.
    it('flags a hand-written file as adopted rather than silently appending to it', () => {
        expect(mergeArtifact('export function f() { return 1; }\n', artifact, COMMENT, 'src/a.ts.hint').adopted).toBe(true);
    });

    it('treats an empty file as free to take, not as somebody’s work', () => {
        expect(mergeArtifact('   \n\n', artifact, COMMENT, 'src/a.ts.hint').adopted).toBe(false);
    });

    // Same inputs, same bytes — this is what makes `--check` an assertion rather than an opinion.
    it('is idempotent', () => {
        const first = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');

        expect(mergeArtifact(first.content, artifact, COMMENT, 'src/a.ts.hint').content).toBe(first.content);
    });

    it('refuses a file containing two generated regions', () => {
        expect(() => mergeArtifact(`${generated('one')}\n${generated('two')}`, artifact, COMMENT)).toThrow('multiple generated regions');
    });

    it('preserves CRLF when reconciling an existing artifact', () => {
        const first = mergeArtifact(null, artifact, COMMENT).content.replaceAll('\n', '\r\n');
        const second = mergeArtifact(first, artifact, COMMENT);
        expect(second.content).toContain('\r\n');
        expect(second.content.replaceAll('\r\n', '')).not.toContain('\n');
        expect(inspectHoles(second.content, artifact)[0]?.filled).toBe(false);
    });
});

describe('inspectHoles', () => {
    const artifact = 'export function f(): void {\n// hint:hole(#f:body) spec=beef0001\nthrow new Error("todo");\n// hint:end of hole.\n}';

    it('reports a hole still holding the stub the emitter wrote', () => {
        const merged = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');

        expect(inspectHoles(merged.content, artifact)).toEqual([{ label: '#f:body', filled: false, outdated: false }]);
    });

    it('says nothing about a hole once somebody has written into it', () => {
        const merged = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');
        const filled = merged.content.replace('throw new Error("todo");', 'return go();');

        expect(inspectHoles(filled, artifact)).toEqual([{ label: '#f:body', filled: true, outdated: false }]);
    });

    // Only a *filled* body can be outdated: an unfilled hole just receives the new spec on the next
    // emission, and reporting it would bury the ones that need a human to re-read their code.
    it('calls a filled body outdated only when the spec hash moved under it', () => {
        const merged = mergeArtifact(null, artifact, COMMENT, 'src/a.ts.hint');
        const filled = merged.content.replace('throw new Error("todo");', 'return go();');

        expect(inspectHoles(filled, artifact.replace('beef0001', 'beef0002'))).toEqual([{ label: '#f:body', filled: true, outdated: true }]);
        expect(inspectHoles(merged.content, artifact.replace('beef0001', 'beef0002'))).toEqual([
            { label: '#f:body', filled: false, outdated: false },
        ]);
    });
});
