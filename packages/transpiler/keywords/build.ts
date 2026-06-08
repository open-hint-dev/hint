import { templateKeyword } from './keyword';

export const build = templateKeyword({
    directive: 'build',
    name: 'forbidden',
    merge: 'concat',
    order: 30,
    template: `## [COMPILATION & TESTING PIPELINES]

The following commands validate this codebase. All generated code, configuration files, and project structure must remain compatible with these pipelines. Do not generate anything that breaks them.

{{body}}`,
});
