#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh not found. Start MongoDB via Docker instead:"
  echo "  docker compose up mongodb -d"
  exit 1
fi

MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017/shamal_middleware}"

if ! mongosh "$MONGO_URI" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
  echo "MongoDB is not reachable at: $MONGO_URI"
  echo "Start it with: docker compose up mongodb -d"
  exit 1
fi

export MONGODB_URI="$MONGO_URI"
npm run db:migrate

echo ""
echo "MongoDB ready. Add to .env if needed:"
echo "  MONGODB_URI=$MONGO_URI"
