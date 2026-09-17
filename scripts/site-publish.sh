#!/usr/bin/env bash
set -euo pipefail

repository_root=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
environment_file=${SITE_DEPLOY_ENV_FILE:-"$repository_root/.env"}
public_manifest="$repository_root/scripts/site-public-files.txt"
legacy_manifest="$repository_root/scripts/site-legacy-files.txt"
mode=publish

case ${1:-} in
  '') ;;
  --dry-run) mode=dry-run ;;
  --preflight) mode=preflight ;;
  *) echo "usage: scripts/site-publish.sh [--dry-run | --preflight]" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
  echo "usage: scripts/site-publish.sh [--dry-run | --preflight]" >&2
  exit 2
fi

if [[ ! -f "$environment_file" ]]; then
  echo "site-publish: environment file not found" >&2
  echo "site-publish: copy .env.example to .env and fill its values" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$environment_file"
set +a

SITE_DEPLOY_HOST=${SITE_DEPLOY_HOST:-}
SITE_DEPLOY_USER=${SITE_DEPLOY_USER:-}
SITE_DEPLOY_PATH=${SITE_DEPLOY_PATH:-}

for name in SITE_DEPLOY_HOST SITE_DEPLOY_USER SITE_DEPLOY_PATH; do
  if [[ -z ${!name:-} ]]; then
    echo "site-publish: required value is missing: $name" >&2
    exit 1
  fi
  if [[ ${!name} == *$'\n'* || ${!name} == *$'\r'* ]]; then
    echo "site-publish: $name must be one line" >&2
    exit 1
  fi
done

SITE_DEPLOY_PORT=${SITE_DEPLOY_PORT:-22}
if [[ ! $SITE_DEPLOY_HOST =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "site-publish: SITE_DEPLOY_HOST contains unsupported characters" >&2
  exit 1
fi
if [[ ! $SITE_DEPLOY_USER =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "site-publish: SITE_DEPLOY_USER contains unsupported characters" >&2
  exit 1
fi
if [[ ! $SITE_DEPLOY_PORT =~ ^[0-9]+$ ]] || (( 10#$SITE_DEPLOY_PORT < 1 || 10#$SITE_DEPLOY_PORT > 65535 )); then
  echo "site-publish: SITE_DEPLOY_PORT must be an integer from 1 to 65535" >&2
  exit 1
fi
if [[ ( $SITE_DEPLOY_PATH != /* && ${SITE_DEPLOY_PATH:0:2} != \~/ ) ||
      $SITE_DEPLOY_PATH == '/' || $SITE_DEPLOY_PATH == \~/ ||
      $SITE_DEPLOY_PATH == *..* || ! $SITE_DEPLOY_PATH =~ ^[A-Za-z0-9_./~-]+$ ]]; then
  echo "site-publish: SITE_DEPLOY_PATH must be a safe absolute or ~/ relative path" >&2
  exit 1
fi
for optional in SITE_DEPLOY_IDENTITY_FILE SITE_DEPLOY_KNOWN_HOSTS_FILE; do
  value=${!optional:-}
  if [[ $value == *$'\n'* || $value == *$'\r'* ]]; then
    echo "site-publish: $optional must be one line" >&2
    exit 1
  fi
  if [[ -n $value && ! -f $value ]]; then
    echo "site-publish: configured $optional file does not exist" >&2
    exit 1
  fi
done

temporary=$(mktemp -d "${TMPDIR:-/tmp}/hint-site-publish.XXXXXX")
trap 'rm -rf -- "$temporary"' EXIT
package="$temporary/public"
ssh_config="$temporary/ssh_config"
remote_inventory="$temporary/remote-inventory.txt"

"$repository_root/scripts/site-package.sh" "$package"

if [[ $mode == dry-run ]]; then
  echo "site-publish: dry-run; no remote connection, upload, backup, or cleanup"
  echo "site-publish: upload manifest"
  sed 's/^/  /' "$public_manifest"
  echo "site-publish: legacy cleanup manifest"
  sed 's/^/  /' "$legacy_manifest"
  echo "site-publish: would verify the configured target, back up affected files, upload with SCP, and remove only the cleanup manifest"
  exit 0
fi

{
  echo 'Host site-production'
  printf '  HostName %s\n' "$SITE_DEPLOY_HOST"
  printf '  User %s\n' "$SITE_DEPLOY_USER"
  printf '  Port %s\n' "$SITE_DEPLOY_PORT"
  echo '  BatchMode yes'
  echo '  IdentitiesOnly yes'
  echo '  StrictHostKeyChecking yes'
  echo '  LogLevel ERROR'
  if [[ -n ${SITE_DEPLOY_IDENTITY_FILE:-} ]]; then
    printf '  IdentityFile "%s"\n' "$SITE_DEPLOY_IDENTITY_FILE"
  fi
  if [[ -n ${SITE_DEPLOY_KNOWN_HOSTS_FILE:-} ]]; then
    printf '  UserKnownHostsFile "%s"\n' "$SITE_DEPLOY_KNOWN_HOSTS_FILE"
  fi
} > "$ssh_config"
chmod 600 "$ssh_config"

curl --fail --silent --show-error --location https://openhint.dev/ > "$temporary/live-index.html"
live_hash=$(shasum -a 256 "$temporary/live-index.html" | awk '{print $1}')
remote_hash=$(ssh -F "$ssh_config" site-production \
  "cd $SITE_DEPLOY_PATH && test -f index.html && (sha256sum index.html 2>/dev/null || shasum -a 256 index.html)" | awk '{print $1}')
if [[ -z $remote_hash || $live_hash != "$remote_hash" ]]; then
  echo "site-publish: configured target is not the document root currently serving openhint.dev" >&2
  exit 1
fi

local_htaccess_hash=$(shasum -a 256 "$package/.htaccess" | awk '{print $1}')
remote_htaccess_hash=$(ssh -F "$ssh_config" site-production \
  "cd $SITE_DEPLOY_PATH && if test -f .htaccess; then (sha256sum .htaccess 2>/dev/null || shasum -a 256 .htaccess); else echo absent; fi" | awk '{print $1}')
if [[ $remote_htaccess_hash != absent && $remote_htaccess_hash != "$local_htaccess_hash" ]]; then
  echo "site-publish: existing root .htaccess differs from the managed file; merge its hosting rules before publishing" >&2
  exit 1
fi

ssh -F "$ssh_config" site-production \
  "cd $SITE_DEPLOY_PATH && find . -mindepth 1 -maxdepth 3 -type f -print | LC_ALL=C sort" > "$remote_inventory"
inventory_count=$(wc -l < "$remote_inventory" | tr -d ' ')
echo "site-publish: preflight confirmed live target and inventoried $inventory_count files"
if [[ $mode == preflight ]]; then
  echo "site-publish: read-only preflight complete"
  exit 0
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_script="$temporary/remote-backup.sh"
{
  cat <<'REMOTE_BACKUP_HEAD'
#!/usr/bin/env bash
set -euo pipefail
deploy_path=$1
timestamp=$2
cd "$deploy_path"
docroot=$(pwd -P)
backup_root="$(dirname "$docroot")/.openhint-site-backups/$timestamp"
umask 077
mkdir -p "$backup_root"
managed=()
REMOTE_BACKUP_HEAD
  while IFS= read -r relative || [[ -n $relative ]]; do
    [[ -n $relative ]] || continue
    printf "managed+=(%q)\n" "$relative"
  done < "$public_manifest"
  while IFS= read -r relative || [[ -n $relative ]]; do
    [[ -n $relative ]] || continue
    printf "managed+=(%q)\n" "$relative"
  done < "$legacy_manifest"
  cat <<'REMOTE_BACKUP_TAIL'
count=0
for relative in "${managed[@]}"; do
  if [[ -f $relative || -L $relative ]]; then
    mkdir -p "$backup_root/$(dirname "$relative")"
    cp -a -- "$relative" "$backup_root/$relative"
    count=$((count + 1))
  fi
done
printf 'site-publish: backup %s contains %s affected files\n' "$timestamp" "$count"
REMOTE_BACKUP_TAIL
} > "$backup_script"
ssh -F "$ssh_config" site-production "bash -s -- $SITE_DEPLOY_PATH $timestamp" < "$backup_script"

scp -F "$ssh_config" -r "$package/." "site-production:${SITE_DEPLOY_PATH%/}/"

cleanup_script="$temporary/remote-cleanup.sh"
{
  cat <<'REMOTE_CLEANUP_HEAD'
#!/usr/bin/env bash
set -euo pipefail
cd "$1"
legacy=()
REMOTE_CLEANUP_HEAD
  while IFS= read -r relative || [[ -n $relative ]]; do
    [[ -n $relative ]] || continue
    printf "legacy+=(%q)\n" "$relative"
  done < "$legacy_manifest"
  cat <<'REMOTE_CLEANUP_TAIL'
for relative in "${legacy[@]}"; do
  if [[ -f $relative || -L $relative ]]; then
    rm -f -- "$relative"
  fi
done
rmdir professions assets/og assets 2>/dev/null || true
REMOTE_CLEANUP_TAIL
} > "$cleanup_script"
ssh -F "$ssh_config" site-production "bash -s -- $SITE_DEPLOY_PATH" < "$cleanup_script"

echo "site-publish: upload and targeted legacy cleanup complete"
