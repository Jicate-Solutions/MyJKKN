#!/usr/bin/env bash
# Weekly Power Users (2026-10-09, W12 critic): two runs at the same moment must keep
# EVERY agenda job id. Run A merges its ids and holds its transaction open for 2 s;
# run B merges different ids 0.7 s later and must wait for the row lock, then add to
# A's ids instead of replacing them. Runs on the database 25_power_users.sql left.
set -euo pipefail
DB="$1"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
DELETE FROM adoption_power_user_weeks WHERE week_start = '2021-01-04';
INSERT INTO adoption_power_user_weeks (week_start, computed_at, payload, agenda_jobs)
VALUES ('2021-01-04', now(), '{"top":[]}', '{"u-old":"job-old"}');
SQL
psql -d "$DB" -q >/dev/null <<'SQL' &
BEGIN;
SELECT fn_adoption_power_user_weeks_merge_jobs('2021-01-04', '{"u-a1":"job-a1","u-a2":"job-a2"}');
SELECT pg_sleep(2);
COMMIT;
SQL
A=$!
sleep 0.7
psql -d "$DB" -v ON_ERROR_STOP=1 -q >/dev/null -c \
  "SELECT fn_adoption_power_user_weeks_merge_jobs('2021-01-04', '{\"u-b1\":\"job-b1\"}')"
wait $A
KEYS=$(psql -d "$DB" -tAq -c "SELECT string_agg(k, ',' ORDER BY k) FROM adoption_power_user_weeks, jsonb_object_keys(agenda_jobs) k WHERE week_start = '2021-01-04'")
[ "$KEYS" = "u-a1,u-a2,u-b1,u-old" ] || { echo "FAIL power users concurrency: two overlapping runs left agenda_jobs keys '$KEYS'"; exit 1; }
BAD=$(psql -d "$DB" -tAq -c "SELECT count(*) FROM (SELECT fn_adoption_power_user_weeks_merge_jobs('2021-01-04', '[]'::jsonb)) x" 2>&1 || true)
echo "$BAD" | grep -q "must be a json object" || { echo "FAIL power users concurrency: a non-object was accepted"; exit 1; }
echo "=== POWER USERS CONCURRENCY PASSED (2 overlapping runs, keys $KEYS) ==="
