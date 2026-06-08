import { templateKeyword } from './keyword';

export const test = templateKeyword({
    directive: 'test',
    name: 'optional',
    merge: 'by-name',
    order: 170,
    template: `## [VERIFICATION & UNIT TEST CRITERIA{{#name}}: {{name}}{{/name}}]

Generate tests that explicitly cover every scenario listed below. Each edge case, mock data structure, and assertion described here must appear in the test output. Do not omit any scenario:

{{body}}`,
});
