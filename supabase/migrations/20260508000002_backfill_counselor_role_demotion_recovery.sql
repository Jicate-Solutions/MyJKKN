-- =====================================================================
-- Counselor Taxonomy Phase 3.2 — DATA BACKFILL: restore primary roles
-- Date: 2026-05-08
-- Companion to: 20260508000001_assign_counselor_role_v3_preserve_primary.sql
--
-- Purpose
-- -------
-- The previous assign_counselor_role default (p_is_primary=true) caused
-- every counselor assignment to demote the user's existing primary role
-- and mirror the counselor key into profiles.role via the AFTER-INSERT
-- trigger sync_primary_role_to_profile(). This migration finds users
-- whose profiles.role is currently a counselor key but who ALSO carry a
-- non-counselor user_roles entry, and restores their original primary
-- identity.
--
-- Restoration priority (highest to lowest):
--   1.  hod
--   2.  coe_office       <- elevated above faculty per ops review (2026-05-08)
--   3.  faculty
--   4.  admission_staff
--   5.  staff
--   6.  admission
--   7.  student
--   8.  guest
--   99. anything else
--
-- Excluded from this backfill:
--   - 65618434-70bd-4453-a171-f0e13f571bd4  (Test Faculty / QA account)
--
-- Side effects
-- ------------
-- The sync_primary_role_to_profile() trigger (v2, last replaced in
-- 20260430_counselor_taxonomy_phase3_rename_and_expo.sql) fires on the
-- promote step and:
--   - Mirrors profiles.role to the new primary key
--   - Writes a `counselor_demotion_warned` row to role_audit_log for
--     each affected user, providing an audit trail of this backfill
--
-- Sequencing note
-- ---------------
-- The partial unique index idx_user_roles_primary_unique (user_id WHERE
-- is_primary=true) requires we DEMOTE the counselor row before
-- PROMOTING the target row. Three sequential statements achieve this
-- atomically inside a single transaction; multi-CTE updates would risk
-- a transient two-primary state.
--
-- Idempotent
-- ----------
-- Re-running this migration is a no-op: the affected-set query only
-- returns users whose profiles.role is still a counselor key, so once
-- their profiles.role has been restored, they no longer match.
-- =====================================================================

BEGIN;

-- 1. Snapshot the affected cohort with priority-resolved target role
CREATE TEMP TABLE _backfill_plan ON COMMIT DROP AS
WITH affected AS (
  SELECT
    p.id                      AS user_id,
    p.role                    AS profiles_role_now,
    array_agg(DISTINCT cr.role_key) FILTER (
      WHERE cr.role_key NOT IN (
        'admission_counselor','expo_counselor','learner_counselor',
        'staff_counselor','health_counselor'
      )
    ) AS non_counselor_roles
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id
  JOIN custom_roles cr ON cr.id = ur.role_id
  WHERE p.role IN (
    'admission_counselor','expo_counselor','learner_counselor',
    'staff_counselor','health_counselor'
  )
    AND p.id != '65618434-70bd-4453-a171-f0e13f571bd4'::uuid  -- Test Faculty
  GROUP BY p.id, p.role
  HAVING EXISTS (
    SELECT 1
    FROM user_roles ur2
    JOIN custom_roles cr2 ON cr2.id = ur2.role_id
    WHERE ur2.user_id = p.id
      AND cr2.role_key NOT IN (
        'admission_counselor','expo_counselor','learner_counselor',
        'staff_counselor','health_counselor'
      )
  )
),
planned AS (
  SELECT
    a.user_id,
    a.profiles_role_now,
    (
      SELECT k
      FROM unnest(a.non_counselor_roles) AS k
      ORDER BY CASE k
        WHEN 'hod'             THEN 1
        WHEN 'coe_office'      THEN 2
        WHEN 'faculty'         THEN 3
        WHEN 'admission_staff' THEN 4
        WHEN 'staff'           THEN 5
        WHEN 'admission'       THEN 6
        WHEN 'student'         THEN 7
        WHEN 'guest'           THEN 8
        ELSE 99
      END
      LIMIT 1
    ) AS planned_new_primary_role_key
  FROM affected a
)
SELECT user_id, profiles_role_now, planned_new_primary_role_key
FROM planned
WHERE planned_new_primary_role_key IS NOT NULL;

-- 2. DEMOTE: clear is_primary on counselor rows for affected users.
--    Must run before the promote step to avoid a transient two-primary
--    state that would violate idx_user_roles_primary_unique.
UPDATE user_roles ur
   SET is_primary = false
  FROM _backfill_plan bp,
       custom_roles cr
 WHERE ur.user_id = bp.user_id
   AND ur.role_id = cr.id
   AND cr.role_key IN (
     'admission_counselor','expo_counselor','learner_counselor',
     'staff_counselor','health_counselor'
   )
   AND ur.is_primary = true;

-- 3. PROMOTE: set is_primary=true on the planned target row.
--    sync_primary_role_to_profile() trigger fires here and:
--      - Mirrors profiles.role to the new primary key
--      - Writes counselor_demotion_warned to role_audit_log
UPDATE user_roles ur
   SET is_primary = true
  FROM _backfill_plan bp,
       custom_roles cr
 WHERE ur.user_id = bp.user_id
   AND ur.role_id = cr.id
   AND cr.role_key = bp.planned_new_primary_role_key;

-- 4. DEFENSIVE: ensure profiles.role matches the new primary even if the
--    trigger was somehow skipped. Idempotent — the trigger's UPDATE in
--    step 3 already did this, so this is a no-op in the happy path.
UPDATE profiles p
   SET role = bp.planned_new_primary_role_key,
       updated_at = NOW()
  FROM _backfill_plan bp
 WHERE p.id = bp.user_id;

COMMIT;

-- =====================================================================
-- Verification (run manually after applying):
--
--   SELECT COUNT(*)
--   FROM profiles p
--   WHERE p.role IN ('admission_counselor','expo_counselor',
--                    'learner_counselor','staff_counselor','health_counselor')
--     AND p.id != '65618434-70bd-4453-a171-f0e13f571bd4'::uuid
--     AND EXISTS (
--       SELECT 1 FROM user_roles ur
--       JOIN custom_roles cr ON cr.id = ur.role_id
--       WHERE ur.user_id = p.id
--         AND cr.role_key NOT IN ('admission_counselor','expo_counselor',
--                                 'learner_counselor','staff_counselor',
--                                 'health_counselor')
--     );
--
-- Expected: 0
-- =====================================================================
