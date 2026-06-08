include ../../presets/scripts/index.mk

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
