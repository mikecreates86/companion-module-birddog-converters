#!/usr/bin/env bash
# Stops with a clear error unless the version in package.json is higher than
# every version already published, and matches the module's manifest.
# Usage: check-version.sh "<existing versions, one per line>"
set -euo pipefail

NEW=$(node -p "require('./package.json').version")
MANIFEST=$(node -p "require('./companion/manifest.json').version")
EXISTING="${1:-}"

if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version '$NEW' in package.json must look like 1.2.3" >&2
  exit 1
fi
if [ "$NEW" != "$MANIFEST" ]; then
  echo "ERROR: package.json says $NEW but companion/manifest.json says $MANIFEST. Make them match." >&2
  exit 1
fi

HIGHEST=$(printf '%s\n' "$EXISTING" | sed 's/^v//' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true)
if [ -n "$HIGHEST" ]; then
  TOP=$(printf '%s\n%s\n' "$HIGHEST" "$NEW" | sort -V | tail -n 1)
  if [ "$NEW" = "$HIGHEST" ] || [ "$TOP" != "$NEW" ]; then
    echo "ERROR: version $NEW is not higher than the newest published version $HIGHEST. Raise the version number in package.json and companion/manifest.json." >&2
    exit 1
  fi
fi
echo "Version $NEW is ready${HIGHEST:+, up from $HIGHEST}."
