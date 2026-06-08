import { defineKeyword } from './keyword';

export const notes = defineKeyword({
    directive: 'notes',
    name: 'optional',
    merge: 'drop',
    order: Number.MAX_SAFE_INTEGER,
    render: () => '',
});
