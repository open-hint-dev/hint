import { compileFiles } from './command.js';

export const VALIDATION_HEADER = `You are a principal software engineer performing a pre-implementation specification review. The HINT specification below is a candidate implementation contract. Do not write any code.

Review the specification systematically and identify every issue that would prevent a clean, assumption-free implementation:

- **Underspecified clauses** — fields, types, defaults, or behaviors the implementer would have to guess.
- **Contradictions** — two clauses that cannot both be satisfied simultaneously.
- **Missing error conditions** — failure paths that are clearly possible but not declared in the spec.
- **Unclear cross-references** — names that appear in the spec but whose contracts are absent or incomplete.
- **Scope gaps** — behaviors the declared interface implies but the spec does not cover.

For each finding: cite the specific section and clause, state the concern precisely, and write a direct question to the spec author.

If the specification is complete and unambiguous, state that explicitly after your review.

Collect all open questions in a \`## OPEN QUESTIONS\` block at the end of your review.

Do not output an implementation. The specification follows.`;

export async function executeValidate(filePaths: string[]): Promise<string> {
    const compiled = await compileFiles(filePaths);
    if (compiled === '') {
        return '';
    }
    return `${VALIDATION_HEADER}\n\n---\n\n${compiled}`;
}
