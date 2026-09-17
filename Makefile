.PHONY: site-check site-package site-publish-dry-run site-publish

site-check:
	yarn site:check

site-package: site-check
	@test -n "$(DEST)" || (echo "usage: make site-package DEST=/absolute/path/to/empty-directory" >&2; exit 2)
	./scripts/site-package.sh "$(DEST)"

site-publish-dry-run:
	./scripts/site-publish.sh --dry-run

site-publish:
	./scripts/site-publish.sh
