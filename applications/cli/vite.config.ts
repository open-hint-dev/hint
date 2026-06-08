import { resolve } from 'node:path';

import { tscPlugin } from '@wroud/vite-plugin-tsc';
import { defineConfig } from 'vite';

import { packageReleaseDir } from '../../presets/typescript/package';

const releaseDir = packageReleaseDir();

export default defineConfig({
    build: {
        outDir: releaseDir,
        emptyOutDir: false,
        lib: {
            entry: resolve(process.cwd(), './index.ts'),
            formats: ['es'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            external: [/^node:/],
            output: {
                banner: '#!/usr/bin/env node',
            },
        },
    },
    esbuild: {
        target: 'ES2024',
    },
    plugins: [
        tscPlugin({
            tscArgs: [
                '--project',
                './tsconfig.json',
                '--declaration',
                '--declarationMap',
                '--emitDeclarationOnly',
                '--noEmit',
                'false',
                '--outDir',
                releaseDir,
            ],
            prebuild: true,
        }),
    ],
});
