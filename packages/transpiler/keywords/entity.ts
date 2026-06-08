import { templateKeyword } from './keyword.js';

export const entity = templateKeyword({
    directive: 'entity',
    name: 'required',
    merge: 'append',
    order: 100,
    namePattern: /^[A-Z][A-Za-z0-9]*$/,
    template: `### DATA STRUCT: {{name}}

Implement the {{name}} data model with this exact schema. Do not alter field names, change types, add undeclared fields, or omit any field listed here. This is the authoritative blueprint for this structure throughout the codebase.

{{body}}`,
});
