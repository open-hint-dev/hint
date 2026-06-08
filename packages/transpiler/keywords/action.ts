import { templateKeyword } from './keyword';

export const action = templateKeyword({
    directive: 'action',
    name: 'required',
    merge: 'append',
    order: 130,
    namePattern: /^[a-z][A-Za-z0-9]*$/,
    template: `## [REUSABLE AUTOMATION SCRIPTS: {{name}}]

The following action is registered as a macro behavior. Whenever the described condition is met or this action is referenced by name in other blocks, execute the following steps exactly:

{{body}}`,
});
