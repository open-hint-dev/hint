.PHONY: release

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
	@yarn publish

refresh:
	@yarn refresh

release:
	@echo "Releasing version ${VERSION} for ${OS}/${ARCH}..."
	@rm -rf release
	@yarn release

test:
	@yarn test