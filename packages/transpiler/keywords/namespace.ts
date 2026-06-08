import { defineKeyword, interpolate } from './keyword.js';

const template = `<system_context type="NAMESPACE"{{#name}} name="{{name}}"{{/name}}>

{{#name}}All code in this scope belongs to the \`{{name}}\` namespace — emit it under the target language's namespacing construct (package, namespace, or module path) with this as the qualified name and import root.{{/name}}{{^name}}All code in this scope belongs to a dedicated namespace — emit it under the target language's namespacing construct with this as the import root.{{/name}} {{body}} Keep cross-namespace references explicit and do not leak symbols across this boundary.

</system_context>`;

export const namespace = defineKeyword({
    directive: 'namespace',
    name: 'optional',
    merge: 'append',
    order: 70,
    render: ({ name, body }) => {
        const processed = body
            .replace(/\b(under|in|within) this namespace\b/g, 'here')
            .replace(/(\w) but nothing\b/g, '$1; nothing');
        return interpolate(template, { name, body: processed });
    },
});
