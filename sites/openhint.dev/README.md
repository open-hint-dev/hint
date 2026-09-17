# openhint.dev static site

The public site is a deliberately small static package. Its source lives in
this directory; deployment tooling stays in the repository-level `scripts/`
directory.

## Validate and package

```console
make site-check
make site-package DEST=/absolute/path/to/new-or-empty-directory
```

Packaging uses `scripts/site-public-files.txt` as an allowlist and validates
the staged result again. This README, deployment tools, environment files,
plans, Git data, and package-manager files are never included.

## Configure deployment

Copy the repository `.env.example` to `.env` and fill the HINT hosting values.
The publish script sources this trusted local shell file; it is not a safe
parser for untrusted input. `.env` and alternative `.env.*` files are ignored,
while `.env.example` remains versioned.

The required settings are `SITE_DEPLOY_HOST`, `SITE_DEPLOY_USER`, and
`SITE_DEPLOY_PATH`; `SITE_DEPLOY_PORT` defaults to 22. Identity and known-hosts
files are optional. Host-key verification is always strict.

```console
make site-publish-dry-run
./scripts/site-publish.sh --preflight
make site-publish
```

The dry run validates configuration, checks and packages the site, and lists
the exact upload and cleanup manifests without contacting the server. The
preflight is read-only: it verifies SSH access and confirms that the configured
target's current `index.html` is the page served by `https://openhint.dev/`.

Before a real upload, every managed or cleanup-target file that currently
exists is copied to a timestamped `.openhint-site-backups` directory adjacent
to the document root. SCP then overwrites/adds the allowlisted files, after
which only the exact paths in `scripts/site-legacy-files.txt` are removed.
Unknown files, hosting rules, ACME data, and `cgi-bin` are not removed.

If upload or verification fails, locate the timestamp reported by the publish
run and copy its files back to the document root with the same relative paths.
The backup is intentionally outside the public directory. A failed SCP never
runs cleanup and never reports success.
