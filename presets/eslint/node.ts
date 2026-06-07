import { defineConfig } from 'eslint/config';
import globals from 'globals';

import baseConfig from './base';

export default defineConfig({
    extends: [...baseConfig],
    languageOptions: {
        globals: {
            ...globals.node,
        },
    },
});
