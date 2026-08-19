import type { HintData } from './parser.js';
import { RUNNING_FILE, RUNNING_FOLDER } from './hintbook.js';

export function isScopeNode(hint: HintData): boolean {
    return hint.keyword === RUNNING_FILE || hint.keyword === RUNNING_FOLDER;
}
