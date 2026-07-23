#!/usr/bin/env bash
# ============================================================
# C2 — CDC cron firing verification harness
# ============================================================
# Reproduces the smoke tests documented in
# docs/audit/cdc-cron-firing-2026-05-19.md
#
# Usage:
#   ./scripts/cdc-cron-verify.sh
#
# Requires:
#   - ~/.supabase/access-token  (Supabase Management API token)
#   - jq
#   - curl
#
# Safety:
#   All synthetic data writes are inside BEGIN/ROLLBACK transactions.
#   Zero data leakage into prod.
# ============================================================

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-kvizhngldtiuufknvehv}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/.supabase/access-token}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "ERROR: Supabase access token not found at $TOKEN_FILE" >&2
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")
ENDPOINT="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

run_sql() {
  local sql="$1"
  local payload
  payload=$(printf '%s' "$sql" | jq -Rs '{query: .}')
  curl -s -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

echo "=== Cron jobs metadata ==="
run_sql "SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname ILIKE 'cdc_%' ORDER BY jobid;"
echo

echo "=== Last 5 cron runs ==="
run_sql "SELECT runid, jobid, status, return_message, start_time FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname ILIKE 'cdc_%') ORDER BY start_time DESC LIMIT 5;"
echo

echo "=== Test 1: fn_cdc_coordinator_overdue_check ==="
run_sql "$(cat <<'SQL'
BEGIN;
INSERT INTO cdc_recruiters (id, name) VALUES (gen_random_uuid(), 'C2-overdue-test-DELETEME');
WITH r AS (SELECT id FROM cdc_recruiters WHERE name = 'C2-overdue-test-DELETEME'),
     dt AS (SELECT id FROM cdc_drive_types LIMIT 1)
INSERT INTO cdc_drives (recruiter_id, drive_type_id, title, status, coordinator_approval_deadline_hours, willingness_window_open_at, created_at)
SELECT r.id, dt.id, 'C2-overdue-test-drive', 'willingness_open', 1, now() - interval '5 hours', now() - interval '5 hours'
FROM r, dt;

SELECT fn_cdc_coordinator_overdue_check();

SELECT count(*) AS log_rows
FROM cdc_coordinator_overdue_log
WHERE drive_id IN (SELECT id FROM cdc_drives WHERE title = 'C2-overdue-test-drive');

ROLLBACK;
SQL
)"
echo

echo "=== Test 2: fn_cdc_quarterly_placement_snapshot ==="
run_sql "$(cat <<'SQL'
BEGIN;
WITH r AS (
  INSERT INTO cdc_recruiters (name) VALUES ('C2-snapshot-test-DELETEME') RETURNING id
),
ot AS (SELECT id FROM cdc_offer_types LIMIT 1),
l AS (SELECT learner_id FROM profiles WHERE learner_id IS NOT NULL LIMIT 1)
INSERT INTO cdc_placements (learner_id, recruiter_id, offer_type_id, status, package_lpa, offered_at, accepted_at)
SELECT l.learner_id, r.id, ot.id, 'accepted', 8.5, now() - interval '1 day', now()
FROM r, ot, l;

SELECT fn_cdc_quarterly_placement_snapshot();

SELECT count(*) AS snapshot_rows_for_test_placement
FROM cdc_placement_snapshots
WHERE placement_id IN (SELECT id FROM cdc_placements WHERE package_lpa = 8.5 AND offered_at IS NOT NULL ORDER BY created_at DESC LIMIT 1);

ROLLBACK;
SQL
)"
echo

echo "=== Verification complete ==="
echo "Expected:"
echo "  log_rows: 1 (overdue check found the synthetic drive)"
echo "  snapshot_rows_for_test_placement: 1 (snapshot captured the synthetic placement)"
echo "Both tests run in BEGIN/ROLLBACK — zero prod data leakage."
