import type { HintData } from './parser.js';

// Lock keys stay human-readable; marker labels encode delimiter characters because they are parsed
// from `hint:hole(...)`. Both share the same canonical keyword/name segment before that transport step.
export function blockAddressSegment(hint: HintData, markerSafe = false): string {
    const segment = hint.name ? `${hint.keyword} ${hint.name}` : hint.keyword;
    return markerSafe ? segment.replaceAll('%', '%25').replaceAll('(', '%28').replaceAll(')', '%29') : segment;
}
