/// <reference types="node" />
/// <reference types="vitest/globals" />
import type { RawBlock } from '.';
import { directives, getKeyword, keywordOrder, keywordRegistry, normalizeDirective, renderKeyword } from '.';

import { ErrorCode, is } from '../error';

function block(directive: RawBlock['directive'], name: string | undefined, body: string): RawBlock {
    return {
        directive,
        name,
        body,
        sourcePath: '/repo/source.hint',
        sourceKind: 'file',
    };
}

describe('keywords', () => {
    it('registers every canonical directive exactly once', () => {
        expect(new Set(keywordRegistry.keys())).toEqual(new Set(directives));
        expect(keywordRegistry.size).toBe(directives.length);
        expect(new Set(keywordOrder).size).toBe(keywordOrder.length);
        expect(keywordOrder).not.toContain('read');
        expect(keywordOrder).not.toContain('notes');
    });

    it('normalizes canonical names and documented aliases', () => {
        expect(normalizeDirective('ENTITY')).toBe('entity');
        expect(normalizeDirective('model')).toBe('entity');
        expect(normalizeDirective('best-practices')).toBe('good');
        expect(normalizeDirective('component')).toBe('ui');
        expect(normalizeDirective('unknown')).toBeUndefined();
    });

    it('renders template keywords without runtime hint files', () => {
        const rendered = renderKeyword(block('app', 'CartService', 'Manages shopping carts.'), 'Manages shopping carts.', new Map());

        expect(rendered).toBe(`<system_context type="APP" name="CartService">

Manages shopping carts.

</system_context>`);
    });

    it('renders function sub-block aliases', () => {
        const rendered = renderKeyword(
            block(
                'function',
                'loadUser',
                '## argument userId: string\nThe user identifier.\n\n## returns User\nThe loaded user.\n\n## flow\n\n1. Load the user.',
            ),
            '## argument userId: string\nThe user identifier.\n\n## returns User\nThe loaded user.\n\n## flow\n\n1. Load the user.',
            new Map(),
        );

        expect(rendered).toContain('- **`userId: string`** — The user identifier.');
        expect(rendered).toContain('`User` — The loaded user.');
        expect(rendered).not.toContain('#### Errors');
    });

    it('enforces validation declared by each keyword', () => {
        expect(() => renderKeyword(block('entity', 'invalidName', '- id: string'), '- id: string', new Map())).toThrow(
            expect.objectContaining({ code: ErrorCode.PARSE_ERROR }),
        );

        try {
            renderKeyword(block('lang', 'named', 'TypeScript'), 'TypeScript', new Map());
        } catch (error) {
            expect(is(error, ErrorCode.PARSE_ERROR)).toBe(true);
        }
    });

    it('exposes merge and ordering metadata to the compiler', () => {
        expect(getKeyword('lang')).toMatchObject({ merge: 'replace', order: 10 });
        expect(getKeyword('rule')).toMatchObject({ merge: 'concat', order: 40 });
        expect(getKeyword('test')).toMatchObject({ merge: 'by-name', order: 170 });
        expect(getKeyword('notes')).toMatchObject({ merge: 'drop' });
    });
});
