import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as Transpiler from '@openhint/transpiler';
import { z } from 'zod';

async function project(): Promise<{ root: string; config: Transpiler.ConfigData; hintbooks: Transpiler.HintbookData[] }> {
    const root = await Transpiler.findProjectRoot(process.cwd());
    if (!root) throw new Error(`No ${Transpiler.CONFIG_FILE_YML} found from '${process.cwd()}'`);
    const config = await Transpiler.loadConfig(root);
    return { root, config: config ?? {}, hintbooks: await Transpiler.loadHintbooks(root, config?.books ?? []) };
}

function textResult(text: string, structuredContent: Record<string, unknown>) {
    return { content: [{ type: 'text' as const, text }], structuredContent };
}

export function createMcpServer(version = '0.0.0'): McpServer {
    const server = new McpServer(
        { name: 'openhint', version },
        {
            instructions:
                'Before modifying repository paths, call hint_context with the paths you will touch. Inherited is success and is the governing answer. When you know only the intent, call hint_search, then hint_context for useful targets. Call hint_author before writing or editing .hint files. Use hint_status to inspect repository-wide drift. These tools are read-only; edit files normally after loading the applicable knowledge.',
        },
    );

    server.registerTool(
        'hint_context',
        {
            description: 'Return the HINT knowledge governing repository paths. Inherited is success; missing paths remain explicit in verdicts.',
            inputSchema: { paths: z.array(z.string()).min(1) },
        },
        async ({ paths }) => {
            const { root, config, hintbooks } = await project();
            const resolution = await Transpiler.resolveRequests(root, paths, process.cwd());
            const closure = await Transpiler.resolveClosure(root, resolution.hintPaths, { depth: config.refs_depth });
            const hints = await Transpiler.parseHintFiles(root, closure.paths);
            const knowledge = Transpiler.renderContext(hints, hintbooks);
            const snapshot = await Transpiler.readGitSnapshot(root);
            const contracts = Transpiler.collectContractScopes(hints, hintbooks);
            const staleness: Transpiler.ScopeStaleness[] = [];

            if (snapshot && config.repo !== 'knowledge') {
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

            return textResult(knowledge, { knowledge, verdicts: resolution.requests, staleness, trimmedReferences: closure.trimmed });
        },
    );

    server.registerTool(
        'hint_search',
        {
            description: 'Rank the repository knowledge closest to an intent. Offline and deterministic; weak results are explicitly marked.',
            inputSchema: { query: z.string().min(1), limit: z.number().int().optional(), expand: z.boolean().optional() },
        },
        async ({ query, limit, expand }) => {
            const { root, hintbooks } = await project();
            const results = await Transpiler.searchHints(root, query, { limit, hintbooks, expand });
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
            const { root, config, hintbooks } = await project();
            const report = await Transpiler.inspectProject(root, hintbooks, { repositoryKind: config.repo, agentAuthors: config.curation?.agent_authors });
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
            const authoring = Transpiler.findInstruction(hintbooks, Transpiler.RUNNING_AUTHORING)?.content.trim();
            const keywords = Transpiler.vocabularyBooks(hintbooks)
                .flatMap((book) =>
                    book.instructions.map((instruction) => ({
                        keyword: instruction.name,
                        synonyms: instruction.metadata?.synonyms ?? [],
                        description: instruction.metadata?.description ?? '',
                    })),
                )
                .filter((entry) => !entry.keyword.startsWith('__'));
            const payload = { paths, keywords, syntax: '# keyword Name {#optional_id}', ...(authoring ? { guidance: authoring.replaceAll('{paths}', paths.join(', ')) } : {}) };
            return textResult(JSON.stringify(payload, null, 2), payload);
        },
    );

    return server;
}

export async function runMcpServer(version: string): Promise<void> {
    await createMcpServer(version).connect(new StdioServerTransport());
}
