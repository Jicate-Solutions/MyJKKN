#!/usr/bin/env bash
# ============================================================
# T2.1 (B3.3) — learners_profiles -> profiles mapping audit
# ============================================================
# READ-ONLY. Runs the 8 audit queries documented in
# docs/audit/learners-profiles-mapping-gap-2026-05-19.md
# and prints a numerical summary to stdout.
#
# Usage:
#   ./scripts/audit-learners-profiles-mapping.sh
#
# Requires: ~/.supabase/access-token, jq, curl
# Environment overrides:
#   PROJECT_REF       — Supabase project ref (default: kvizhngldtiuufknvehv)
#   TOKEN_FILE        — Path to access token (default: ~/.supabase/access-token)
# ============================================================

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-kvizhngldtiuufknvehv}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/.supabase/access-token}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "ERROR: Supabase access token not found at $TOKEN_FILE" >&2
  exit 1
fi

TOKEN="$(cat "$TOKEN_FILE")"
API_URL="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

run_query() {
  local label="$1"
  local sql="$2"
  echo ""
  echo "── ${label} ──"
  local payload
  payload="$(jq -nc --arg q "$sql" '{query:$q}')"
  curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload" | jq .
}

echo "============================================================"
echo " learners_profiles -> profiles mapping audit"
echo " Project: ${PROJECT_REF}"
echo " Date:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"

run_query "Q1 — Total learners_profiles" \
  "SELECT count(*) AS total_learners FROM learners_profiles;"

run_query "Q2 — Unmapped (no profiles row points at the learners_profiles.id)" \
  "SELECT count(*) AS unmapped FROM learners_profiles lp WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id = lp.id);"

run_query "Q3 — Unmapped by lifecycle_status" \
  "SELECT lifecycle_status, count(*) AS total, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id = learners_profiles.id)) AS unmapped FROM learners_profiles GROUP BY lifecycle_status ORDER BY total DESC;"

run_query "Q4 — Unmapped by institution" \
  "SELECT COALESCE(i.name, '(no institution)') AS institution, count(*) AS unmapped FROM learners_profiles lp LEFT JOIN institutions i ON i.id = lp.institution_id WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id = lp.id) GROUP BY i.name ORDER BY unmapped DESC;"

run_query "Q5 — Unmapped: email coverage" \
  "SELECT count(*) FILTER (WHERE college_email IS NOT NULL AND college_email <> '') AS has_college_email, count(*) FILTER (WHERE student_email IS NOT NULL AND student_email <> '') AS has_student_email, count(*) FILTER (WHERE (college_email IS NULL OR college_email = '') AND (student_email IS NULL OR student_email = '')) AS no_email_at_all FROM learners_profiles lp WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id = lp.id);"

run_query "Q6 — Unmapped by created_at year-month (recency)" \
  "SELECT EXTRACT(YEAR FROM lp.created_at) AS created_year, EXTRACT(MONTH FROM lp.created_at) AS created_month, count(*) AS unmapped FROM learners_profiles lp WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id = lp.id) GROUP BY created_year, created_month ORDER BY created_year DESC, created_month DESC LIMIT 24;"

run_query "Q7 — Orphan profiles (role='student' AND learner_id IS NULL) — the OPPOSITE bug class" \
  "SELECT count(*) AS orphan_student_profiles, count(*) FILTER (WHERE email IS NOT NULL AND email <> '') AS with_email, count(*) FILTER (WHERE last_login IS NOT NULL) AS ever_logged_in FROM profiles WHERE role = 'student' AND learner_id IS NULL;"

run_query "Q8 — Orphan student profiles by institution" \
  "SELECT COALESCE(i.name, '(no inst)') AS institution, count(*) AS orphan_student_profiles FROM profiles p LEFT JOIN institutions i ON i.id = p.institution_id WHERE p.role = 'student' AND p.learner_id IS NULL GROUP BY i.name ORDER BY orphan_student_profiles DESC;"

echo ""
echo "============================================================"
echo " Audit complete. See docs/audit/learners-profiles-mapping-gap-2026-05-19.md"
echo " for full analysis and recommendation matrix."
echo "============================================================"
