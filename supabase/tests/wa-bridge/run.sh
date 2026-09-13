#!/usr/bin/env bash
#
# supabase/tests/wa-bridge/run.sh
#
# Loads 20261211090000_wa_bridge_outbox.sql into a THROWAWAY local database and
# runs the RLS / constraint assertions against it as a low-privilege user.
#
# Touches no remote project. The database is created and dropped here; nothing
# in this script can reach production, which is the point — the migration is
# FILE ONLY and is applied by the operator at merge, so this is the only place
# its behaviour can be exercised before then.
#
# Usage:  bash supabase/tests/wa-bridge/run.sh
# Needs:  a local PostgreSQL 14+ accepting connections as the current user.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20261211090000_wa_bridge_outbox.sql"
DB="wa_bridge_test_$$"

cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

createdb "$DB"

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/stub-schema.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$MIGRATION"
psql -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/rls-and-constraints.sql"
