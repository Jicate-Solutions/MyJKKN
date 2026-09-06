-- Updated: 2026-08-04 - Foundation: unlink test accounts from pilot learner rows.
--
-- WHY THIS EXISTS
--   Two fp_students rows were temporarily wired to test accounts during the
--   2026-07-31 pilot, purely to prove the practice screen could be opened at
--   all. The session that did it recorded that they must be reversed once they
--   had served their purpose. They were not.
--
--   Confirmed still live on production 2026-08-04:
--     [PILOT] Student Alpha  ->  test.student@jkkn.ac.in
--     [PILOT] Student Beta   ->  test.superadmin@jkkn.ac.in
--
--   The visible consequence: signing in as test.superadmin and opening
--   /foundation/practice returns a LEARNER view — the platform believes a
--   super-admin test account is enrolled on a children's programme. Any count
--   of "who is on Foundation" is wrong by two, and in the direction that
--   flatters it.
--
-- WHY profile_id = NULL AND NOT A DELETE
--   fp_students.profile_id is nullable BY DESIGN — that is the whole mechanism
--   behind facilitator-led practice, where a child exists on the programme with
--   no login of their own. Nulling the link restores exactly that state: the
--   pilot learner rows survive, they simply stop being reachable by a login.
--   Deleting the rows would cascade into fp_attempts and destroy the only
--   practice history the programme has.
--
-- SAFETY
--   Scoped to rows whose linked profile is a @jkkn.ac.in TEST account, so it
--   cannot touch a real learner even if run twice. Idempotent: a second run
--   matches nothing.
--
--   fp_attempts.student_id references fp_students.id, not profile_id, so the
--   9 existing attempt rows are untouched.

DO $$
DECLARE
  v_unlinked integer;
BEGIN
  UPDATE fp_students s
     SET profile_id = NULL,
         updated_at = now()
    FROM profiles p
   WHERE p.id = s.profile_id
     AND s.profile_id IS NOT NULL
     AND p.email LIKE 'test.%@jkkn.ac.in';

  GET DIAGNOSTICS v_unlinked = ROW_COUNT;
  RAISE NOTICE 'fp_students unlinked from test accounts: %', v_unlinked;
END $$;

-- Post-condition: no learner on the Foundation programme may be reachable by a
-- test login. Fails loudly rather than leaving the estate half-cleaned.
DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
    FROM fp_students s
    JOIN profiles p ON p.id = s.profile_id
   WHERE p.email LIKE 'test.%@jkkn.ac.in';

  IF v_left > 0 THEN
    RAISE EXCEPTION 'fp_unlink_test_accounts: % test-account link(s) still present', v_left;
  END IF;
END $$;
