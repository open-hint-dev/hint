publish-js:
	@echo "Publishing JavaScript package..."
	@npm publish $(ROOT_DIR)/release/$$(node -p "require('./package.json').name") --access public
