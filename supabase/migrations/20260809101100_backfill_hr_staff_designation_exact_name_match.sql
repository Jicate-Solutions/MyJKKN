-- ============================================================================
-- 20260809101100 — sort job titles into the four groups JKKN already has
--
-- ✅ APPLIED TO PRODUCTION 2026-08-04 under Director authorisation.
--    Rehearsed in BEGIN..ROLLBACK first; residue verified 0 in a separate call.
--    Result matched the rehearsal exactly: hr_staff_details 543 → 583 rows
--    (40 INSERT + 274 UPDATE), designation_id and cadre_id set on 314.
--    Cadres populated: Teaching 284 · Supporting (Technical) 20 ·
--    Non-Technical 9 · Administrative 1. 543 people remain for a human to
--    sort on /hr/admin/designation-mapping, which is the point of this PR.
--
-- WHY THIS ADDS NO COLUMN
-- -----------------------
-- The build order asked for `staff.designation_id uuid NULL REFERENCES
-- hr_designations(id)`. That column must NOT be created, because the link it
-- describes already exists:
--
--   hr_staff_details.designation_id  uuid NULL
--     CONSTRAINT hr_staff_details_designation_id_fkey
--       FOREIGN KEY (designation_id) REFERENCES hr_designations(id) ON DELETE SET NULL
--   hr_staff_details.cadre_id        uuid NULL
--     CONSTRAINT hr_staff_details_cadre_id_fkey
--       FOREIGN KEY (cadre_id) REFERENCES hr_cadres(id) ON DELETE SET NULL
--
-- Verified live 2026-08-03 against kvizhngldtiuufknvehv. Both columns are
-- nullable, both are already read by `lib/services/hr/payroll/payslip-generator.ts`
-- (merged PR #2664, 2026-07-30) and by `lib/services/hr/employee-service.ts`,
-- which filters on `hr_staff_details.designation_id` and
-- `hr_staff_details.cadre_id` today.
--
-- Adding `staff.designation_id` would put the same fact in two places, one of
-- which production code already reads — a second vocabulary beside a correct
-- one, which is exactly what this work was told not to do. PR #2664 exists
-- *because* payroll previously selected `designation_id` from `staff`, where it
-- does not exist, and died with 42703 for every caller. This migration
-- therefore only fills the existing column in.
--
-- WHAT IT DOES
-- ------------
-- Links each team member to a designation ONLY where the free text in
-- `staff.designation` equals a designation name exactly, case-insensitively,
-- inside the same institution. Verified live 2026-08-03: this resolves
-- 314 of 857 for free — 274 by UPDATE (an hr_staff_details row already exists)
-- and 40 by INSERT (no row yet). 543 of 857 have an hr_staff_details row;
-- designation_id is set on 0 of them today.
--
-- It must NOT fuzzy-match, prefix-match or guess. 'Assistant Professor' and
-- 'Associate Professor' are one character apart in spelling and worlds apart
-- in meaning; 'Assistant Professor' is a prefix of 'Assistant Professor &
-- Head', a different job held by 12 people. Everything unmatched is left NULL
-- so it reads as unsorted, and a human sorts it on
-- /hr/admin/designation-mapping.
--
-- WHAT IT DOES NOT DO
-- -------------------
-- * Creates no table, column, type, enum or function. No SECURITY DEFINER
--   function is created or replaced here, so there is no EXECUTE grant to
--   revoke.
-- * Never overwrites a designation somebody already chose — the ON CONFLICT
--   branch fires only where `designation_id IS NULL`.
-- * Does not touch `staff.role_type` or `staff.employment_type`. Both are
--   uniform across all 857 rows today (`role_type='teacher'`,
--   `employment_type='full_time'`), and rewriting them from a partial mapping
--   would replace one wrong answer with a differently wrong one. The cadre
--   link is the source of truth from here; those columns are a separate,
--   Director-gated decision.
-- ============================================================================

WITH candidate AS (
    SELECT
        s.id                       AS staff_id,
        o.id                       AS hr_organization_id,
        d.id                       AS designation_id,
        d.cadre_id                 AS cadre_id,
        -- A title that resolves to more than one designation is ambiguous, and
        -- an ambiguous match is not a match. This also keeps the INSERT below
        -- from touching the same staff_id twice, which ON CONFLICT cannot do
        -- (cardinality_violation 21000). Live today: 0 duplicate designation
        -- names per organisation, so this drops nothing — it is the guard that
        -- keeps the migration correct if a duplicate is ever added.
        count(*) OVER (PARTITION BY s.id) AS match_count
    FROM public.staff s
    JOIN public.hr_organizations o
      ON o.institution_id = s.institution_id
    JOIN public.hr_designations d
      ON d.hr_organization_id = o.id
     AND btrim(lower(d.name)) = btrim(lower(s.designation))
    WHERE d.is_active
)
INSERT INTO public.hr_staff_details (
    staff_id, hr_organization_id, designation_id, cadre_id
)
SELECT c.staff_id, c.hr_organization_id, c.designation_id, c.cadre_id
FROM candidate c
WHERE c.match_count = 1
ON CONFLICT (staff_id) DO UPDATE
   SET designation_id = EXCLUDED.designation_id,
       cadre_id       = EXCLUDED.cadre_id,
       updated_at     = now()
 WHERE public.hr_staff_details.designation_id IS NULL;
