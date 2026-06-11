fix-js:
	@echo "Running JavaScript lint fixes..."
	@yarn eslint --fix **/*.ts --no-warn-ignored
