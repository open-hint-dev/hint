lint-js:
	@echo "Running JavaScript linting..."
	@yarn eslint **/*.ts --no-warn-ignored
