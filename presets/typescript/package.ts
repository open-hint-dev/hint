import * as Fs from 'fs';
import * as Path from 'path';

export const RELEASE_DIR = './release';
export const RELEASE_TEMPLATE = './presets/typescript/package.release.json';

export const rootDir = (dir?: string): string => {
    dir = dir ?? process.cwd();
    if (Fs.existsSync(Path.resolve(dir, 'yarn.lock'))) {
        return dir;
    }

    const parent = Path.dirname(dir);

    if (parent === dir) {
        throw new Error('Could not find root directory with yarn.lock.');
    }

    return rootDir(parent);
};

export function packageJson(): Record<string, any> {
    const packagePath = Path.resolve(process.cwd(), 'package.json');
    const packageContent = Fs.readFileSync(packagePath, 'utf-8');
    return JSON.parse(packageContent);
}

export function packageName(): string {
    return packageJson().name;
}

export function packageReleaseDir(): string {
    return Path.resolve(rootDir(), RELEASE_DIR, packageName());
}

export function rootPackageJson(): Record<string, any> {
    const packagePath = Path.resolve(rootDir(), 'package.json');
    const packageContent = Fs.readFileSync(packagePath, 'utf-8');
    return JSON.parse(packageContent);
}

export function buildVersion(): string {
    const version = process.env.VERSION;

    if (!version) {
        throw new Error('VERSION environment variable must be set to build a publishable package.json.');
    }

    return version;
}

function packageExports(releaseDir: string): Record<string, any> {
    const exports: Record<string, any> = {
        './package.json': './package.json',
    };

    const directories = ['.'];

    while (directories.length > 0) {
        const directory = directories.shift()!;

        for (const entry of Fs.readdirSync(Path.resolve(releaseDir, directory), { withFileTypes: true })) {
            if (entry.isDirectory()) {
                directories.push(Path.join(directory, entry.name));
            }
        }

        if (!Fs.existsSync(Path.resolve(releaseDir, directory, 'index.js'))) {
            continue;
        }

        const target: Record<string, string> = {};

        if (Fs.existsSync(Path.resolve(releaseDir, directory, 'index.d.ts'))) {
            target.types = `./${Path.join(directory, 'index.d.ts')}`;
        }

        target.import = `./${Path.join(directory, 'index.js')}`;

        exports[directory === '.' ? '.' : `./${directory}`] = target;
    }

    return exports;
}

function packageDependencies(version: string): Record<string, string> {
    const resolutions: Record<string, string> = rootPackageJson().resolutions ?? {};
    const dependencies: Record<string, string> = {};

    for (const [
        name,
        range,
    ] of Object.entries<string>(packageJson().dependencies ?? {})) {
        if (range === 'workspace:*') {
            dependencies[name] = version;
        } else if (range === '*') {
            const resolution = resolutions[name];

            if (!resolution) {
                throw new Error(`No resolution found for dependency "${name}" in root package.json.`);
            }

            dependencies[name] = resolution;
        } else {
            dependencies[name] = range;
        }
    }

    return dependencies;
}

export function releasePackageJson(): any {
    const version = buildVersion();
    const source = packageJson();
    const releaseDir = packageReleaseDir();

    const templatePath = Path.resolve(rootDir(), RELEASE_TEMPLATE);
    const template = JSON.parse(Fs.readFileSync(templatePath, 'utf-8'));

    template.name = source.name;
    template.version = version;
    template.description = source.description ?? '';
    template.repository.directory = Path.relative(rootDir(), process.cwd());

    if (source.bin) {
        template.bin = source.bin;
    }

    if (!Fs.existsSync(Path.resolve(releaseDir, 'index.d.ts'))) {
        delete template.types;
    }

    template.exports = packageExports(releaseDir);
    template.dependencies = packageDependencies(version);

    return template;
}
