-- ================================================================================
-- Migration: Re-sync counselor identity after reverter regression
-- Date: 2026-04-27
-- Bug: Some unknown change between 2026-04-23 (Agent A's original sync) and now
--   reverted the state for the same 8 counselor users that PR #20260423 fixed.
--
-- Regressed state observed 2026-04-27 (verified via Supabase MCP):
--   * jeevavarshinis.dp@jkkn.ac.in -> profiles.role='student' (should be 'counselor')
--                                      user_roles.is_primary=false on counselor row
--                                      (student row is_primary=true again)
--   * 4 users -> admission_counselors.is_active=false (should be true):
--       charuhasinir.dp, sowmyad.dp, sowndaryar.dp, srinithis.dp
--   * 3 users -> NO admission_counselors row at all (should have one):
--       arivuindhraa.dp, charulathar.dp, test.faculty
--
-- Note: 7 of 8 users currently have profiles.role='counselor' and is_primary=true
--   on the counselor user_roles entry — only jeevavarshinis regressed on profile.role.
--   The migration is still written to be SAFE for the full set of 8: all UPDATEs
--   are guarded with WHERE clauses and no-ops when state is already correct.
--
-- Sibling agents (parallel investigation):
--   * Agent D — finding the root-cause reverter (DO NOT touch sync_primary_role_to_profile)
--   * Agent F — counselor-id hardening (telephony service)
-- ================================================================================
-- Idempotent (safe to re-run): all operations use WHERE guards / NOT EXISTS.
-- Same two-phase pattern as Agent A's 20260423 migration to satisfy the
-- partial unique index `idx_user_roles_primary_unique` on (user_id) WHERE is_primary.
-- ================================================================================

BEGIN;

-- ==============================================================================
-- STEP 1: Promote counselor -> primary in user_roles for the 8 users
-- ==============================================================================
-- Two-phase guarded by partial unique index `idx_user_roles_primary_unique`
-- on (user_id) WHERE is_primary = true:
--   1a. Demote any existing primary (student/faculty) row -> is_primary=false
--   1b. Promote the counselor row -> is_primary=true
-- The sync_primary_role_to_profile() AFTER trigger fires on step 1b and
-- updates profiles.role to 'counselor'. WHERE-guards make both steps no-op
-- if state is already correct (idempotent).

-- 1a. Demote current primary (student/faculty) for the 8 users (idempotent)
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

-- 1b. Promote counselor to primary (idempotent — fires trigger -> profiles.role='counselor')
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
-- STEP 2: Reactivate admission_counselors rows that were flipped to is_active=false
-- ==============================================================================
-- Idempotent: WHERE is_active = false guards re-runs.
UPDATE admission_counselors ac
SET is_active = true,
    updated_at = NOW()
FROM profiles p
WHERE ac.user_id = p.id
  AND ac.is_active = false
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
-- STEP 3: Insert admission_counselors row for any of the 8 users missing one
-- ==============================================================================
-- Uses NOT EXISTS for idempotency (no unique constraint on user_id; only on email).
-- Guards against both user_id duplicates and email duplicates so re-running is safe.
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
    'charuhasinir.dp@jkkn.ac.in',
    'charulathar.dp@jkkn.ac.in',
    'jeevavarshinis.dp@jkkn.ac.in',
    'sowmyad.dp@jkkn.ac.in',
    'sowndaryar.dp@jkkn.ac.in',
    'srinithis.dp@jkkn.ac.in',
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
-- Expected: 8 rows, profile_role='counselor', counselor_is_primary=true,
--           ac_is_active=true, has_ac_row=true.
--
--   SELECT p.email,
--          p.role AS profile_role,
--          ur.is_primary AS counselor_is_primary,
--          ac.is_active AS ac_is_active,
--          ac.user_id IS NOT NULL AS has_ac_row
--   FROM profiles p
--   LEFT JOIN user_roles ur ON ur.user_id = p.id
--   LEFT JOIN custom_roles cr ON cr.id = ur.role_id AND cr.role_key='counselor'
--   LEFT JOIN admission_counselors ac ON ac.user_id = p.id
--   WHERE p.email IN (
--     'arivuindhraa.dp@jkkn.ac.in','charuhasinir.dp@jkkn.ac.in',
--     'charulathar.dp@jkkn.ac.in','jeevavarshinis.dp@jkkn.ac.in',
--     'sowmyad.dp@jkkn.ac.in','sowndaryar.dp@jkkn.ac.in',
--     'srinithis.dp@jkkn.ac.in','test.faculty@jkkn.ac.in'
--   )
--     AND cr.role_key='counselor'
--   ORDER BY p.email;
