import { defineConfig } from 'eslint/config';
import globals from 'globals';

import baseConfig from './base.js';

export default defineConfig({
    extends: [...baseConfig],
    languageOptions: {
        globals: {
            ...globals.browser,
            React: true,
            JSX: true,
        },
    },
});
