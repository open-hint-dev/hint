import Path from 'node:path';

import type { HintbookData } from './hintbook.js';
import type { HintData } from './parser.js';
import { collectReferenceEdges } from './closure.js';
import { listHintFiles, parseHintFile } from './parser.js';

// A ranked hit: the knowledge closest to the query, what it governs, and how close.
export type SearchResult = {
    hint: string; // hint file path, relative to the project root (e.g. `src/rpc/server.ts.hint`)
    target: string; // the path this knowledge governs (`src/rpc/server.ts`, or a folder, or `.`)
    score: number; // BM25F relevance score; higher is closer. Only positive scores are returned.
    weak: boolean; // matched under half the query's terms — probably not what you meant
    line?: number; // heading line of the first declaration in the matched spec
    via?: string; // top lexical hit through which this one-hop graph result was reached
};

export type SearchOptions = {
    limit?: number;
    hintbooks?: HintbookData[];
    expand?: boolean;
};

// Scores are corpus-relative, so a high one says nothing about whether a hit is on topic — the reason a
// confident-looking top result can be pure noise. Term coverage is the honest signal: a document that
// matched under half the query's terms is flagged. It is advisory only, and never filters a result out;
// a false `weak` costs a glance, a hidden result costs the knowledge.
function isWeakMatch(matchedTerms: number, totalTerms: number): boolean {
    return matchedTerms * 2 < totalTerms;
}

// Zones a hint document is split into. The same term is worth more in a target path or a declared
// name than deep in prose, so each zone carries a boost when scoring (BM25F field weights).
type Zone = 'path' | 'name' | 'body';

const ZONE_WEIGHT: Record<Zone, number> = { path: 5, name: 3, body: 1 };
const ZONES: Zone[] = [
    'path',
    'name',
    'body',
];

// BM25 tuning. k1 controls term-frequency saturation; b controls length normalization.
const BM25_K1 = 1.2;
const BM25_B = 0.75;

// Fuzzy fallback only kicks in for query terms that match nothing exactly, and only for terms long
// enough that an edit-distance-1 neighbour is unlikely to be coincidental. Matches score at a discount.
const FUZZY_MIN_LENGTH = 4;
const FUZZY_WEIGHT = 0.5;

const STOPWORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'but',
    'by',
    'for',
    'from',
    'has',
    'in',
    'into',
    'is',
    'it',
    'its',
    'of',
    'on',
    'or',
    'the',
    'their',
    'this',
    'to',
    'was',
    'were',
    'will',
    'with',
]);

// Symmetric synonym/acronym groups. Every token is expanded to the union of the groups it belongs
// to, so a query for `grpc server` reaches a hint that only ever says `rpc service`. Kept small and
// software-flavoured on purpose — it is meant to bridge the common gaps, not to be a thesaurus.
const SYNONYM_GROUPS: string[][] = [
    [
        'grpc',
        'rpc',
        'protobuf',
        'proto',
    ],
    [
        'auth',
        'authentication',
        'authn',
        'login',
        'signin',
        'signup',
    ],
    [
        'authz',
        'authorization',
        'permission',
        'permissions',
        'rbac',
        'acl',
    ],
    [
        'db',
        'database',
        'sql',
        'postgres',
        'postgresql',
        'mysql',
        'sqlite',
    ],
    [
        'server',
        'service',
        'backend',
        'daemon',
    ],
    [
        'client',
        'frontend',
        'ui',
        'browser',
    ],
    [
        'api',
        'rest',
        'http',
        'endpoint',
        'route',
        'handler',
    ],
    [
        'ws',
        'websocket',
        'socket',
        'streaming',
        'stream',
    ],
    [
        'queue',
        'mq',
        'kafka',
        'rabbitmq',
        'pubsub',
        'messaging',
        'broker',
    ],
    [
        'cache',
        'caching',
        'redis',
        'memcached',
    ],
    [
        'k8s',
        'kubernetes',
        'container',
        'docker',
    ],
    [
        'config',
        'configuration',
        'settings',
        'options',
    ],
    [
        'env',
        'environment',
    ],
    [
        'repo',
        'repository',
        'store',
        'storage',
        'persistence',
        'dao',
    ],
    [
        'fn',
        'func',
        'function',
        'method',
    ],
    [
        'err',
        'error',
        'exception',
        'fault',
        'failure',
    ],
    [
        'test',
        'spec',
        'testing',
        'fixture',
    ],
    [
        'crypto',
        'encryption',
        'encrypt',
        'cipher',
    ],
    [
        'jwt',
        'token',
        'bearer',
        'session',
    ],
    [
        'payment',
        'billing',
        'invoice',
        'charge',
        'checkout',
    ],
    [
        'user',
        'account',
        'profile',
        'identity',
    ],
    [
        'log',
        'logging',
        'logger',
        'telemetry',
        'tracing',
        'metrics',
        'observability',
    ],
];

function buildSynonymIndex(groups: string[][]): Map<string, string[]> {
    const index = new Map<string, Set<string>>();

    for (const group of groups) {
        for (const term of group) {
            const bucket = index.get(term) ?? new Set<string>();

            for (const other of group) {
                bucket.add(other);
            }

            index.set(term, bucket);
        }
    }

    return new Map(
        [...index].map(
            ([
                term,
                bucket,
            ]) => [
                term,
                [...bucket],
            ],
        ),
    );
}

// Splits raw text into base tokens: lowercased, broken on non-alphanumerics and on the boundaries
// inside identifiers (`grpcServer`, `grpc_server`, `grpc-server`, `rpc/server` all yield grpc, server).
// Digits are kept attached to letters so `k8s` and `oauth2` survive. Stopwords are dropped.
function baseTokens(text: string): string[] {
    if (!text) {
        return [];
    }

    const withBoundaries = text.normalize('NFC').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    const runs = withBoundaries.toLowerCase().match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu) ?? [];
    const cjk = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;
    const tokens: string[] = [];

    for (const run of runs) {
        const codepoints = [...run];

        if (cjk.test(run)) {
            if (codepoints.length === 1) tokens.push(run);
            else for (let index = 0; index < codepoints.length - 1; index++) tokens.push(`${codepoints[index]}${codepoints[index + 1]}`);
        } else if (codepoints.length > 1 && !STOPWORDS.has(run)) {
            tokens.push(run);
        }
    }

    return tokens;
}

// Tokenizes and expands each token through the synonym index. Used for the document side only — the
// query stays on its base tokens, and since synonym groups are symmetric, an expanded document is
// guaranteed to contain the query's own term whenever they share a group.
function expandedTokens(text: string, synonyms: Map<string, string[]>): string[] {
    const tokens: string[] = [];

    for (const token of baseTokens(text)) {
        tokens.push(token);

        const related = synonyms.get(token);

        if (related) {
            for (const synonym of related) {
                if (synonym !== token) {
                    tokens.push(synonym);
                }
            }
        }
    }

    return tokens;
}

// A hint file reduced to what scoring needs: per-zone token bags and their lengths.
type Document = {
    hint: string;
    target: string;
    zones: Record<Zone, string[]>;
    length: Record<Zone, number>;
    line?: number;
    root: HintData;
};

function firstDeclarationLine(hint: HintData): number | undefined {
    for (const child of hint.children) {
        if (child.line) return child.line;
        const nested = firstDeclarationLine(child);
        if (nested) return nested;
    }
    return undefined;
}

function flattenDeclarations(hint: HintData): { names: string; bodies: string } {
    const names: string[] = [];
    const bodies: string[] = [];

    const walk = (node: HintData): void => {
        for (const child of node.children) {
            names.push(child.keyword, child.name);
            bodies.push(child.body);

            walk(child);
        }
    };

    walk(hint);

    return { names: names.join(' '), bodies: bodies.join(' ') };
}

function buildDocument(hintPath: string, hint: HintData, synonyms: Map<string, string[]>): Document {
    const { names, bodies } = flattenDeclarations(hint);

    // `hint.name` is the path the spec describes — the strongest signal — so it anchors the path zone.
    const zones: Record<Zone, string[]> = {
        path: expandedTokens(hint.name, synonyms),
        name: expandedTokens(names, synonyms),
        body: expandedTokens(`${hint.name} ${hint.body} ${bodies}`, synonyms),
    };

    return {
        hint: hintPath,
        // `hint.name` is the repo-relative path this knowledge governs — the thing a caller passes to
        // `hint <path>` next, so a hit is directly actionable without deriving it from the file name.
        target: hint.name,
        zones,
        length: { path: zones.path.length, name: zones.name.length, body: zones.body.length },
        line: firstDeclarationLine(hint),
        root: hint,
    };
}

function countTerm(tokens: string[], term: string): number {
    let count = 0;

    for (const token of tokens) {
        if (token === term) {
            count++;
        }
    }

    return count;
}

// Bounded edit distance: returns a value > 1 as soon as it is certain the true distance exceeds 1,
// which is all the fuzzy fallback needs.
function withinOneEdit(a: string, b: string): boolean {
    if (a === b) {
        return true;
    }

    const lengthDelta = Math.abs(a.length - b.length);

    if (lengthDelta > 1) {
        return false;
    }

    let i = 0;
    let j = 0;
    let edits = 0;

    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i++;
            j++;
            continue;
        }

        if (++edits > 1) {
            return false;
        }

        if (a.length > b.length) {
            i++;
        } else if (a.length < b.length) {
            j++;
        } else {
            i++;
            j++;
        }
    }

    return edits + (a.length - i) + (b.length - j) <= 1;
}

export async function searchHints(projectRootPath: string, query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const queryTerms = [...new Set(baseTokens(query))];

    if (queryTerms.length === 0) {
        return [];
    }

    const hintPaths = await listHintFiles(projectRootPath);
    const documents: Document[] = [];
    const groups: string[][] = [];
    const seenGroups = new Set<string>();

    for (const group of [...(options.hintbooks ?? []).flatMap((book) => book.synonyms ?? []), ...SYNONYM_GROUPS]) {
        const normalized = [...new Set(group.map((term) => term.toLowerCase()))].sort();
        const identity = normalized.join('\0');
        if (normalized.length > 1 && !seenGroups.has(identity)) {
            seenGroups.add(identity);
            groups.push(normalized);
        }
    }
    const synonyms = buildSynonymIndex(groups);

    // Bound read concurrency so a large repository does not serialize thousands of small file reads,
    // while avoiding an unbounded Promise.all that can exhaust descriptors on hosted runners.
    for (let start = 0; start < hintPaths.length; start += 128) {
        const batch = hintPaths.slice(start, start + 128);
        const parsed = await Promise.all(batch.map(async (hintPath) => {
            // A single malformed spec (bad include, cycle) must not sink the whole search — it is simply
            // left out of the index. Compile/verify remain the place where such errors are surfaced.
            try {
                const hint = await parseHintFile(projectRootPath, Path.resolve(projectRootPath, hintPath));
                return hint ? buildDocument(hintPath, hint, synonyms) : null;
            } catch {
                return null;
            }
        }));
        documents.push(...parsed.filter((document): document is Document => document !== null));
    }

    if (documents.length === 0) {
        return [];
    }

    // Corpus statistics: document frequency per term and average length per zone, for idf and BM25F.
    const documentFrequency = new Map<string, number>();
    const vocabulary = new Set<string>();
    const totalLength: Record<Zone, number> = { path: 0, name: 0, body: 0 };

    for (const document of documents) {
        const seen = new Set<string>();

        for (const zone of ZONES) {
            totalLength[zone] += document.length[zone];

            for (const token of document.zones[zone]) {
                vocabulary.add(token);

                if (!seen.has(token)) {
                    seen.add(token);
                    documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
                }
            }
        }
    }

    const averageLength: Record<Zone, number> = {
        path: totalLength.path / documents.length || 1,
        name: totalLength.name / documents.length || 1,
        body: totalLength.body / documents.length || 1,
    };

    // Resolve each query term to the term actually present in the corpus, applying the fuzzy fallback
    // for terms that match nothing exactly. Each resolved term carries a weight (1, or discounted).
    const resolvedTerms: { term: string; weight: number }[] = [];

    for (const queryTerm of queryTerms) {
        if (documentFrequency.has(queryTerm)) {
            resolvedTerms.push({ term: queryTerm, weight: 1 });
            continue;
        }

        if (queryTerm.length >= FUZZY_MIN_LENGTH) {
            const neighbour = [...vocabulary].find((candidate) => candidate.length >= FUZZY_MIN_LENGTH && withinOneEdit(queryTerm, candidate));

            if (neighbour) {
                resolvedTerms.push({ term: neighbour, weight: FUZZY_WEIGHT });
            }
        }
    }

    if (resolvedTerms.length === 0) {
        return [];
    }

    const N = documents.length;
    const results: SearchResult[] = [];

    for (const document of documents) {
        let score = 0;
        let matchedTerms = 0;

        for (const { term, weight } of resolvedTerms) {
            let boostedTf = 0;

            for (const zone of ZONES) {
                const tf = countTerm(document.zones[zone], term);

                if (tf === 0) {
                    continue;
                }

                const normalization = 1 - BM25_B + BM25_B * (document.length[zone] / averageLength[zone]);
                boostedTf += (ZONE_WEIGHT[zone] * tf) / normalization;
            }

            if (boostedTf === 0) {
                continue;
            }

            matchedTerms += 1;

            const df = documentFrequency.get(term) ?? 0;
            const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

            score += weight * idf * (boostedTf / (BM25_K1 + boostedTf));
        }

        if (score > 0) {
            results.push({
                hint: document.hint,
                target: document.target,
                score: Math.round(score * 1000) / 1000,
                // Coverage is measured against every term the caller typed, not just the ones the corpus
                // happens to contain. A query whose terms mostly match nothing here is the clearest
                // evidence that this repository does not cover the intent — which is exactly the case a
                // corpus-relative score cannot express.
                weak: isWeakMatch(matchedTerms, queryTerms.length),
                line: document.line,
            });
        }
    }

    results.sort((a, b) => b.score - a.score || (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0));

    const limit = options.limit ?? 20;
    const lexical = limit >= 0 ? results.slice(0, limit) : results;

    if (!options.expand || lexical.length === 0) return lexical;

    const documentsByHint = new Map(documents.map((document) => [document.hint, document]));
    const idOwners = new Map<string, string>();
    const relationEdges: { from: string; to: string }[] = [];
    const walkRelations = (node: HintData, hint: string): void => {
        if (node.id) idOwners.set(node.id, hint);
        for (const target of [node.attrs?.overrides, node.attrs?.supersedes]) if (target) relationEdges.push({ from: hint, to: target });
        for (const child of node.children) walkRelations(child, hint);
    };
    for (const document of documents) walkRelations(document.root, document.hint);

    const expanded = [...lexical];
    const present = new Set(lexical.map((result) => result.hint));
    for (const hit of lexical) {
        const document = documentsByHint.get(hit.hint);
        if (!document) continue;
        const refs = await collectReferenceEdges(projectRootPath, [document.root]);
        const reached = new Set<string>();
        for (const edge of refs) if (edge.to) reached.add(Path.relative(projectRootPath, edge.to).replaceAll('\\', '/'));
        for (const relation of relationEdges) {
            if (relation.from === hit.hint) {
                const owner = idOwners.get(relation.to);
                if (owner) reached.add(owner);
            }
            const owner = idOwners.get(relation.to);
            if (owner === hit.hint) reached.add(relation.from);
        }
        for (const hint of [...reached].sort()) {
            if (present.has(hint)) continue;
            const reachedDocument = documentsByHint.get(hint);
            if (!reachedDocument) continue;
            present.add(hint);
            expanded.push({ hint, target: reachedDocument.target, score: Math.round(hit.score * 0.7 * 1000) / 1000, weak: hit.weak, line: reachedDocument.line, via: hit.target });
        }
    }
    expanded.sort((a, b) => b.score - a.score || (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0));
    return limit >= 0 ? expanded.slice(0, limit) : expanded;
}
