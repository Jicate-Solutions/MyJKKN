#!/usr/bin/env bash
# Rehearse 20270520090000_the_director_list.sql on a THROWAWAY local PG16.
# Never points at a real database: it starts its own cluster in $PGT.
#
#   PGPORT_T=54421 bash supabase/tests/the-director/run.sh   (PGT defaults to a new mktemp dir)
#
# Optional: FN_GET_POLICY_ALT=<file.sql> loads a different fn_get_policy body
# after main's (for example Draft #4111's plpgsql version, which merges first),
# to prove the in-place reader patch also closes that body.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL=C LANG=C

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PGT="${PGT:-$(mktemp -d)}"
PORT="${PGPORT_T:-54421}"
PSQL=(psql -X -q -h 127.0.0.1 -p "$PORT" -U postgres   -d postgres -v ON_ERROR_STOP=1)
OWNER=(psql -X -q -h 127.0.0.1 -p "$PORT" -U supa_owner -d postgres -v ON_ERROR_STOP=1)
M="$REPO/supabase/migrations"

if [ -e "$PGT/data" ]; then echo "refusing: $PGT/data already exists" >&2; exit 1; fi
mkdir -p "$PGT"
initdb -D "$PGT/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$PGT/data" -o "-p $PORT -c unix_socket_directories= -c listen_addresses=127.0.0.1" -l "$PGT/log" -w start >/dev/null
trap 'pg_ctl -D "$PGT/data" -m fast stop >/dev/null' EXIT

"${PSQL[@]}" -f "$HERE/stub-schema.sql"

# Real code from the repo, verbatim (line ranges, not re-typed), created by
# the non-superuser owner:
#  - is_super_admin() + is_admin()                   supabase/setup/02_functions.sql
#  - platform_policies table, RLS, 4 base policies   20260429000002 s.1-2
#  - "Service role manages" / "Admins can view" / "Admins can update"
#                                                    20260525200000
#  - scope_type 'cohort' CHECK + newest fn_get_policy 20260731180000 s.1-2
#  - fn_get_policy_int / _text / _bool + their grants 20260429000002 s.4, s.7
#  - fn_get_policy_json                              20260515000001
#  - newest fn_get_policy_bool + its observer        20260808230000 s.1-3
#  - hr_policy_audit_log (+ platform_policies cols)  20260601 s.1-3, 20260524084000 s.1-2
#  - fn_internship_evaluate_policy                   20260509 v2
{
  sed -n '55,80p'   "$REPO/supabase/setup/02_functions.sql"
  sed -n '14,58p'   "$M/20260429000002_platform_policies_substrate.sql"
  sed -n '29,62p'   "$M/20260525200000_learner_risk_intelligence_substrate.sql"
  sed -n '57,62p'   "$M/20260731180000_platform_policies_cohort_scope.sql"
  sed -n '85,120p'  "$M/20260731180000_platform_policies_cohort_scope.sql"
  sed -n '95,117p'  "$M/20260429000002_platform_policies_substrate.sql"
  sed -n '314,322p' "$M/20260429000002_platform_policies_substrate.sql"
  sed -n '22,36p'   "$M/20260515000001_fn_get_policy_json.sql"
  sed -n '45,200p'  "$M/20260808230000_policy_gate_observations.sql"
  sed -n '27,128p'  "$M/20260601_hr_policy_substrate_extensions.sql"
  sed -n '21,55p'   "$M/20260524084000_hr_policy_audit_extensions.sql"
  sed -n '13,85p'   "$M/20260509_internship_module_reader_fn_v2.sql"
} > "$PGT/repo-objects.sql"
"${OWNER[@]}" -f "$PGT/repo-objects.sql"

if [ -n "${FN_GET_POLICY_ALT:-}" ]; then
  echo "-- loading alternative fn_get_policy body: $FN_GET_POLICY_ALT"
  "${OWNER[@]}" -f "$FN_GET_POLICY_ALT"
fi

# Keep the readers' bodies as they stand BEFORE the migration, so assert.sql
# can prove the in-place patch added the guard and changed nothing else.
"${PSQL[@]}" -c "CREATE TABLE public.t_pre_defs AS
  SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
   WHERE p.oid IN ('public.fn_get_policy(text, uuid)'::regprocedure,
                   'public.fn_internship_evaluate_policy(text, jsonb)'::regprocedure)"

MIG="$M/20270520090000_the_director_list.sql"
echo "-- apply 1"; "${OWNER[@]}" -f "$MIG"
echo "-- apply 2"; "${OWNER[@]}" -f "$MIG"

"${PSQL[@]}" -o /dev/null -f "$HERE/assert.sql"
