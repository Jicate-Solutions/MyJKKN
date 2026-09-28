#!/usr/bin/env bash
# Review 4 (2026-09-25): two Ask-why presses at the same moment, with ONE message left in
# the day's budget, must send exactly one question between them. Runs on the database
# 20_daily_tick.sql left behind (its people and super admin). Session A presses and holds
# its transaction open for 2 s; session B presses 0.7 s later. B must wait for the lock,
# then see the budget spent.
set -euo pipefail
DB="$1"
psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
UPDATE adoption_asks SET asked_at = now() - interval '40 days';
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
UPDATE platform_policies SET value = '1'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('race.thing','Race thing','do the race thing','{student}',NULL,NULL, now() - interval '45 days', true)->>'success';
SQL
ELIGIBLE=$(psql -d "$DB" -tAq -c "SELECT jsonb_array_length(fn_adoption_ask_why_core('race.thing', NULL, '20000000-0000-0000-0000-000000000001', true, NULL, '{}'::uuid[])->'targets')")
[ "$ELIGIBLE" -ge 2 ] || { echo "FAIL concurrency setup: only $ELIGIBLE eligible"; exit 1; }
PRESS="SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);"
psql -d "$DB" -q >/dev/null <<SQL &
$PRESS
BEGIN;
SELECT fn_adoption_ask_why('race.thing');
SELECT pg_sleep(2);
COMMIT;
SQL
A=$!
sleep 0.7
psql -d "$DB" -q >/dev/null <<SQL
$PRESS
SELECT fn_adoption_ask_why('race.thing');
SQL
wait $A
SENT=$(psql -d "$DB" -tAq -c "SELECT count(*) FROM adoption_asks WHERE feature_key = 'race.thing'")
[ "$SENT" = "1" ] || { echo "FAIL concurrency: two simultaneous presses sent $SENT questions with a budget of 1"; exit 1; }
echo "=== CONCURRENCY SCENARIO PASSED (2 presses, budget 1, sent $SENT) ==="
