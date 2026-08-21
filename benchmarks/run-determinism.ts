import * as Crypto from 'node:crypto';
import * as Fs from 'node:fs/promises';
import * as Path from 'node:path';

import { listHintFiles, parseHintFile, parseHintFiles, renderContext } from '../packages/transpiler/index.js';

const root = Path.resolve(import.meta.dirname, '..');
const valid: string[] = [];
for (const path of await listHintFiles(root)) {
    const absolute = Path.join(root, path);
    try { await parseHintFile(root, absolute); valid.push(absolute); } catch { /* broken parser fixtures are intentionally excluded */ }
}
const sha256 = Crypto.createHash('sha256').update(renderContext(await parseHintFiles(root, valid), [])).digest('hex');
const result = { sha256, files: valid.length, os: process.platform, node: process.version };
if (process.env.DETERMINISM_OUTPUT) await Fs.writeFile(process.env.DETERMINISM_OUTPUT, `${JSON.stringify(result)}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
