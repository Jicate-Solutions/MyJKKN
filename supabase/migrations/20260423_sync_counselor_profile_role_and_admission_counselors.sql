-- ================================================================================
-- Migration: Sync counselor profile.role + backfill admission_counselors
-- Date: 2026-04-23
-- Bug: Counselor-role users appear in the wrong legacy-role bucket
--   * `user_roles` has role_key='counselor' for 8 users, but
--   * `profiles.role` says 'student' (7) or 'faculty' (1)
--   * 3 of those 8 users are missing from `admission_counselors`
-- ================================================================================
-- Root cause (NOT a trigger bug):
--   The `sync_primary_role_to_profile()` trigger on `user_roles` only fires the
--   profiles.role update when NEW.is_primary = true. For these 8 users the
--   `student`/`faculty` role was assigned FIRST (with is_primary=true) and the
--   `counselor` role was added LATER as is_primary=false. The trigger correctly
--   did nothing. The fix is to promote `counselor` to primary (which cascades
--   through the existing trigger — no trigger/function changes needed).
--
--   Legacy readers of `profiles.role` (hooks/use-permissions.ts `isCounselorUser`
--   legacy fallback, supabase/setup/02_functions.sql rescue-broadcast targeting
--   at line ~6452, counselor-list.tsx at line 379) will now correctly identify
--   these 8 users as counselors.
-- ================================================================================
-- Idempotent (safe to re-run): all operations use WHERE guards / ON CONFLICT.
-- ================================================================================

BEGIN;

-- ==============================================================================
-- STEP 1: Promote counselor → primary in user_roles for the 8 users
-- ==============================================================================
-- Two-phase because of partial unique index `idx_user_roles_primary_unique`
-- on (user_id) WHERE is_primary = true:
--   1a. Demote the existing primary (student/faculty) row to is_primary=false
--   1b. Promote the counselor row to is_primary=true
-- The sync_primary_role_to_profile() AFTER trigger fires on step 1b and
-- updates profiles.role to 'counselor'. (Its internal "unset other primaries"
-- update finds none, which is fine — we pre-unset in 1a.)

-- 1a. Demote current primary (student/faculty) for the 8 users
UPDATE user_roles ur
SET is_primary = false
FROM profiles p, custom_roles cr
WHERE ur.user_id = p.id
  AND ur.role_id  = cr.id
  AND cr.role_key IN ('student', 'faculty')
  AND ur.is_primary = true
  AND p.email IN (
    'arivuindhraa.dp@jkkn.ac.in',
    'charuhasinir.dp@jkkn.ac.in',
    'charulathar.dp@jkkn.ac.in',
    'jeevavarshinis.dp@jkkn.ac.in',
    'sowmyad.dp@jkkn.ac.in',
    'sowndaryar.dp@jkkn.ac.in',
    'srinithis.dp@jkkn.ac.in',
    'test.faculty@jkkn.ac.in'
  );

-- 1b. Promote counselor to primary (fires the trigger → updates profiles.role)
UPDATE user_roles ur
SET is_primary = true
FROM profiles p, custom_roles cr
WHERE ur.user_id = p.id
  AND ur.role_id  = cr.id
  AND cr.role_key = 'counselor'
  AND ur.is_primary = false
  AND p.email IN (
    'arivuindhraa.dp@jkkn.ac.in',
    'charuhasinir.dp@jkkn.ac.in',
    'charulathar.dp@jkkn.ac.in',
    'jeevavarshinis.dp@jkkn.ac.in',
    'sowmyad.dp@jkkn.ac.in',
    'sowndaryar.dp@jkkn.ac.in',
    'srinithis.dp@jkkn.ac.in',
    'test.faculty@jkkn.ac.in'
  );

-- ==============================================================================
-- STEP 2: Register the 3 missing users in admission_counselors
-- ==============================================================================
-- Users already present (verified 2026-04-23):
--   charuhasinir, jeevavarshinis, sowmyad, sowndaryar, srinithis
-- Users missing, inserted here:
--   arivuindhraa.dp, charulathar.dp, test.faculty
--
-- Uses profile's institution_id + full_name; is_active=true; user_id FK points
-- at auth.users (all 8 verified to have auth.users rows).

INSERT INTO admission_counselors (
  user_id,
  institution_id,
  name,
  email,
  is_active,
  max_leads,
  current_leads,
  specializations,
  created_at,
  updated_at
)
SELECT
  p.id                                      AS user_id,
  p.institution_id                          AS institution_id,
  COALESCE(p.full_name, p.email)            AS name,
  p.email                                   AS email,
  true                                      AS is_active,
  100                                       AS max_leads,
  0                                         AS current_leads,
  ARRAY[]::text[]                           AS specializations,
  NOW()                                     AS created_at,
  NOW()                                     AS updated_at
FROM profiles p
WHERE p.email IN (
    'arivuindhraa.dp@jkkn.ac.in',
    'charulathar.dp@jkkn.ac.in',
    'test.faculty@jkkn.ac.in'
  )
  AND p.institution_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM admission_counselors ac
    WHERE ac.user_id = p.id OR ac.email = p.email
  );

COMMIT;

-- ==============================================================================
-- VERIFICATION (run manually after migration; not part of transaction)
-- ==============================================================================
-- Expected: 8 rows, all with profile_role='counselor' and has_counselor_record=true
--
--   SELECT p.email, p.role AS profile_role,
--          EXISTS(SELECT 1 FROM admission_counselors ac WHERE ac.user_id = p.id)
--            AS has_counselor_record
--   FROM profiles p
--   WHERE p.email IN (
--     'arivuindhraa.dp@jkkn.ac.in','charuhasinir.dp@jkkn.ac.in',
--     'charulathar.dp@jkkn.ac.in','jeevavarshinis.dp@jkkn.ac.in',
--     'sowmyad.dp@jkkn.ac.in','sowndaryar.dp@jkkn.ac.in',
--     'srinithis.dp@jkkn.ac.in','test.faculty@jkkn.ac.in'
--   )
--   ORDER BY p.email;
