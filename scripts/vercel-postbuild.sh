#!/usr/bin/env bash
set -euo pipefail

SPA_DIST="dist/apps/api/src/assets/ui/dist"

if [ ! -f "$SPA_DIST/index.html" ]; then
  echo "SPA build output not found at $SPA_DIST" >&2
  exit 1
fi

mkdir -p public
cp -R "$SPA_DIST"/. public/

# Client-side route fallbacks for direct navigation to /admin
mkdir -p public/admin
cp public/index.html public/admin/index.html
