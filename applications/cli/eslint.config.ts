import config from '@openhint/preset-eslint/node';

export default [
    ...config,
    {
        rules: {
            // The SDK exposes ESM subpaths through package exports; eslint-import-resolver-typescript
            // does not currently follow those conditional entries although Node and tsc do.
            'import-x/no-unresolved': 'off',
        },
    },
];
