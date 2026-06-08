import { templateKeyword } from './keyword';

export const rule = templateKeyword({
    directive: 'rule',
    name: 'forbidden',
    merge: 'concat',
    order: 40,
    template: `## [CRITICAL SYSTEM MANDATES]

The following mandates are non-negotiable system-level constraints. Every function, data access pattern, and error path must satisfy all mandates listed here without exception:

{{body}}`,
});
