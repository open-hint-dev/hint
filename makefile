.PHONY: bench eval eval-agent release

OS ?= linux
export OS

ARCH ?= amd64
export ARCH

VERSION ?= 0.0.0
export VERSION

include ./presets/scripts/index.mk

clean:
	@yarn clean

coverage:
	@yarn coverage

fix:
	@yarn fix

lint:
	@yarn lint	

publish:
	@if [ "$(VERSION)" = "0.0.0" ] || [ -z "$(VERSION)" ]; then \
		echo "error: VERSION is required — usage: VERSION=1.2.3 make publish"; \
		exit 1; \
	fi
	@echo "Publishing version ${VERSION}..."
	@node benchmarks/check-claims.mjs
	@$(MAKE) release
	@yarn workspace @openhint/transpiler publish
	@yarn workspace @openhint/cli publish

refresh:
	@yarn refresh

release:
	@echo "Releasing version ${VERSION} for ${OS}/${ARCH}..."
	@rm -rf release
	@yarn release

test:
	@yarn test
	@yarn vite-node applications/cli/index.ts status --exit-code

bench:
	@yarn vite-node benchmarks/run-bench.ts
	@node benchmarks/check-perf.mjs

eval:
	@yarn vite-node benchmarks/run-eval.ts

eval-agent:
	@cat benchmarks/agent/README.md
