clean-js:
	@echo "Cleaning JavaScript node modules..."
	@find . -name 'node_modules' -exec rm -rf {} +
