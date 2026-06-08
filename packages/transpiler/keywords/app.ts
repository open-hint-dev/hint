import { templateKeyword } from './keyword';

export const app = templateKeyword({
    directive: 'app',
    name: 'optional',
    merge: 'append',
    order: 50,
    template: `<system_context type="APP"{{#name}} name="{{name}}"{{/name}}>

{{body}}

</system_context>`,
});
