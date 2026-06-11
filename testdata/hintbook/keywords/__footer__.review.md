The specification ends here.

Report your review as a list of findings. For each finding include:

1. Severity — `violation` (contradicts a declaration or prohibition), `gap` (declared but missing or incomplete), or `risk` (conforms today but is fragile against a declared constraint).
2. The file and line range in the implementation.
3. The specification block it relates to, by name or id.
4. What diverges, in one or two sentences, and the minimal change that would restore conformance.

Order findings from most to least severe. After the list, give a verdict: either "conforms to the specification" or "does not conform", with the count of violations and gaps. If every block checks out, say so explicitly rather than inventing findings.
