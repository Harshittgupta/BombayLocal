#!/bin/sh
# Service entry point on the hosted VM (issuer/deploy/unlink-issuer.service). The issuer must continue from its existing
# database (the tree, roots and batch numbers already on Sepolia and Arkiv). Started on an empty database it would
# publish a conflicting tree, so a missing file is a hard error, never a fresh start (issuer/deploy/README.md step 6).
set -eu
DB="${ISSUER_DB_PATH:-issuer.db}"
if [ ! -f "$DB" ]; then
  echo "No issuer database at $DB. Upload it first (issuer/deploy/README.md). Not starting." >&2
  exit 1
fi
exec node_modules/.bin/tsx src/server.ts
