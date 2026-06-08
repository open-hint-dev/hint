import { ErrorCode, fire } from '../error';
import type { SubBlock } from './keyword';
import { defineKeyword, interpolate, splitSubBlocks } from './keyword';

const template = `### FUNCTION CONTRACT: {{name}}

Implement the {{name}} function according to the binding contract below. Every parameter, the return type, each error condition, and every step of the logic flow are mandatory — do not skip, reorder, rename, or approximate any of them.

#### Parameters

{{args}}

#### Returns

{{return}}

#### Errors

Throw these exact error types under the described conditions only. Do not substitute, wrap, or rename them. For every error listed here, emit at least one regression test that fails without the guard and passes with it — a declared error with no corresponding test is an incomplete implementation:

{{errors}}

#### Logic Flow

Implement the following logical sequence step-by-step without skipping any code validations:

{{flow}}`;

function listItems(items: SubBlock[]): string {
    return items.map((item) => `- **\`${item.label ?? ''}\`** — ${item.content}`).join('\n');
}

export const functionKeyword = defineKeyword({
    directive: 'function',
    name: 'required',
    merge: 'append',
    order: 110,
    namePattern: /^[a-z][A-Za-z0-9]*$/,
    render: ({ name, body }) => {
        const { subBlocks } = splitSubBlocks(body);
        const flow = subBlocks.find((item) => item.kind === 'flow');
        if (flow === undefined) {
            fire(ErrorCode.PARSE_ERROR, `Function ${name ?? ''} requires a flow block.`);
        }
        const returned = subBlocks.find((item) => item.kind === 'return');
        const errors = subBlocks.filter((item) => item.kind === 'error');
        const renderedTemplate = errors.length === 0 ? template.replace(/\n#### Errors\n[\s\S]*?\n\{\{errors}}\n/, '\n') : template;

        return interpolate(renderedTemplate, {
            name,
            args: listItems(subBlocks.filter((item) => item.kind === 'arg')),
            return: returned === undefined ? '`void`' : `\`${returned.label ?? ''}\` — ${returned.content}`,
            errors: listItems(errors),
            flow: flow.content,
        });
    },
});
