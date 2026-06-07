import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';

export const RELEASE_DIR = './release';

export const rootDir = (dir?: string): string => {
    dir = dir ?? process.cwd();
    if (existsSync(resolve(dir, 'yarn.lock'))) {
        return dir;
    }

    const parent = dirname(dir);

    if (parent === dir) {
        throw new Error('Could not find root directory with yarn.lock.');
    }

    return rootDir(parent);
};

export function packageJson(): Record<string, any> {
    const packagePath = resolve(process.cwd(), 'package.json');
    const packageContent = readFileSync(packagePath, 'utf-8');
    return JSON.parse(packageContent);
}

export function packageName(): string {
    return packageJson().name;
}

export function packageReleaseDir(): string {
    return resolve(rootDir(), RELEASE_DIR, packageName());
}
