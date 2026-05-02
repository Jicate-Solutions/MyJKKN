-- ============================================================================
-- 20260502_phase7b_backfill_junctions_for_renamed_admission_counselors.sql
-- ============================================================================
--
-- Phase 7b — completes Phase 7 seed for the 36 admission_counselors that
-- became invisible to the routing engine after the 2026-04-30 taxonomy rename
-- (`counselor` → `admission_counselor`, see 20260430_counselor_taxonomy_phase3_rename_and_expo.sql).
--
-- Empirical receipt (probe 2026-05-02 07:30 IST via Supabase MCP):
--   - 40 active rows in admission_counselors with role_key='admission_counselor'
--   - But admission_counselor_institutions had only 4 mappings (Phase 7 seed)
--   - Result: 65.46% of all leads unassigned (10,224/15,618)
--   - Locked metric (Locked-Initiatives.md → admission-counselors-quickwins):
--       baseline 89% → threshold <30% by 2026-08-01 → kill if >50%
--   - Day-5 reading was already in MISS-KILL territory; staying there until
--     fixed because Tier 1+2 of fn_auto_assign_counselor_v2 require junction
--     mappings + on-duty schedule and most institutions had neither.
--
-- Idempotent: ON CONFLICT DO NOTHING + NOT EXISTS guards throughout.
-- Reversible: additive only — TRUNCATE the new rows to revert.
-- Does NOT modify functions, UI, or master rows — only seeds junctions.
--
-- Already applied via Supabase MCP apply_migration on 2026-05-02 07:38 IST.
-- This file is the git-tracked record of that DDL change.
--
-- Net effect (verified 2026-05-02 07:39 IST):
--   admission_counselor_institutions:  4 →  44 (+40)
--   admission_counselor_schedules:    28 → 308 (+280, 40 counselors × 7 days)
--   admission_counselor_sources:      48 → 880 (+832, 40 counselors × 22 sources)
-- ============================================================================

-- A. Institution junction
INSERT INTO admission_counselor_institutions (counselor_id, institution_id, created_by)
SELECT DISTINCT ac.id, ac.institution_id, NULL::uuid
FROM admission_counselors ac
WHERE ac.is_active = TRUE
  AND ac.institution_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = ac.user_id
      AND cr.role_key IN ('counselor', 'admission_counselor', 'expo_counselor')
  )
ON CONFLICT (counselor_id, institution_id) DO NOTHING;

-- B. Schedule (default 7-day on-duty Mon-Sun, effective from today, open-ended)
INSERT INTO admission_counselor_schedules (counselor_id, day_of_week, is_working, effective_from, effective_to, created_by)
SELECT DISTINCT ac.id, dow, TRUE, CURRENT_DATE, NULL::date, NULL::uuid
FROM admission_counselors ac
CROSS JOIN generate_series(0, 6) AS dow
WHERE ac.is_active = TRUE
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = ac.user_id
      AND cr.role_key IN ('counselor', 'admission_counselor', 'expo_counselor')
  )
  AND NOT EXISTS (
    SELECT 1 FROM admission_counselor_schedules s
    WHERE s.counselor_id = ac.id AND s.day_of_week = dow
  );

-- C. Source junction (all active master sources × all active admission counselors)
INSERT INTO admission_counselor_sources (counselor_id, source_id, created_by)
SELECT DISTINCT ac.id, alsm.id, NULL::uuid
FROM admission_counselors ac
CROSS JOIN admission_lead_sources_master alsm
WHERE ac.is_active = TRUE
  AND alsm.is_active = TRUE
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = ac.user_id
      AND cr.role_key IN ('counselor', 'admission_counselor', 'expo_counselor')
  )
ON CONFLICT (counselor_id, source_id) DO NOTHING;
