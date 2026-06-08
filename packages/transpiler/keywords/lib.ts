import { templateKeyword } from './keyword';

export const lib = templateKeyword({
    directive: 'lib',
    name: 'optional',
    merge: 'append',
    order: 60,
    template: `<system_context type="LIB"{{#name}} name="{{name}}"{{/name}}>

{{body}}

</system_context>`,
});
