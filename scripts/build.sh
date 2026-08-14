#!/usr/bin/env bash
# Produce the deployable page from the source in live/.
#
# The only build step is substituting the Supabase anon key: the source keeps
# the placeholder __SUPABASE_ANON_KEY__ so the key is never committed to git.
# Reads it from ~/.ascend-taskmanager-creds.
#
#   bash scripts/build.sh          → writes dist/
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREDS="$HOME/.ascend-taskmanager-creds"
[ -f "$CREDS" ] || { echo "ERROR: $CREDS not found" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CREDS"
[ -n "${SUPABASE_ANON_KEY:-}" ] || { echo "ERROR: SUPABASE_ANON_KEY not set in $CREDS" >&2; exit 1; }

mkdir -p "$DIR/dist"
for f in index.html task.html; do
  [ -f "$DIR/live/$f" ] || continue
  # The key is a JWT: only [A-Za-z0-9._-], so it is safe as a sed replacement.
  sed "s|__SUPABASE_ANON_KEY__|$SUPABASE_ANON_KEY|g" "$DIR/live/$f" > "$DIR/dist/$f"
  if grep -q "__SUPABASE_ANON_KEY__" "$DIR/dist/$f"; then
    echo "ERROR: placeholder still present in dist/$f" >&2; exit 1
  fi
  echo "built dist/$f"
done
