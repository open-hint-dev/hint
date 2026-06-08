import type { Directive, KeywordDefinition, KeywordInput, RawBlock, ReadRef } from './keyword.js';
import { action } from './action.js';
import { app } from './app.js';
import { bad } from './bad.js';
import { build } from './build.js';
import { deps } from './deps.js';
import { entity } from './entity.js';
import { example } from './example.js';
import { footer } from './footer.js';
import { functionKeyword } from './function.js';
import { good } from './good.js';
import { header } from './header.js';
import { validateKeyword } from './keyword.js';
import { lang } from './lang.js';
import { lib } from './lib.js';
import { moduleKeyword } from './module.js';
import { namespace } from './namespace.js';
import { notes } from './notes.js';
import { read } from './read.js';
import { res } from './res.js';
import { rule } from './rule.js';
import { test } from './test.js';
import { ui } from './ui.js';

const definitions = [
    read,
    lang,
    deps,
    build,
    rule,
    app,
    lib,
    namespace,
    moduleKeyword,
    res,
    entity,
    functionKeyword,
    ui,
    action,
    good,
    bad,
    example,
    test,
    notes,
] satisfies KeywordDefinition[];

export const keywordRegistry = new Map<Directive, KeywordDefinition>(
    definitions.map((definition) => [
        definition.directive,
        definition,
    ]),
);

export const keywordOrder = definitions
    .filter((definition) => definition.directive !== 'read' && definition.merge !== 'drop')
    .sort((left, right) => left.order - right.order)
    .map((definition) => definition.directive);

export function getKeyword(directive: Directive): KeywordDefinition {
    const definition = keywordRegistry.get(directive);
    if (definition === undefined) {
        throw new Error(`Missing keyword definition: ${directive}.`);
    }
    return definition;
}

export function renderKeyword(block: RawBlock, body: string, reads: Map<string, ReadRef>): string {
    const definition = getKeyword(block.directive);
    validateKeyword(definition, block);
    const input: KeywordInput = {
        block,
        directive: block.directive,
        name: block.name,
        body,
        reads,
    };
    return definition.render(input);
}

export { footer, header };
export * from './keyword.js';
