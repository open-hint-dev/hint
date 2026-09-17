import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import YAML from 'yaml';
import { validationError } from './errors.js';

export interface HintConfig {
  highQualityMode: boolean;
  warnings: string[];
}

async function readable(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export async function readConfig(root: string): Promise<HintConfig> {
  const warnings: string[] = [];
  for (const legacy of ['hint.yml', 'hint.yaml']) {
    if (await readable(Path.join(root, legacy))) warnings.push(`${legacy} is ignored; migrate to .hintrc`);
  }
  const path = Path.join(root, '.hintrc');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { highQualityMode: false, warnings };
    throw validationError(`cannot read ${path}: ${String(error)}`);
  }
  if (!raw.trim()) return { highQualityMode: false, warnings };
  let value: unknown;
  try {
    value = YAML.parse(raw);
  } catch (error) {
    throw validationError(`${path}: invalid YAML: ${String(error)}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${path}: configuration must be a YAML mapping`);
  }
  const mapping = value as Record<string, unknown>;
  const unknown = Object.keys(mapping).filter((key) => key !== 'high-quality-mode');
  if (unknown.length > 0) throw validationError(`${path}: unknown key ${unknown[0]}`);
  const mode = mapping['high-quality-mode'];
  if (mode !== undefined && typeof mode !== 'boolean') {
    throw validationError(`${path}: high-quality-mode must be true or false`);
  }
  return { highQualityMode: mode ?? false, warnings };
}
