#!/usr/bin/env bash
# ============================================================
# C1 — CDC drive 7-state machine E2E verification harness
# ============================================================
# Walks a synthetic drive through all 8 state transitions and
# inspects the notifications produced by trg_cdc_drive_notifications.
#
# All writes are wrapped in BEGIN/ROLLBACK — zero prod data leakage.
#
# Usage:
#   ./scripts/cdc-drive-e2e-test.sh
#
# Requires: ~/.supabase/access-token, jq, curl
# ============================================================

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-kvizhngldtiuufknvehv}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/.supabase/access-token}"
TEST_PROGRAM_ID="${TEST_PROGRAM_ID:-0d980d34-f945-4de6-8c88-ee97b2620b99}"

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

echo "=== Verify trigger live ==="
run_sql "SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_cdc_drive_notifications';"
echo

echo "=== Test 1: 7-state forward walk (draft → ... → closed) ==="
run_sql "$(cat <<SQL
BEGIN;
CREATE TEMP TABLE _c1_drive_id (id uuid);
DO \$\$
DECLARE v_drive_id uuid; v_recruiter_id uuid; v_dt_id uuid; v_learner_id uuid; v_actor uuid;
BEGIN
  SELECT id INTO v_actor FROM profiles WHERE role = 'super_admin' LIMIT 1;
  INSERT INTO cdc_recruiters (name) VALUES ('C1-e2e-DELETEME') RETURNING id INTO v_recruiter_id;
  SELECT id INTO v_dt_id FROM cdc_drive_types LIMIT 1;
  INSERT INTO cdc_drives (recruiter_id, drive_type_id, title, status, institutions, created_by, updated_by)
    VALUES (v_recruiter_id, v_dt_id, 'C1-e2e-DELETEME', 'draft', '{}'::uuid[], v_actor, v_actor)
    RETURNING id INTO v_drive_id;
  INSERT INTO _c1_drive_id VALUES (v_drive_id);
  INSERT INTO cdc_drive_eligibility (drive_id, program_ids, passed_out_allowed)
    VALUES (v_drive_id, ARRAY['${TEST_PROGRAM_ID}']::uuid[], false);

  UPDATE cdc_drives SET status='announced', updated_by=v_actor WHERE id=v_drive_id;
  UPDATE cdc_drives SET status='willingness_open', willingness_window_open_at=now(), updated_by=v_actor WHERE id=v_drive_id;
  SELECT id INTO v_learner_id FROM learners_profiles WHERE program_id='${TEST_PROGRAM_ID}' LIMIT 1;
  INSERT INTO cdc_drive_willingness (drive_id, learner_id, status, eligibility_snapshot, declared_at, willingness_audit)
    VALUES (v_drive_id, v_learner_id, 'willing', '{}'::jsonb, now(), '[]'::jsonb);
  UPDATE cdc_drives SET status='eligibility_locked', updated_by=v_actor WHERE id=v_drive_id;
  UPDATE cdc_drives SET status='attendance_day', updated_by=v_actor WHERE id=v_drive_id;
  UPDATE cdc_drives SET status='results_announced', updated_by=v_actor WHERE id=v_drive_id;
  UPDATE cdc_drives SET status='closed', updated_by=v_actor WHERE id=v_drive_id;
END \$\$;

SELECT category, count(*) AS rows_inserted, (metadata->>'recipient_count')::int AS recipients
FROM notifications n, _c1_drive_id d
WHERE n.idempotency_key LIKE 'cdc.drive.' || d.id::text || '.%'
GROUP BY category, metadata
ORDER BY category;

ROLLBACK;
SQL
)"
echo

echo "=== Test 2: Cancellation transition ==="
run_sql "$(cat <<SQL
BEGIN;
CREATE TEMP TABLE _c1_drive_id (id uuid);
DO \$\$
DECLARE v_drive_id uuid; v_recruiter_id uuid; v_dt_id uuid; v_learner_id uuid; v_actor uuid;
BEGIN
  SELECT id INTO v_actor FROM profiles WHERE role = 'super_admin' LIMIT 1;
  INSERT INTO cdc_recruiters (name) VALUES ('C1-cancel-DELETEME') RETURNING id INTO v_recruiter_id;
  SELECT id INTO v_dt_id FROM cdc_drive_types LIMIT 1;
  INSERT INTO cdc_drives (recruiter_id, drive_type_id, title, status, institutions, created_by, updated_by)
    VALUES (v_recruiter_id, v_dt_id, 'C1-cancel-DELETEME', 'willingness_open', '{}'::uuid[], v_actor, v_actor)
    RETURNING id INTO v_drive_id;
  INSERT INTO _c1_drive_id VALUES (v_drive_id);
  SELECT id INTO v_learner_id FROM learners_profiles WHERE program_id='${TEST_PROGRAM_ID}' LIMIT 1;
  INSERT INTO cdc_drive_willingness (drive_id, learner_id, status, eligibility_snapshot, declared_at, willingness_audit)
    VALUES (v_drive_id, v_learner_id, 'willing', '{}'::jsonb, now(), '[]'::jsonb);
  UPDATE cdc_drives SET status='cancelled', cancelled_at=now(), updated_by=v_actor WHERE id=v_drive_id;
END \$\$;

SELECT category, count(*) AS rows_inserted, (metadata->>'recipient_count')::int AS recipients
FROM notifications n, _c1_drive_id d
WHERE n.idempotency_key LIKE 'cdc.drive.' || d.id::text || '.cancelled%'
GROUP BY category, metadata;
ROLLBACK;
SQL
)"
echo
echo "=== Verification complete ==="
echo "Expected: willingness_open (~580 recipients), results_announced (1), cancelled (1)"
echo "5 other transitions silently no-op as designed (no cdc_head/cdc_coordinator users yet)."
