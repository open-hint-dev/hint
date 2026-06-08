NPM_COMMAND ?= npm
NPM_REGISTRY ?= https://registry.npmjs.org
NPM_TAG ?= latest
NPM_ACCESS ?= public
NPM_PROVENANCE ?= false
NPM_PUBLISH_ARGS ?=
NPM_PROVENANCE_FLAG ?= $(if $(filter true 1 yes,$(NPM_PROVENANCE)),--provenance)

.PHONY: check-release-js
check-release-js: verify-package-js
	node -e 'const fs = require("node:fs"); const path = process.argv[1]; const expectedName = process.argv[2]; const manifest = JSON.parse(fs.readFileSync(path, "utf8")); if (typeof manifest.name !== "string" || manifest.name.trim() === "") throw new Error("staged package.json must contain a non-empty string name"); if (manifest.name !== expectedName) throw new Error(`staged package name "$${manifest.name}" does not match "$${expectedName}"`); if (typeof manifest.version !== "string" || manifest.version.trim() === "") throw new Error("staged package.json must contain a non-empty string version"); if (manifest.private === true) throw new Error("private packages cannot be published");' "$(RELEASE_DIR)/package.json" "$(PACKAGE_NAME)"
	$(NPM_COMMAND) whoami --registry "$(NPM_REGISTRY)"

.PHONY: release-dry-run-js
release-dry-run-js: check-release-js
	$(NPM_COMMAND) publish "$(RELEASE_DIR)" --dry-run --registry "$(NPM_REGISTRY)" --tag "$(NPM_TAG)" --access "$(NPM_ACCESS)" $(NPM_PROVENANCE_FLAG) $(NPM_PUBLISH_ARGS)

.PHONY: release-js
release-js: check-release-js
	$(NPM_COMMAND) publish "$(RELEASE_DIR)" --registry "$(NPM_REGISTRY)" --tag "$(NPM_TAG)" --access "$(NPM_ACCESS)" $(NPM_PROVENANCE_FLAG) $(NPM_PUBLISH_ARGS)
