import { templateKeyword } from './keyword.js';

export const bad = templateKeyword({
    directive: 'bad',
    name: 'forbidden',
    merge: 'concat',
    order: 150,
    template: `## [PROHIBITED ANTI-PATTERNS]

CRITICAL ASSURANCE: You are strictly prohibited from implementing the following behaviors under any circumstances. These prohibitions exist because of real vulnerabilities and failures in this codebase — do not reintroduce them:

{{body}}`,
});
