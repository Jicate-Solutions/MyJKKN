#!/usr/bin/env bash
# Throwaway-cluster proof for ig_learner_post_claims. Usage: run.sh [--original-only]
#   --original-only  applies ONLY 20261022000000, skipping the hardening. This is
#                    the falsification run: the critical assertion must then FAIL.
# A fresh temp directory per run, so nothing is ever deleted; /tmp is reaped by the OS.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL=C LANG=C                       # else macOS: "postmaster became multithreaded"
HERE="$(cd "$(dirname "$0")" && pwd)"; MIG="$HERE/../../migrations"
D="$(mktemp -d /tmp/pgtc.XXXXXX)"; PORT=54398
initdb -D "$D/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$D/data" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$D/log" start -w >/dev/null
trap 'pg_ctl -D "$D/data" stop -m immediate >/dev/null 2>&1 || true' EXIT
P="psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $PORT -d postgres"
$P -U postgres -f "$HERE/stub-schema.sql"
$P -U postgres -f "$MIG/20261022000000_learner_ig_post_claims.sql"
if [ "${1:-}" != "--original-only" ]; then
  $P -U postgres -f "$MIG/20261022000100_learner_ig_post_claims_hardening.sql"
fi
$P -U app_user -f "$HERE/assert.sql"
if [ "${1:-}" != "--original-only" ]; then
  $P -U postgres -f "$HERE/owner-assert.sql"
fi
