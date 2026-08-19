import * as Path from 'node:path';

import * as Transpiler from '@openhint/transpiler';

// Contract commands address file specs. A folder argument therefore means its subtree uniformly,
// while a plain context read keeps its intentionally different "this folder's knowledge" meaning.
export async function expandFolderPaths(paths: string[]): Promise<string[]> {
    const expanded: string[] = [];

    for (const path of paths) {
        const absolute = Path.resolve(process.cwd(), path);
        const isFolder = (await Transpiler.isPathExists(absolute)) && (await Transpiler.isPathFolder(absolute));

        if (isFolder) {
            expanded.push(path, `${path.replace(/[\\/]+$/, '')}/**`);
        } else {
            expanded.push(path);
        }
    }

    return expanded;
}
