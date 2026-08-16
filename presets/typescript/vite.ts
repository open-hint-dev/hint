/// <reference types="vitest/config" />

import * as Fs from 'node:fs';
import * as Module from 'node:module';
import * as Path from 'path';

import { tscPlugin } from '@wroud/vite-plugin-tsc';
import { nodeExternals } from 'rollup-plugin-node-externals';
import * as Vite from 'vite';
import noBundlePlugin from 'vite-plugin-no-bundle';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { packageReleaseDir, rootDir } from './package';

const tscProject = Fs.existsSync(Path.resolve(process.cwd(), 'tsconfig.release.json')) ? './tsconfig.release.json' : './tsconfig.json';

const pluginTsc = tscPlugin({
    tscArgs: [
        '--project',
        tscProject,
        '--declaration',
        '--declarationMap',
        '--emitDeclarationOnly',
        '--noEmit',
        'false',
        '--outDir',
        packageReleaseDir(),
    ],
    packageManager: 'yarn',
    prebuild: true,
});

// environment defaults to 'client'; SSR builds (CliBuildConfig) run in the
// 'ssr' environment, where the plugin would otherwise skip copying
const pluginCopyReleaseFiles = (files: string[], environment = 'client') =>
    viteStaticCopy({
        targets: [
            {
                src: files,
                dest: './',
            },
        ],
        environment,
    });

// viteStaticCopy cannot flatten files matched above the package root (the
// ../.. structure leaks into the destination), so the root LICENSE is copied
// with a dedicated plugin
const pluginCopyRootLicense = (): Vite.PluginOption => ({
    name: 'copy-root-license',
    closeBundle() {
        Fs.copyFileSync(Path.join(rootDir(), 'LICENSE'), Path.join(packageReleaseDir(), 'LICENSE'));
    },
});

const TestBaseConfig = () =>
    ({
        globals: true,
        include: ['**/*_test.ts'],
        exclude: ['**/node_modules/**'],
        passWithNoTests: true,
    }) satisfies Vite.UserConfig['test'];

const NodeBuildBaseConfig = () =>
    ({
        build: {
            outDir: packageReleaseDir(),
            emptyOutDir: false,
            lib: {
                entry: ['./index.ts'].map((entryFile) => Path.resolve(process.cwd(), entryFile)),
                formats: ['es'],
            },
        },
        esbuild: {
            target: 'ES2024',
        },
        test: TestBaseConfig(),
    }) satisfies Vite.UserConfig;

export const NodeBuildConfig = () =>
    Vite.defineConfig({
        ...NodeBuildBaseConfig(),
        plugins: [
            nodeExternals(),
            pluginTsc,
            noBundlePlugin() as any,
            pluginCopyReleaseFiles(['README.md']),
            pluginCopyRootLicense(),
        ],
    });

export const IsomorphicBuildConfig = () =>
    Vite.defineConfig({
        ...NodeBuildBaseConfig(),
        plugins: [
            pluginTsc,
            pluginCopyReleaseFiles(['README.md']),
            pluginCopyRootLicense(),
        ],
    });

// A CLI is bundled self-contained so it can be installed and run with nothing else present. `external`
// is the escape hatch for a runtime dependency too heavy to inline — a package whose `npx` would
// otherwise download the whole of it on every cold run. Anything listed here must stay declared in the
// package's `dependencies`, since it is now resolved at install time rather than built in.
export const CliBuildConfig = (external: string[] = []) =>
    Vite.defineConfig({
        build: {
            outDir: packageReleaseDir(),
            emptyOutDir: false,
            ssr: Path.resolve(process.cwd(), './index.ts'),
            rollupOptions: {
                external: [
                    /^node:/,
                    ...Module.builtinModules,
                    ...external,
                ],
                output: {
                    banner: '#!/usr/bin/env node',
                    entryFileNames: 'index.js',
                },
            },
        },
        ssr: {
            noExternal: true,
            external,
        },
        esbuild: {
            target: 'ES2024',
        },
        test: TestBaseConfig(),
        plugins: [
            tscPlugin({
                tscArgs: [
                    '--project',
                    './tsconfig.json',
                    '--noEmit',
                ],
                packageManager: 'yarn',
                prebuild: true,
            }),
            pluginCopyReleaseFiles(['README.md'], 'ssr'),
            pluginCopyRootLicense(),
        ],
    });
