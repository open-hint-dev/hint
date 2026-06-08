import { templateKeyword } from './keyword.js';

export const res = templateKeyword({
    directive: 'res',
    name: 'required',
    merge: 'append',
    order: 90,
    template: `### [STATIC DATA ASSET: {{name}}]

Read this data asset definition to understand its structure and access patterns. Do not generate functions that attempt to modify or write to this asset — it is read-only configuration data.

{{body}}`,
});
