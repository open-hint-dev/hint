release-js:
	@echo "Releasing JavaScript package..."
	@yarn vite build
	@node $(ROOT_DIR)/presets/typescript/release.ts
