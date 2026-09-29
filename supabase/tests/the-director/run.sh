#!/usr/bin/env bash
# Rehearse 20270520090000_the_director_list.sql on a THROWAWAY local PG16.
# Never points at a real database: it starts its own cluster in $PGT.
#
#   PGPORT_T=54421 bash supabase/tests/the-director/run.sh   (PGT defaults to a new mktemp dir)
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL=C LANG=C

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PGT="${PGT:-$(mktemp -d)}"
PORT="${PGPORT_T:-54421}"
PSQL=(psql -X -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)

if [ -e "$PGT/data" ]; then echo "refusing: $PGT/data already exists" >&2; exit 1; fi
mkdir -p "$PGT"
initdb -D "$PGT/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$PGT/data" -o "-p $PORT -c unix_socket_directories= -c listen_addresses=127.0.0.1" -l "$PGT/log" -w start >/dev/null
trap 'pg_ctl -D "$PGT/data" -m fast stop >/dev/null' EXIT

"${PSQL[@]}" -f "$HERE/stub-schema.sql"

# Real code from the repo, verbatim (line ranges, not re-typed):
#  - is_super_admin() + is_admin()                  supabase/setup/02_functions.sql
#  - platform_policies table, RLS, 4 base policies  20260429000002 (section 1-2)
#  - "Service role manages" / "Admins can view" / "Admins can update" policies
#                                                   20260525200000
sed -n '55,80p'  "$REPO/supabase/setup/02_functions.sql"                                        > "$PGT/helpers.sql"
sed -n '14,58p'  "$REPO/supabase/migrations/20260429000002_platform_policies_substrate.sql"     > "$PGT/table.sql"
sed -n '29,62p'  "$REPO/supabase/migrations/20260525200000_learner_risk_intelligence_substrate.sql" > "$PGT/more-policies.sql"
"${PSQL[@]}" -f "$PGT/helpers.sql" -f "$PGT/table.sql" -f "$PGT/more-policies.sql"

MIG="$REPO/supabase/migrations/20270520090000_the_director_list.sql"
echo "-- apply 1"; "${PSQL[@]}" -f "$MIG"
echo "-- apply 2"; "${PSQL[@]}" -f "$MIG"

"${PSQL[@]}" -o /dev/null -f "$HERE/assert.sql"
