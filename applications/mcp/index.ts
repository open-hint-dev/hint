import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as Transpiler from '@openhint/transpiler';
import { z } from 'zod';

async function project(): Promise<{ root: string; hintbooks: Transpiler.HintbookData[] }> {
    const root = await Transpiler.findProjectRoot(process.cwd());
    if (!root) throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found from '${process.cwd()}'`);
    const config = await Transpiler.loadConfig(root);
    return { root, hintbooks: await Transpiler.loadHintbooks(root, config?.books ?? []) };
}

function textResult(text: string, structuredContent: Record<string, unknown>) {
    return { content: [{ type: 'text' as const, text }], structuredContent };
}

export const server = new McpServer({ name: 'openhint', version: '1.3.0' });

server.registerTool(
    'hint_context',
    {
        description: 'Return the HINT knowledge governing repository paths. Inherited is success; missing paths remain explicit in verdicts.',
        inputSchema: { paths: z.array(z.string()).min(1) },
    },
    async ({ paths }) => {
        const { root, hintbooks } = await project();
        const resolution = await Transpiler.resolveRequests(root, paths, process.cwd());
        const closure = await Transpiler.resolveClosurePaths(root, resolution.hintPaths);
        const hints = await Transpiler.parseHintFiles(root, closure);
        const knowledge = Transpiler.renderContext(hints, hintbooks);
        const snapshot = await Transpiler.readGitSnapshot(root);
        const contracts = Transpiler.collectContractScopes(hints, hintbooks);
        const staleness: Transpiler.ScopeStaleness[] = [];

        if (snapshot) {
            for (const verdict of resolution.requests) {
                const hintPath = verdict.hintPath
                    ? Transpiler.repositoryPath(root, verdict.hintPath)
                    : verdict.target
                      ? await Transpiler.findNearestFolderHint(root, verdict.target)
                      : null;
                if (!hintPath || !verdict.target) continue;
                const reading = await Transpiler.measureStaleness(root, snapshot, {
                    hintPath: Transpiler.toGitPath(hintPath),
                    target: verdict.target,
                    contract: contracts.get(verdict.target) ?? false,
                });
                if (reading?.stale) staleness.push(reading);
            }
        }

        return textResult(knowledge, { knowledge, verdicts: resolution.requests, staleness });
    },
);

server.registerTool(
    'hint_search',
    {
        description: 'Rank the repository knowledge closest to an intent. Offline and deterministic; weak results are explicitly marked.',
        inputSchema: { query: z.string().min(1), limit: z.number().int().optional() },
    },
    async ({ query, limit }) => {
        const { root } = await project();
        const results = await Transpiler.searchHints(root, query, { limit });
        return textResult(JSON.stringify({ query, count: results.length, results }, null, 2), { query, count: results.length, results });
    },
);

server.registerTool(
    'hint_status',
    {
        description:
            'Inventory every spec and return the same structured drift report as hint status --json. Read-only; findings never mutate the project.',
        inputSchema: {},
    },
    async () => {
        const { root, hintbooks } = await project();
        const report = await Transpiler.inspectProject(root, hintbooks);
        return textResult(JSON.stringify(report, null, 2), report as unknown as Record<string, unknown>);
    },
);

server.registerTool(
    'hint_author',
    {
        description:
            'Return the installed authoring vocabulary before an agent creates or edits a .hint file. The file edit itself remains the agent’s responsibility.',
        inputSchema: { paths: z.array(z.string()).optional() },
    },
    async ({ paths = [] }) => {
        const { hintbooks } = await project();
        const keywords = Transpiler.vocabularyBooks(hintbooks)
            .flatMap((book) =>
                book.instructions.map((instruction) => ({
                    keyword: instruction.name,
                    synonyms: instruction.metadata?.synonyms ?? [],
                    description: instruction.metadata?.description ?? '',
                })),
            )
            .filter((entry) => !entry.keyword.startsWith('__'));
        const payload = { paths, keywords, syntax: '# keyword Name {#optional_id}' };
        return textResult(JSON.stringify(payload, null, 2), payload);
    },
);

if (process.env.HINT_MCP_NO_START !== '1') {
    await server.connect(new StdioServerTransport());
}
