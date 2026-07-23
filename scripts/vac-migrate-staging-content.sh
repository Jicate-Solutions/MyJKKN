#!/bin/bash
# =============================================================================
# VAC staging → prod content migration (Director-authorized 2026-06-12 via
# AskUserQuestion interview; decisions recorded in
# specs/vac-staging-fk-mapping-audit-2026-06-11.md).
#
# Pattern source: /sync-staging-from-prod skill (psql/pooler mechanism) +
# docs/features/value-added-courses/04-MIGRATION-GUIDE (schema already in
# parity — this is the "Step 6 seed export" that never ran).
#
# Decisions implemented:
#   1. EXCLUDE course BA-TAM-SF-MATLAB entirely (+30 lessons, +1 link)
#   2. DARK import: every copied course arrives is_active = false
#   3. Engineering remap: a1111111-… → 5de4fba1-… (9 courses)
#   4. Skip vac_enrollments + vac_learner_progress (test data)
#   5. Add UNIQUE(code) on prod vac_courses
#   6. Prod's BDS-CR-101 + 543 enrollments untouched
#   7. Idempotent: ON CONFLICT (id) DO NOTHING
# =============================================================================
set -euo pipefail
cd /Users/omm/PROJECTS/MyJKKN
set -a; source .env.staging; set +a
PROD_URL="postgresql://postgres.${PROD_DB_PROJECT_REF}:${PROD_DB_PASSWORD}@${PROD_DB_REGION}.pooler.supabase.com:5432/postgres"
STAG_URL="postgresql://postgres.${STAGING_DB_PROJECT_REF}:${STAGING_DB_PASSWORD}@${STAGING_DB_REGION}.pooler.supabase.com:5432/postgres"

WORK=/tmp/vac-migration-$(date +%s); mkdir -p "$WORK"

COURSE_COLS="id, code, name, description, institution, track, duration_hours, weeks, fee, is_active, created_at, updated_at, overall_finks_profile, ai_era_strategic_value, programme_id, institution_id, faculty_eligible, course_category, nsqf_level, nheqf_level, ncrf_credits, ncrf_credit_hours"
LESSON_COLS="id, course_id, week, hour, title, duration_minutes, prerequisites, toolboxes, learning_outcomes, faculty_script, student_content, exercises, gemini_prompts, error_troubleshooting, interview_questions, resources, self_check, is_published, created_at, updated_at, ltl_phase"
LINK_COLS="id, course_id, programme_id, is_primary, created_at"

echo "=== Phase 1: export transformed rows from STAGING (read-only) ==="
# NOTE: \copy folds SQL to one line — no inline comments allowed inside.
# Transforms: is_active=false (dark import) · Engineering UUID remap · BA-TAM excluded.
psql "$STAG_URL" -c "\copy (
  SELECT id, code, name, description, institution, track, duration_hours, weeks, fee,
         false AS is_active,
         created_at, updated_at, overall_finks_profile, ai_era_strategic_value, programme_id,
         CASE WHEN institution_id = 'a1111111-1111-1111-1111-111111111111'
              THEN '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
              ELSE institution_id END AS institution_id,
         faculty_eligible, course_category, nsqf_level, nheqf_level, ncrf_credits, ncrf_credit_hours
  FROM vac_courses
  WHERE code <> 'BA-TAM-SF-MATLAB'
) TO '$WORK/courses.csv' WITH (FORMAT csv)"

psql "$STAG_URL" -c "\copy (
  SELECT $LESSON_COLS FROM vac_lessons
  WHERE course_id NOT IN (SELECT id FROM vac_courses WHERE code = 'BA-TAM-SF-MATLAB')
) TO '$WORK/lessons.csv' WITH (FORMAT csv)"

psql "$STAG_URL" -c "\copy (
  SELECT $LINK_COLS FROM vac_course_programmes
  WHERE course_id NOT IN (SELECT id FROM vac_courses WHERE code = 'BA-TAM-SF-MATLAB')
) TO '$WORK/links.csv' WITH (FORMAT csv)"

wc -l "$WORK"/*.csv

echo ""
echo "=== Phase 2: load into PROD (single transaction, idempotent) ==="
psql "$PROD_URL" --set ON_ERROR_STOP=1 <<EOSQL
BEGIN;

CREATE TEMP TABLE _stage_courses (LIKE vac_courses INCLUDING DEFAULTS) ON COMMIT DROP;
ALTER TABLE _stage_courses DROP COLUMN IF EXISTS case_scenario; -- not applicable (courses) but harmless guard
\copy _stage_courses ($COURSE_COLS) FROM '$WORK/courses.csv' WITH (FORMAT csv)

-- prod vac_lessons has extra case_scenario (stays NULL for imports)
CREATE TEMP TABLE _stage_lessons (LIKE vac_lessons INCLUDING DEFAULTS) ON COMMIT DROP;
ALTER TABLE _stage_lessons DROP COLUMN IF EXISTS case_scenario;
\copy _stage_lessons ($LESSON_COLS) FROM '$WORK/lessons.csv' WITH (FORMAT csv)

CREATE TEMP TABLE _stage_links (LIKE vac_course_programmes INCLUDING DEFAULTS) ON COMMIT DROP;
\copy _stage_links ($LINK_COLS) FROM '$WORK/links.csv' WITH (FORMAT csv)

INSERT INTO vac_courses ($COURSE_COLS)
SELECT $COURSE_COLS FROM _stage_courses
ON CONFLICT (id) DO NOTHING;

INSERT INTO vac_lessons ($LESSON_COLS)
SELECT $LESSON_COLS FROM _stage_lessons
ON CONFLICT (id) DO NOTHING;

INSERT INTO vac_course_programmes ($LINK_COLS)
SELECT $LINK_COLS FROM _stage_links
ON CONFLICT (id) DO NOTHING;

-- decision 5: code-uniqueness parity with staging
CREATE UNIQUE INDEX IF NOT EXISTS vac_courses_code_key ON vac_courses (code);

COMMIT;

NOTIFY pgrst, 'reload schema';
EOSQL

echo ""
echo "=== Phase 3: verification (prod) ==="
psql "$PROD_URL" -tA <<'EOSQL'
SELECT 'courses total:          ' || count(*) FROM vac_courses;
SELECT 'lessons total:          ' || count(*) FROM vac_lessons;
SELECT 'links total:            ' || count(*) FROM vac_course_programmes;
SELECT 'imported active (must=0): ' || count(*) FROM vac_courses WHERE is_active AND code <> 'BDS-CR-101';
SELECT 'BDS-CR-101 active:      ' || is_active FROM vac_courses WHERE code = 'BDS-CR-101';
SELECT 'BDS enrollments (=543): ' || count(*) FROM vac_enrollments;
SELECT 'orphan course→institution (must=0): ' || count(*) FROM vac_courses c LEFT JOIN institutions i ON i.id=c.institution_id WHERE c.institution_id IS NOT NULL AND i.id IS NULL;
SELECT 'orphan course→programme (must=0):  ' || count(*) FROM vac_courses c LEFT JOIN programs p ON p.id=c.programme_id WHERE c.programme_id IS NOT NULL AND p.id IS NULL;
SELECT 'orphan lesson→course (must=0):     ' || count(*) FROM vac_lessons l LEFT JOIN vac_courses c ON c.id=l.course_id WHERE c.id IS NULL;
SELECT 'orphan link→programme (must=0):    ' || count(*) FROM vac_course_programmes k LEFT JOIN programs p ON p.id=k.programme_id WHERE p.id IS NULL;
SELECT 'engineering courses remapped (=9): ' || count(*) FROM vac_courses WHERE institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843';
SELECT 'universal (NULL inst) courses (=6): ' || count(*) FROM vac_courses WHERE institution_id IS NULL AND code <> 'BDS-CR-101';
SELECT 'BA-TAM excluded (must=0):          ' || count(*) FROM vac_courses WHERE code = 'BA-TAM-SF-MATLAB';
SELECT 'unique(code) index: ' || count(*) FROM pg_indexes WHERE tablename='vac_courses' AND indexname='vac_courses_code_key';
EOSQL

rm -rf "$WORK"
echo "DONE — work files cleaned"
