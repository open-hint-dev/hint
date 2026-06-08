import { templateKeyword } from './keyword';

export const deps = templateKeyword({
    directive: 'deps',
    name: 'forbidden',
    merge: 'concat',
    order: 20,
    template: `### Approved Dependency Whitelist

You are strictly forbidden from installing or importing any package outside of this list:

{{body}}`,
});
