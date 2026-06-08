import type { SubBlock } from './keyword';
import { defineKeyword, interpolate, splitSubBlocks } from './keyword';

const template = `### UI SURFACE{{#name}}: {{name}}{{/name}}

Build this user interface surface exactly as specified. Implement only the elements declared below — do not add components, fields, columns, controls, or decorative elements that are not listed, and do not omit any that are. Match the structure, labels, validation, and behavior described for each element.

{{body}}

{{forms}}

{{blocks}}

{{images}}

{{tables}}`;

const definitions: Record<string, { label: string; instruction: string }> = {
    form: {
        label: 'FORM',
        instruction:
            'Render this form with exactly the fields and actions listed — no extra inputs, no omitted ones. Apply the stated validation rules and wire each action to its described behavior:',
    },
    block: {
        label: 'BLOCK',
        instruction: 'Compose this visual region exactly as described. Do not introduce additional sections or rearrange the declared structure:',
    },
    image: {
        label: 'IMAGE',
        instruction:
            'Place this image as specified, honoring its source, alt text, and role in the layout. Do not substitute it or add imagery beyond what is declared:',
    },
    table: {
        label: 'TABLE',
        instruction:
            'Render this table with exactly the columns and data binding described. Implement the stated sorting, pagination, and empty-state behavior; do not add columns that are not listed:',
    },
};

function renderItems(kind: string, items: SubBlock[]): string {
    const definition = definitions[kind];
    if (definition === undefined) {
        return '';
    }
    return items
        .filter((item) => item.kind === kind)
        .map((item) => `#### ${definition.label}${item.label === undefined ? '' : `: ${item.label}`}\n\n${definition.instruction}\n\n${item.content}`)
        .join('\n\n');
}

export const ui = defineKeyword({
    directive: 'ui',
    name: 'optional',
    merge: 'append',
    order: 120,
    render: ({ name, body }) => {
        const { intro, subBlocks } = splitSubBlocks(body);
        return interpolate(template, {
            name,
            body: intro,
            forms: renderItems('form', subBlocks),
            blocks: renderItems('block', subBlocks),
            images: renderItems('image', subBlocks),
            tables: renderItems('table', subBlocks),
        }).replace(/\n{3,}/g, '\n\n');
    },
});
