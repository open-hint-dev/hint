import { templateKeyword } from './keyword.js';

export const example = templateKeyword({
    directive: 'example',
    name: 'optional',
    merge: 'append',
    order: 160,
    template: `## [FEW-SHOT SYNTAX EXAMPLES{{#name}}: {{name}}{{/name}}]

The following example demonstrates the required implementation pattern. Replicate this structure, naming conventions, and style exactly:

{{body}}`,
});
