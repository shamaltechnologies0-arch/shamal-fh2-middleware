#!/usr/bin/env bash
set -euo pipefail

mkdir -p public/admin public/bg-image

if [ -f dist/apps/api/src/assets/ui/command-center.html ]; then
  cp dist/apps/api/src/assets/ui/command-center.html public/index.html
else
  cp apps/api/src/assets/ui/command-center.html public/index.html
fi

cp public/index.html public/admin/index.html
cp apps/api/src/assets/bg-image/bg-main.png public/bg-image/bg-main.png
