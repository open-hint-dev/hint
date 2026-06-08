import { ErrorCode, fire } from '../error.js';
import { defineKeyword, interpolate } from './keyword.js';

const template = `<repository_file name="{{name}}" path="{{glob}}">

{{body}}

Before writing any code that touches this reference, open and read the file(s) at the path above and analyze them carefully. Mirror their existing formatting, export patterns, and error-handling architecture. Do not guess at their contents, and do not reimplement what they already provide.

</repository_file>`;

export const read = defineKeyword({
    directive: 'read',
    name: 'required',
    merge: 'replace',
    order: 0,
    render: ({ name, reads }) => {
        const reference = name === undefined ? undefined : reads.get(name);
        if (reference === undefined) {
            fire(ErrorCode.REFERENCE_ERROR, `Unresolved read reference: ${name ?? 'unknown'}.`);
        }
        return interpolate(template, {
            name: reference.name,
            glob: reference.glob,
            body: reference.description,
        });
    },
});
