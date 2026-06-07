import { resolve } from 'path';

import js from '@eslint/js';
import { importX } from 'eslint-plugin-import-x';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const project = resolve(process.cwd(), 'tsconfig.json');

export default defineConfig([
    {
        ignores: [
            '.*.js',
            'node_modules/',
            'dist/',
            'build/',
            'eslint.config.ts',
            'vite.config.ts',
            '**/*_test.*',
        ],
    },
    {
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
            importX.flatConfigs.recommended,
            importX.flatConfigs.typescript,
            prettierPlugin,
        ],
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: process.cwd(),
            },
        },
        settings: {
            'import-x/resolver': {
                typescript: {
                    project,
                },
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/consistent-type-imports': [
                'warn',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],
        },
    },
]);
