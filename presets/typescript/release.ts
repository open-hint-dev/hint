import * as Fs from 'fs';
import * as Path from 'path';

import { packageReleaseDir, releasePackageJson } from './package.ts';

function main(): void {
    Fs.writeFileSync(Path.resolve(packageReleaseDir(), 'package.json'), JSON.stringify(releasePackageJson(), null, 4) + '\n');
}

main();
