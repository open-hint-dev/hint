import { templateKeyword } from './keyword';

export const good = templateKeyword({
    directive: 'good',
    name: 'forbidden',
    merge: 'concat',
    order: 140,
    template: `## [ENFORCED CODING DESIGN PATTERNS]

Apply every pattern and practice listed below in all generated code without exception. These are validated, required standards for this codebase — do not substitute alternatives, even equivalent-seeming ones:

{{body}}`,
});
