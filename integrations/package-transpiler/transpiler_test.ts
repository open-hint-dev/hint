/// <reference types="node" />
/// <reference types="vitest/globals" />

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    createIgnoreMatcher,
    extractReads,
    footer,
    header,
    renderKeyword,
    tokenize,
} from '@openhint/transpiler';
import type { RawBlock, ReadRef } from '@openhint/transpiler';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)));
const testdataDir = resolve(packageDir, '..', 'testdata');
const matcher = createIgnoreMatcher(testdataDir, []);

function parseHint(
    content: string,
    sourcePath: string,
): { blocks: RawBlock[]; reads: Map<string, ReadRef> } {
    const extraction = extractReads(content, testdataDir, matcher);
    const blocks = tokenize(extraction.content, sourcePath, 'file');
    const reads = new Map<string, ReadRef>(extraction.reads.map((r) => [r.name, r]));
    return { blocks, reads };
}

function buildNames(blocks: RawBlock[], reads: Map<string, ReadRef>): Set<string> {
    const names = new Set<string>(reads.keys());
    for (const block of blocks) {
        if (block.name !== undefined) {
            names.add(block.name);
        }
        for (const match of block.body.matchAll(/(?<!\{)\{([A-Za-z][A-Za-z0-9_.-]*)}/g)) {
            if (match[1] !== undefined) {
                names.add(match[1]);
            }
        }
    }
    return names;
}

function resolveBody(body: string, names: Set<string>): string {
    return body.replace(/(?<!\{)\{([A-Za-z][A-Za-z0-9_.-]*)}/g, (_, name: string) =>
        names.has(name) ? name : `{${name}}`,
    );
}

function renderFixture(blocks: RawBlock[], reads: Map<string, ReadRef>): string {
    const names = buildNames(blocks, reads);
    const sections: string[] = [];
    for (const block of blocks) {
        if (block.directive === 'notes') {
            continue;
        }
        const section = renderKeyword(block, resolveBody(block.body, names), reads);
        if (section !== '') {
            sections.push(section);
        }
    }
    return sections.join('\n\n');
}

function loadFixture(group: string, name: string): { hint: string; expected: string } {
    return {
        hint: readFileSync(join(testdataDir, group, `${name}.hint`), 'utf8'),
        expected: readFileSync(join(testdataDir, group, `${name}.output.md`), 'utf8').trimEnd(),
    };
}

function fixtureNames(group: string): string[] {
    return readdirSync(join(testdataDir, group))
        .filter((f) => f.endsWith('.hint'))
        .map((f) => f.slice(0, -'.hint'.length))
        .sort();
}

const groups = readdirSync(testdataDir).filter((entry) => {
    try {
        readdirSync(join(testdataDir, entry));
        return true;
    } catch {
        return false;
    }
});

for (const group of groups) {
    describe(group, () => {
        for (const name of fixtureNames(group)) {
            it(name, () => {
                const { hint, expected } = loadFixture(group, name);
                const { blocks, reads } = parseHint(hint, `${group}/${name}.hint`);

                const needsWrapper = expected.startsWith(header.slice(0, 40));
                const body = renderFixture(blocks, reads);
                const actual = needsWrapper ? [header, body, footer].join('\n\n') : body;

                expect(actual).toBe(expected);
            });
        }
    });
}
