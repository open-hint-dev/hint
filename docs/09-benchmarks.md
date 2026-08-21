# Benchmarks and evaluation

Every figure on the README, package pages, and site comes from the committed HINT 1.5.0 results in [`benchmarks/results/1.5.0`](../benchmarks/results/1.5.0). Reproduce them with `make bench` and `make eval`. The measured runner was Apple M2, macOS 24.6.0, arm64, Node 26.6.0, on 2026-08-21. Numbers from unlike runners must not be compared.

## Results

| Metric | Fixture | Result | Source |
| --- | --- | ---: | --- |
| cold `hint <path>` p50 / p95 | 1,000 synthetic hints, 20 processes | 184.00 / 217.66 ms | [`perf.json`](../benchmarks/results/1.5.0/perf.json) |
| cold `hint <path>` p50 / p95 | 10,000 synthetic hints, 20 processes | 185.04 / 207.13 ms | [`perf.json`](../benchmarks/results/1.5.0/perf.json) |
| `hint search` p50 / p95 | 10,000 hints, 5 corpus rebuilds | 1,177.67 / 1,262.59 ms | [`perf.json`](../benchmarks/results/1.5.0/perf.json) |
| `hint status` | 10,000 hints, 3 git commits | 8,348.56 ms; 4 git processes | [`perf.json`](../benchmarks/results/1.5.0/perf.json) |
| context median / monolith | demo-pied-piper, all 14 hint paths | 1,213 / 3,940 tokens; 3.25× smaller | [`context.json`](../benchmarks/results/1.5.0/context.json) |
| P@1 / P@3 / R@5 / MRR | 65 queries, 26 non-Latin | 1.000 / 1.000 / 1.000 / 1.000 | [`retrieval.json`](../benchmarks/results/1.5.0/retrieval.json) |
| weak-flag precision | 5 empty-intent queries | 1.000 | [`retrieval.json`](../benchmarks/results/1.5.0/retrieval.json) |
| determinism snapshot | 25 valid fixture and dogfood hints | SHA-256 `51f0121c3f2453ff88d6e29347a83a90fad368ba00bc6068a34b327bdca36cc2` | [`determinism.json`](../benchmarks/results/1.5.0/determinism.json) |
| packed CLI | `npm pack --dry-run --json` release artifact | 333,144 bytes; 1,590,617 unpacked; 4 runtime dependencies; 0 native modules | [`perf.json`](../benchmarks/results/1.5.0/perf.json) |

## Definitions and fixtures

Latency is wall-clock p50/p95. Each cold read starts the bundled CLI in a fresh Node process. Search rebuilds the complete in-memory BM25F corpus on every process. Status inventories target-bearing hints over a generated repository with three commits; Git Trace2 supplies the subprocess count. `/usr/bin/time` supplies peak RSS where available. Synthetic fixtures use a committed algorithm and sizes 100, 1,000, and 10,000, with nested folders and matching targets.

Context cost compiles the snapshot in [`benchmarks/context/fixtures/demo-pied-piper`](../benchmarks/context/fixtures/demo-pied-piper) once as a monolith and once for every hint path with normal inheritance. Tokens use the fixed dependency-free `openhint-unicode-v1` tokenizer: NFC-normalized Unicode word runs and individual punctuation. Values are comparable only under that tokenizer.

Retrieval uses [`core.jsonl`](../benchmarks/retrieval/cases/core.jsonl). P@1/P@3 ask whether an expected target appears by that rank; R@5 is expected targets recovered in the first five; MRR is mean reciprocal rank of the first expected target. An expected-empty query is correct when search returns no result or only weak results. [`thresholds.json`](../benchmarks/retrieval/thresholds.json) gates CI.

Determinism hashes one full render. CI reruns the same operation on its runner; a cross-platform claim will be added only after committed results exist for every named OS/Node cell. The manual paid agent suite is deliberately separate: `make eval-agent` describes two equal-information arms and requires model/date/agent-version provenance.

## Method changelog

- **1.5.0 (2026-08-21):** initial harness. Cold latency uses bundled CLI processes; context uses `openhint-unicode-v1`; Git Trace2 counts status subprocesses; package size uses npm dry-run metadata.
