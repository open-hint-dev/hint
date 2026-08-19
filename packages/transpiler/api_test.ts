import { describe, expect, test } from 'vitest';

import {
    collectExpectations,
    computeDrift,
    findHints,
    inspectProject,
    loadConfig,
    loadHintbooks,
    mergeArtifact,
    parseHintFiles,
    planEmit,
    renderContext,
    renderPrompt,
    resolveRequests,
    saveLock,
    searchHints,
    verifyTargets,
} from './index.js';

describe('public API', () => {
    test('exports the documented retrieval, contract, emit, status, and search entry points', () => {
        expect([
            resolveRequests,
            findHints,
            parseHintFiles,
            renderContext,
            renderPrompt,
            loadConfig,
            loadHintbooks,
            collectExpectations,
            verifyTargets,
            computeDrift,
            saveLock,
            planEmit,
            mergeArtifact,
            inspectProject,
            searchHints,
        ]).not.toContain(undefined);
    });
});
