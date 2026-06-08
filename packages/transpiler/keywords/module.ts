import { templateKeyword } from './keyword';

export const moduleKeyword = templateKeyword({
    directive: 'module',
    name: 'optional',
    merge: 'append',
    order: 80,
    namePattern: /^[a-z][A-Za-z0-9]*$/,
    template: `<system_context type="MODULE"{{#name}} name="{{name}}"{{/name}}>

{{body}}

</system_context>`,
});
