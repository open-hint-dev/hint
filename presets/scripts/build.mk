BUILD_COMMAND ?= $(PACKAGE_MANAGER) vite build
CLEAN_COMMAND ?= rm -rf
PACKAGE_METADATA_FILES ?= package.json README.md README LICENSE LICENSE.md
PACKAGE_ARCHIVE_DIR ?= $(RELEASE_ROOT)/archives

define _stagePackageMetadata
set -e; \
mkdir -p "$(RELEASE_DIR)"; \
for file in $(PACKAGE_METADATA_FILES); do \
	if [ -f "$(PACKAGE_DIR)/$$file" ]; then \
		cp "$(PACKAGE_DIR)/$$file" "$(RELEASE_DIR)/$$file"; \
	fi; \
done; \
test -f "$(RELEASE_DIR)/package.json"
endef

.PHONY: clean-build-js
clean-build-js:
	@test -n "$(strip $(RELEASE_DIR))"
	$(CLEAN_COMMAND) "$(RELEASE_DIR)"

.PHONY: build-js
build-js: clean-build-js
	mkdir -p "$(RELEASE_DIR)"
	cd "$(PACKAGE_DIR)" && $(BUILD_COMMAND)
	$(_stagePackageMetadata)

.PHONY: verify-package-js
verify-package-js: build-js
	test -f "$(RELEASE_DIR)/package.json"
	npm pack "$(RELEASE_DIR)" --dry-run

.PHONY: pack-js
pack-js: verify-package-js
	mkdir -p "$(PACKAGE_ARCHIVE_DIR)"
	npm pack "$(RELEASE_DIR)" --pack-destination "$(PACKAGE_ARCHIVE_DIR)"
