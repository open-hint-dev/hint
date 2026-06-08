import { templateKeyword } from './keyword.js';

export const lang = templateKeyword({
    directive: 'lang',
    name: 'forbidden',
    merge: 'replace',
    order: 10,
    bodyRequired: true,
    template: `## [ENVIRONMENT RUNTIME & LANGUAGE]

Write all code strictly targeting the following language specification. Apply the correct module syntax, standard library APIs, and runtime-specific idioms throughout. Do not use syntax, features, or tools that do not belong to this target.

{{body}}`,
});
