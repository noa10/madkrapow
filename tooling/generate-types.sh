#!/bin/bash

# Exit on error
set -e

# Resolve repo root (this script lives in tooling/)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Load environment variables if .env.local exists
if [ -f .env.local ]; then
  set -a
  source <(grep -v '^#' .env.local | grep -v '^\s*$')
  set +a
fi

echo "Generating TypeScript types..."
TS_TMP=$(mktemp)
if npx supabase gen types typescript --local > "$TS_TMP"; then
  mv "$TS_TMP" packages/shared-types/typescript/db.ts
else
  rm -f "$TS_TMP"
  echo "ERROR: TypeScript type generation failed. Is supabase start running?"
  exit 1
fi

# Note: Supabase CLI no longer supports Dart type generation.
# Flutter apps use the TypeScript types via code generation tools
# (e.g., supabase_codegen package) or reference the schema directly
# through supabase_flutter's Map-based API.

echo "Types generated successfully!"
