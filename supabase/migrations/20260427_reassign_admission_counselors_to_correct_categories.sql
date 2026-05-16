-- ============================================================================
-- Reassign 14 'counselor' role users to correct counselor categories
-- ============================================================================
--
-- Spec: specs/admission-counselor-rules-engine-spec.md (Phase 1, Decision #2)
-- PR:   #537 (spec sign-off) — this migration is Phase 1
-- Date: 2026-04-27
-- Author: Director's reassignment via /myjkkn-chain assumption-thrash
--
-- Background:
--   PR #528 added 3 new system roles (learner_counselor, staff_counselor, +
--   updated health_counselor description). At that time 14 users were assigned
--   role_key='counselor' (Admission Counsellor):
--     - 4 users genuinely in admission cell (admission/admission_staff/eao/coo) → KEEP
--     - 9 student peer counselors (Pharmacy 7 + Nursing 2)              → MOVE to learner_counselor
--     - 1 faculty test account (test.faculty)                           → MOVE to staff_counselor
--
-- Holder-based semantic per Decision #1 (locked 2026-04-27 via /interview).
--
-- Idempotent: ON CONFLICT DO NOTHING + WHERE-clause guards. Re-running = no-op.
-- Reversible: explicit reverse migration in this file's footer comment block.
-- ============================================================================

DO $migration$
DECLARE
  v_learner_counselor_id UUID;
  v_staff_counselor_id   UUID;
  v_counselor_id         UUID;
  v_moved_to_learner     INT;
  v_moved_to_staff       INT;
  v_remaining_counselor  INT;
BEGIN
  -- Resolve role IDs (assert they exist — fail fast if PR #528 didn't land)
  SELECT id INTO v_learner_counselor_id FROM custom_roles WHERE role_key='learner_counselor';
  SELECT id INTO v_staff_counselor_id   FROM custom_roles WHERE role_key='staff_counselor';
  SELECT id INTO v_counselor_id         FROM custom_roles WHERE role_key='counselor';

  IF v_learner_counselor_id IS NULL OR v_staff_counselor_id IS NULL OR v_counselor_id IS NULL THEN
    RAISE EXCEPTION 'Required counselor roles not found. Did PR #528 (counselor-taxonomy-phase1) land? Run: SELECT role_key FROM custom_roles WHERE role_key IN (...)';
  END IF;

  -- ============================================================================
  -- 1. Move 9 student peer counselors → learner_counselor
  -- ============================================================================
  -- Discriminator: also has role_key='student' in user_roles. This excludes
  -- test.faculty (whose other role is 'faculty', not 'student').
  -- ============================================================================

  -- user_roles columns: id, user_id, role_id, is_primary, assigned_at, assigned_by
  -- is_primary=FALSE on the new role since profiles.role acts as legacy primary marker
  INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
  SELECT DISTINCT ur.user_id, v_learner_counselor_id, FALSE, now()
  FROM user_roles ur
  WHERE ur.role_id = v_counselor_id
    AND EXISTS (
      SELECT 1 FROM user_roles ur2
      JOIN custom_roles cr2 ON cr2.id = ur2.role_id
      WHERE ur2.user_id = ur.user_id AND cr2.role_key = 'student'
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_moved_to_learner = ROW_COUNT;

  DELETE FROM user_roles
  WHERE role_id = v_counselor_id
    AND user_id IN (
      SELECT DISTINCT ur.user_id FROM user_roles ur
      WHERE EXISTS (
        SELECT 1 FROM user_roles ur2
        JOIN custom_roles cr2 ON cr2.id = ur2.role_id
        WHERE ur2.user_id = ur.user_id AND cr2.role_key = 'student'
      )
    );

  -- Sync legacy profiles.role for affected users
  UPDATE profiles
  SET role = 'learner_counselor', updated_at = now()
  WHERE role = 'counselor'
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = profiles.id AND cr.role_key = 'student'
    );

  -- ============================================================================
  -- 2. Move test.faculty → staff_counselor
  -- ============================================================================

  INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
  SELECT id, v_staff_counselor_id, FALSE, now()
  FROM profiles
  WHERE email = 'test.faculty@jkkn.ac.in'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_moved_to_staff = ROW_COUNT;

  DELETE FROM user_roles
  WHERE role_id = v_counselor_id
    AND user_id IN (SELECT id FROM profiles WHERE email = 'test.faculty@jkkn.ac.in');

  UPDATE profiles
  SET role = 'staff_counselor', updated_at = now()
  WHERE email = 'test.faculty@jkkn.ac.in';

  -- ============================================================================
  -- 3. Verify expected post-state
  -- ============================================================================

  SELECT COUNT(*) INTO v_remaining_counselor
  FROM user_roles WHERE role_id = v_counselor_id;

  RAISE NOTICE 'Counselor reassignment complete:';
  RAISE NOTICE '  → learner_counselor: % new assignments', v_moved_to_learner;
  RAISE NOTICE '  → staff_counselor:   % new assignments', v_moved_to_staff;
  RAISE NOTICE '  → counselor (Admission Cell): % users remaining (expected 4)', v_remaining_counselor;

  IF v_remaining_counselor != 4 THEN
    RAISE WARNING 'Unexpected counselor count: % (expected 4: DHURAIMURUGAN, Dr.Kandasamy, Gowrisankar, Narayan Rao). Verify before downstream phases.', v_remaining_counselor;
  END IF;
END $migration$;

-- ============================================================================
-- Verification (run after migration to confirm)
-- ============================================================================
-- SELECT cr.role_key, cr.role_name, COUNT(ur.user_id) AS user_count
-- FROM custom_roles cr
-- LEFT JOIN user_roles ur ON ur.role_id = cr.id
-- WHERE cr.role_key IN ('counselor','learner_counselor','staff_counselor','health_counselor')
-- GROUP BY cr.role_key, cr.role_name
-- ORDER BY cr.role_key;
--
-- Expected:
--   counselor          | Admission Counsellor  | 4
--   health_counselor   | Health Counselor      | 1
--   learner_counselor  | Learner Counsellor    | 9
--   staff_counselor    | Staff Counsellor      | 1
-- ============================================================================

-- ============================================================================
-- REVERSE MIGRATION (manual — run if reassignment needs undoing)
-- ============================================================================
-- DO $reverse$
-- DECLARE
--   v_counselor_id UUID;
-- BEGIN
--   SELECT id INTO v_counselor_id FROM custom_roles WHERE role_key='counselor';
--
--   -- Restore counselor role to the 10 reassigned users
--   INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
--   SELECT DISTINCT ur.user_id, v_counselor_id, FALSE, now()
--   FROM user_roles ur
--   JOIN custom_roles cr ON cr.id = ur.role_id
--   WHERE cr.role_key IN ('learner_counselor','staff_counselor')
--     AND (
--       EXISTS (SELECT 1 FROM user_roles ur2 JOIN custom_roles cr2 ON cr2.id = ur2.role_id
--               WHERE ur2.user_id = ur.user_id AND cr2.role_key = 'student')
--       OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = ur.user_id AND p.email = 'test.faculty@jkkn.ac.in')
--     )
--   ON CONFLICT DO NOTHING;
--
--   -- Remove the new role assignments
--   DELETE FROM user_roles ur
--   USING custom_roles cr
--   WHERE ur.role_id = cr.id
--     AND cr.role_key IN ('learner_counselor','staff_counselor')
--     AND (
--       EXISTS (SELECT 1 FROM user_roles ur2 JOIN custom_roles cr2 ON cr2.id = ur2.role_id
--               WHERE ur2.user_id = ur.user_id AND cr2.role_key = 'student')
--       OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = ur.user_id AND p.email = 'test.faculty@jkkn.ac.in')
--     );
--
--   -- Restore profile.role
--   UPDATE profiles SET role = 'counselor', updated_at = now()
--   WHERE role IN ('learner_counselor','staff_counselor');
-- END $reverse$;
-- ============================================================================
