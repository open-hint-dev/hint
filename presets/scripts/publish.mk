publish-js:
	@name=$$(node -p "require('./package.json').name"); \
	if npm view "$$name@$(VERSION)" version >/dev/null 2>&1; then \
		echo "$$name@$(VERSION) is already published — skipping."; \
	else \
		echo "Publishing $$name@$(VERSION)..."; \
		npm publish "$(ROOT_DIR)/release/$$name" --access public; \
	fi
