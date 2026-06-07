import { resolve } from 'path';

import type { UserConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import { tscPlugin } from '@wroud/vite-plugin-tsc';
import { nodeExternals } from 'rollup-plugin-node-externals';
import { defineConfig } from 'vite';
import noBundlePlugin from 'vite-plugin-no-bundle';
import tsconfigPaths from 'vite-tsconfig-paths';

import { packageReleaseDir } from './package';

const pluginTsc = tscPlugin({
    tscArgs: [
        '--project',
        './tsconfig.json',
        '--declaration',
        '--declarationMap',
        '--emitDeclarationOnly',
        '--noEmit',
        'false',
        '--outDir',
        packageReleaseDir(),
    ],
    prebuild: true,
});

const pluginTsConfigPaths = tsconfigPaths();

const pluginReactRouter = reactRouter();

const NodeBuildBaseConfig = () =>
    ({
        build: {
            outDir: packageReleaseDir(),
            emptyOutDir: false,
            lib: {
                entry: ['./index.ts'].map((entryFile) => resolve(process.cwd(), entryFile)),
                formats: ['es'],
            },
        },
        esbuild: {
            target: 'ES2024',
        },
    }) satisfies UserConfig;

export const NodeBuildConfig = () =>
    defineConfig({
        ...NodeBuildBaseConfig(),
        plugins: [
            nodeExternals(),
            pluginTsc,
            noBundlePlugin() as any,
        ],
    });

export const IsomorphicBuildConfig = () =>
    defineConfig({
        ...NodeBuildBaseConfig(),
        plugins: [
            pluginTsc,
        ],
    });

export const ReactRouterBuildConfig = () =>
    defineConfig({
        optimizeDeps: {
            esbuildOptions: {
                define: {
                    'process.env': '{}',
                    'process.versions': '{}',
                    'process.platform': '"browser"',
                },
            },
        },
        plugins: [
            pluginReactRouter,
            pluginTsConfigPaths,
        ],
    });
