TRANSPILER_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PACKAGE_DIR ?= $(TRANSPILER_DIR)
PACKAGE_JSON ?= $(PACKAGE_DIR)/package.json
BUILD_COMMAND ?= $(PACKAGE_MANAGER) vite build --config vite.config.ts
TEST_FILTER ?= $(PACKAGE_DIR)
ESLINT_TARGET ?= .
PRETTIER_TARGET ?= .
PACKAGE_METADATA_FILES ?= package.json README.md README LICENSE LICENSE.md

include $(TRANSPILER_DIR)/../../presets/scripts/index.mk

.DEFAULT_GOAL := help

.PHONY: help
help:
	@printf '%s\n' \
		'build - build the library into its staged release directory' \
		'check - run lint, tests, and npm package verification' \
		'test - run package tests' \
		'coverage - run package tests with coverage' \
		'lint - check ESLint rules' \
		'fix - apply ESLint fixes' \
		'format - apply Prettier formatting' \
		'refresh - format and apply ESLint fixes' \
		'pack - build and create a local npm archive' \
		'release-check - verify build, package metadata, and npm authentication' \
		'release-dry-run - simulate publishing to npm' \
		'release - publish the staged package' \
		'clean - remove this package'\''s staged build'

.PHONY: build
build:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" build-js

.PHONY: test
test:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" test-js

.PHONY: coverage
coverage:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" coverage-js

.PHONY: lint
lint:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" lint-js

.PHONY: fix
fix:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" fix-js

.PHONY: format
format:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" format-js

.PHONY: refresh
refresh:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" refresh-js

.PHONY: pack
pack:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" pack-js

.PHONY: clean
clean:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" clean-build-js

.PHONY: check
check:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" lint-js
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" test-js
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" verify-package-js

.PHONY: release-check
release-check:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" check-release-js

.PHONY: release-dry-run
release-dry-run:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" release-dry-run-js

.PHONY: release
release:
	$(MAKE) -f "$(TRANSPILER_DIR)/makefile" release-js
