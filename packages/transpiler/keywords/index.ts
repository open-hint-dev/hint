import type { Directive, KeywordDefinition, KeywordInput, RawBlock, ReadRef } from './keyword';
import { action } from './action';
import { app } from './app';
import { bad } from './bad';
import { build } from './build';
import { deps } from './deps';
import { entity } from './entity';
import { example } from './example';
import { footer } from './footer';
import { functionKeyword } from './function';
import { good } from './good';
import { header } from './header';
import { validateKeyword } from './keyword';
import { lang } from './lang';
import { lib } from './lib';
import { moduleKeyword } from './module';
import { namespace } from './namespace';
import { notes } from './notes';
import { read } from './read';
import { res } from './res';
import { rule } from './rule';
import { test } from './test';
import { ui } from './ui';

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
export * from './keyword';
