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

echo "Generating Dart types..."
DART_TMP=$(mktemp)
if npx supabase gen types dart --local > "$DART_TMP"; then
  mv "$DART_TMP" packages/shared-types/dart/lib/db.dart
else
  rm -f "$DART_TMP"
  echo "ERROR: Dart type generation failed. Is supabase start running?"
  exit 1
fi

echo "Types generated successfully!"
