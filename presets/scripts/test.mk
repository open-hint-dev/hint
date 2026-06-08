VITEST_COMMAND ?= $(PACKAGE_MANAGER) vitest
VITEST_CONFIG ?= $(MONOREPO_ROOT)/vitest.config.ts
TEST_FILTER ?= $(PACKAGE_DIR)
TEST_ARGS ?= run
COVERAGE_ARGS ?= run --coverage
ESLINT_COMMAND ?= $(PACKAGE_MANAGER) eslint
ESLINT_TARGET ?= .
PRETTIER_COMMAND ?= $(PACKAGE_MANAGER) prettier
PRETTIER_TARGET ?= .

.PHONY: test-js
test-js:
	cd "$(PACKAGE_DIR)" && $(VITEST_COMMAND) $(TEST_ARGS) --config "$(VITEST_CONFIG)" "$(TEST_FILTER)"

.PHONY: coverage-js
coverage-js:
	cd "$(PACKAGE_DIR)" && $(VITEST_COMMAND) $(COVERAGE_ARGS) --config "$(VITEST_CONFIG)" "$(TEST_FILTER)"

.PHONY: lint-js
lint-js:
	cd "$(PACKAGE_DIR)" && $(ESLINT_COMMAND) "$(ESLINT_TARGET)"

.PHONY: fix-js
fix-js:
	cd "$(PACKAGE_DIR)" && $(ESLINT_COMMAND) "$(ESLINT_TARGET)" --fix

.PHONY: format-js
format-js:
	cd "$(PACKAGE_DIR)" && $(PRETTIER_COMMAND) --write "$(PRETTIER_TARGET)"

.PHONY: refresh-js
refresh-js: format-js
	$(MAKE) fix-js
