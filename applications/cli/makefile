CLI_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

include $(CLI_DIR)/../../presets/scripts/index.mk

TEST_ARGS := run --passWithNoTests

define _stagePackageMetadata
set -e; \
mkdir -p "$(RELEASE_DIR)"; \
for file in $(PACKAGE_METADATA_FILES); do \
	if [ -f "$(PACKAGE_DIR)/$$file" ]; then \
		cp "$(PACKAGE_DIR)/$$file" "$(RELEASE_DIR)/$$file"; \
	fi; \
done; \
test -f "$(RELEASE_DIR)/package.json"; \
node -e ' \
	const fs = require("node:fs"); \
	const path = "$(RELEASE_DIR)/package.json"; \
	const pkg = JSON.parse(fs.readFileSync(path, "utf8")); \
	delete pkg.devDependencies; \
	delete pkg.scripts; \
	fs.writeFileSync(path, JSON.stringify(pkg, null, 4) + "\n"); \
'
endef

.DEFAULT_GOAL := help

.PHONY: help
help:
	@printf '%s\n' \
		'build         - build the CLI into its staged release directory' \
		'check         - run lint, tests, and npm package verification' \
		'test          - run package tests' \
		'coverage      - run package tests with coverage' \
		'lint          - check ESLint rules' \
		'fix           - apply ESLint fixes' \
		'refresh       - format and apply ESLint fixes' \
		'pack          - build and create a local npm archive' \
		'release-check - verify build, package metadata, and npm authentication' \
		'release-dry-run - simulate publishing to npm' \
		'release       - publish the staged package' \
		'clean         - remove this package'\''s staged build'

.PHONY: build
build:
	$(MAKE) -f "$(CLI_DIR)/makefile" build-js

.PHONY: test
test:
	$(MAKE) -f "$(CLI_DIR)/makefile" test-js

.PHONY: coverage
coverage:
	$(MAKE) -f "$(CLI_DIR)/makefile" coverage-js

.PHONY: lint
lint:
	$(MAKE) -f "$(CLI_DIR)/makefile" lint-js

.PHONY: fix
fix:
	$(MAKE) -f "$(CLI_DIR)/makefile" fix-js

.PHONY: refresh
refresh:
	$(MAKE) -f "$(CLI_DIR)/makefile" refresh-js

.PHONY: pack
pack:
	$(MAKE) -f "$(CLI_DIR)/makefile" pack-js

.PHONY: clean
clean:
	$(MAKE) -f "$(CLI_DIR)/makefile" clean-build-js

.PHONY: check
check:
	$(MAKE) -f "$(CLI_DIR)/makefile" lint-js
	$(MAKE) -f "$(CLI_DIR)/makefile" test-js
	$(MAKE) -f "$(CLI_DIR)/makefile" verify-package-js

.PHONY: release-check
release-check:
	$(MAKE) -f "$(CLI_DIR)/makefile" test-js
	$(MAKE) -f "$(CLI_DIR)/makefile" check-release-js

.PHONY: release-dry-run
release-dry-run:
	$(MAKE) -f "$(CLI_DIR)/makefile" test-js
	$(MAKE) -f "$(CLI_DIR)/makefile" release-dry-run-js

.PHONY: release
release:
	$(MAKE) -f "$(CLI_DIR)/makefile" test-js
	$(MAKE) -f "$(CLI_DIR)/makefile" release-js
