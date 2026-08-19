import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as Transpiler from '@openhint/transpiler';

import { createMcpServer } from './mcp.js';

const here = Path.dirname(fileURLToPath(import.meta.url));

it('serves CLI context, search, status, and authoring data over MCP', async () => {
    const previousCwd = process.cwd();
    process.chdir(Path.resolve(here, '../../testdata/project'));

    const server = createMcpServer('test');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });

    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        expect(client.getInstructions()).toContain('Before modifying repository paths, call hint_context');
        const context = await client.callTool({ name: 'hint_context', arguments: { paths: ['src/payment.ts'] } });
        const search = await client.callTool({ name: 'hint_search', arguments: { query: 'payment' } });
        const status = await client.callTool({ name: 'hint_status', arguments: {} });
        const author = await client.callTool({ name: 'hint_author', arguments: {} });

        const root = process.cwd();
        const config = await Transpiler.loadConfig(root);
        const books = await Transpiler.loadHintbooks(root, config?.books ?? []);
        const resolution = await Transpiler.resolveRequests(root, ['src/payment.ts'], root);
        const hints = await Transpiler.parseHintFiles(root, await Transpiler.resolveClosurePaths(root, resolution.hintPaths));
        const expectedKnowledge = Transpiler.renderContext(hints, books);
        const expectedSearch = await Transpiler.searchHints(root, 'payment');
        const expectedStatus = await Transpiler.inspectProject(root, books);

        expect(context.structuredContent).toMatchObject({
            knowledge: expectedKnowledge,
            verdicts: resolution.requests,
            staleness: expect.any(Array),
        });
        expect(search.structuredContent).toMatchObject({ query: 'payment', count: expectedSearch.length, results: expectedSearch });
        expect(status.structuredContent).toEqual(expectedStatus);
        expect(JSON.stringify(author.structuredContent)).toContain('entity');
    } finally {
        await client.close();
        await server.close();
        process.chdir(previousCwd);
    }
});
