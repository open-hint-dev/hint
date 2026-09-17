#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/site-package.sh DESTINATION" >&2
  exit 2
fi

destination=$1
repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
site_root="$repository_root/sites/openhint.dev"
manifest="$repository_root/scripts/site-public-files.txt"

if [ -L "$destination" ]; then
  echo "site-package: destination must not be a symlink: $destination" >&2
  exit 1
fi
if [ -e "$destination" ] && [ ! -d "$destination" ]; then
  echo "site-package: destination is not a directory: $destination" >&2
  exit 1
fi
mkdir -p "$destination"
if [ -n "$(find "$destination" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "site-package: destination must be empty: $destination" >&2
  exit 1
fi

while IFS= read -r relative || [ -n "$relative" ]; do
  [ -n "$relative" ] || continue
  case "$relative" in
    /*|../*|*/../*|*/..)
      echo "site-package: unsafe manifest entry" >&2
      exit 1
      ;;
  esac
  source_file="$site_root/$relative"
  if [ -L "$source_file" ]; then
    echo "site-package: public source must not be a symlink: $relative" >&2
    exit 1
  fi
  if [ ! -f "$source_file" ]; then
    echo "site-package: required public file is missing: $relative" >&2
    exit 1
  fi
  cp "$source_file" "$destination/$relative"
done < "$manifest"

node "$repository_root/scripts/check-site.mjs" --root "$destination" --packaged
echo "site-package: staged allowlisted public files"
