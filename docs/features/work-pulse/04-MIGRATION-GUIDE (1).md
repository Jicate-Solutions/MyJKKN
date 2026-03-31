# Work Pulse — Migration Guide

## Migration Order (MUST be sequential)

```
1. 20260330000001_wp_pulse_entries.sql     ← Base table, no dependencies
2. 20260330000002_wp_patterns.sql          ← Creates 4 enum types + patterns table
3. 20260330000003_wp_micro_interviews_and_impact.sql  ← References wp_patterns (FK)
4. 20260330000004_wp_rls_and_constraints_fixes.sql    ← Drops/adds policies on all tables
```

**Do NOT run out of order.** Migration 3 has FK to wp_patterns (created in migration 2). Migration 4 references policies created in migrations 1-3.

## Migration 1: wp_pulse_entries

**Creates:**
- Table `wp_pulse_entries` (14 columns)
- RLS enabled
- 3 policies: insert_own, select_own, select_department
- 4 indexes: user_week, institution_week, talent_category, repetition_category
- UNIQUE constraint on (user_id, week_of)

**CHECK constraints:**
- `talent_waste_description`: min 10 chars
- `repetition_description`: min 10 chars

## Migration 2: wp_patterns

**Creates:**
- 4 enum types: wp_pattern_source, wp_solution_type, wp_pattern_tier, wp_pattern_status
- Table `wp_patterns` (20 columns)
- RLS enabled
- 3 policies: read_all, admin_write, service_write
- 3 indexes: tier_score, status, solution

**Note:** feasibility_score has CHECK constraint (1-10 range).

## Migration 3: wp_micro_interviews + wp_agent_impact

**Creates:**
- Table `wp_micro_interviews` (10 columns) — FK to wp_patterns and profiles
- Table `wp_agent_impact` (13 columns) — FK to wp_patterns
- RLS on both tables
- 3 policies on micro_interviews: select_own, update_own, service_write
- 2 policies on agent_impact: read_all, admin_write
- 3 indexes: micro_user, micro_pattern, impact_pattern

**Note:** `hours_saved_weekly` in wp_agent_impact is a GENERATED ALWAYS AS STORED column.

## Migration 4: RLS Fixes (Post-Audit)

**This migration fixes security issues found during audit. Apply AFTER migrations 1-3.**

**Drops:**
- `wp_pulse_entries_select_department` — was exposing individual entries to HOD/admin (privacy violation)

**Creates:**
- `wp_pulse_entries_service_read` — service_role can SELECT (for AI pipeline)
- `wp_pulse_entries_service_update` — service_role can UPDATE (for translation _en columns)
- `wp_impact_service_write` — service_role can ALL on wp_agent_impact

**Creates function + trigger:**
- `wp_enforce_micro_interview_monthly_limit()` — prevents >1 micro-interview per user per calendar month
- `trg_wp_micro_interview_monthly_limit` — BEFORE INSERT trigger on wp_micro_interviews

**Uses IF EXISTS/IF NOT EXISTS guards** — safe to re-run.

## How to Apply

### Option A: Supabase CLI (if migration history is clean)
```bash
supabase db push --project-ref <PROD_REF>
```

### Option B: Management API (if history is diverged)
```bash
ACCESS_TOKEN=$(cat ~/.supabase/access-token)
for file in 20260330000001_wp_pulse_entries.sql 20260330000002_wp_patterns.sql 20260330000003_wp_micro_interviews_and_impact.sql 20260330000004_wp_rls_and_constraints_fixes.sql; do
  SQL=$(cat "supabase/migrations/$file")
  curl -s -X POST "https://api.supabase.com/v1/projects/<PROD_REF>/database/query" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg q "$SQL" '{query: $q}')"
  echo " → $file applied"
done
```

### Option C: Supabase Dashboard
Copy-paste each migration file into the SQL Editor in order.

## Post-Migration Verification

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'wp_%'
ORDER BY table_name;
-- Expected: wp_agent_impact, wp_micro_interviews, wp_patterns, wp_pulse_entries

-- Verify enum types
SELECT typname FROM pg_type WHERE typname LIKE 'wp_%' ORDER BY typname;
-- Expected: 4 enum types + 4 composite types (table row types)

-- Verify RLS policies
SELECT tablename, policyname FROM pg_policies
WHERE tablename LIKE 'wp_%' ORDER BY tablename, policyname;
-- Expected: 13 policies

-- Verify trigger
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table LIKE 'wp_%';
-- Expected: trg_wp_micro_interview_monthly_limit

-- Verify indexes
SELECT indexname FROM pg_indexes
WHERE tablename LIKE 'wp_%' AND schemaname='public'
ORDER BY indexname;
-- Expected: 15 indexes (including PKs)
```

## Rollback (Emergency)

```sql
-- WARNING: This drops ALL Work Pulse data permanently
DROP TABLE IF EXISTS wp_agent_impact CASCADE;
DROP TABLE IF EXISTS wp_micro_interviews CASCADE;
DROP TABLE IF EXISTS wp_patterns CASCADE;
DROP TABLE IF EXISTS wp_pulse_entries CASCADE;
DROP TYPE IF EXISTS wp_pattern_source CASCADE;
DROP TYPE IF EXISTS wp_solution_type CASCADE;
DROP TYPE IF EXISTS wp_pattern_tier CASCADE;
DROP TYPE IF EXISTS wp_pattern_status CASCADE;
DROP FUNCTION IF EXISTS wp_enforce_micro_interview_monthly_limit() CASCADE;
```
