-- Run as app_user (NOT the owner: owners and superusers bypass RLS entirely).
\set ON_ERROR_STOP on

-- Reader 1: an `own`-scoped role whose HR reach is institution A only.
SET test.super='false'; SET test.allinst='false'; SET test.staff='';
SET test.orgs='aaaaaaaa-0000-0000-0000-000000000001';
SET test.insts='11111111-0000-0000-0000-000000000001';
DO $$
DECLARE p int; b int; a int;
BEGIN
  SELECT count(*) INTO p FROM hr_recruitment_candidate_packages;
  SELECT count(*) INTO b FROM hr_staff_bank_accounts;
  SELECT count(*) INTO a FROM hr_attendance_periods;
  IF (p,b,a) IS DISTINCT FROM (1,1,1) THEN
    RAISE EXCEPTION 'confined reader saw %/1 packages, %/1 bank accounts, %/1 periods — the gate is not confining', p,b,a;
  END IF;
  RAISE NOTICE 'PASS  own-scoped reader confined to its own institution (1,1,1)';
END $$;

-- Reader 2: an all-institution role (hr_head — the COO and CAO). Must be untouched.
SET test.allinst='true';
SET test.orgs='aaaaaaaa-0000-0000-0000-000000000001,bbbbbbbb-0000-0000-0000-000000000002';
DO $$
DECLARE p int; b int; a int;
BEGIN
  SELECT count(*) INTO p FROM hr_recruitment_candidate_packages;
  SELECT count(*) INTO b FROM hr_staff_bank_accounts;
  SELECT count(*) INTO a FROM hr_attendance_periods;
  IF (p,b,a) IS DISTINCT FROM (2,2,2) THEN
    RAISE EXCEPTION 'all-institution reader lost access: %/2 packages, %/2 bank accounts, %/2 periods', p,b,a;
  END IF;
  RAISE NOTICE 'PASS  all-institution reader keeps full reach (2,2,2)';
END $$;

-- Reader 3: super admin. Must be untouched.
SET test.super='true'; SET test.orgs=''; SET test.allinst='false'; SET test.insts='';
DO $$
DECLARE p int; b int; a int;
BEGIN
  SELECT count(*) INTO p FROM hr_recruitment_candidate_packages;
  SELECT count(*) INTO b FROM hr_staff_bank_accounts;
  SELECT count(*) INTO a FROM hr_attendance_periods;
  IF (p,b,a) IS DISTINCT FROM (2,2,2) THEN
    RAISE EXCEPTION 'super admin lost access: %/2 packages, %/2 bank accounts, %/2 periods', p,b,a;
  END IF;
  RAISE NOTICE 'PASS  super admin unaffected (2,2,2)';
END $$;

-- ===========================================================================
-- Sections 5-6: interviews and scorecards, scoped through the candidate.
-- ===========================================================================

-- Reader 1 again: `own`-scoped to institution A, not on any panel.
SET test.super='false'; SET test.allinst='false'; SET test.staff=''; SET test.uid='';
SET test.orgs='aaaaaaaa-0000-0000-0000-000000000001';
SET test.insts='11111111-0000-0000-0000-000000000001';
DO $$
DECLARE i int; s int;
BEGIN
  SELECT count(*) INTO i FROM hr_recruitment_interviews;
  SELECT count(*) INTO s FROM hr_recruitment_scorecards;
  IF (i,s) IS DISTINCT FROM (1,1) THEN
    RAISE EXCEPTION 'confined reader saw %/1 interviews, %/1 scorecards — the gate is not confining', i,s;
  END IF;
  RAISE NOTICE 'PASS  own-scoped reader confined to its own institution (interviews 1, scorecards 1)';
END $$;

-- Reader 4: still `own`-scoped to A, but IS the panel member on institution B's
-- interview and the interviewer who wrote B's scorecard. The identity escape
-- hatches must keep their own work visible — otherwise this migration takes
-- away access granted by identity rather than by permission key.
SET test.uid='eeeeeeee-0000-0000-0000-000000000001';
DO $$
DECLARE i int; s int;
BEGIN
  SELECT count(*) INTO i FROM hr_recruitment_interviews;
  SELECT count(*) INTO s FROM hr_recruitment_scorecards;
  IF (i,s) IS DISTINCT FROM (2,2) THEN
    RAISE EXCEPTION 'identity escape hatch closed: panel member saw %/2 interviews, interviewer saw %/2 scorecards', i,s;
  END IF;
  RAISE NOTICE 'PASS  panel member / interviewer keep their own work across institutions (2,2)';
END $$;

-- Reader 2: all-institution role. Must be untouched.
SET test.uid=''; SET test.allinst='true';
SET test.orgs='aaaaaaaa-0000-0000-0000-000000000001,bbbbbbbb-0000-0000-0000-000000000002';
DO $$
DECLARE i int; s int;
BEGIN
  SELECT count(*) INTO i FROM hr_recruitment_interviews;
  SELECT count(*) INTO s FROM hr_recruitment_scorecards;
  IF (i,s) IS DISTINCT FROM (2,2) THEN
    RAISE EXCEPTION 'all-institution reader lost access: %/2 interviews, %/2 scorecards', i,s;
  END IF;
  RAISE NOTICE 'PASS  all-institution reader keeps full reach (interviews 2, scorecards 2)';
END $$;

-- Reader 3: super admin. Must be untouched.
SET test.super='true'; SET test.orgs=''; SET test.allinst='false'; SET test.insts='';
DO $$
DECLARE i int; s int;
BEGIN
  SELECT count(*) INTO i FROM hr_recruitment_interviews;
  SELECT count(*) INTO s FROM hr_recruitment_scorecards;
  IF (i,s) IS DISTINCT FROM (2,2) THEN
    RAISE EXCEPTION 'super admin lost access: %/2 interviews, %/2 scorecards', i,s;
  END IF;
  RAISE NOTICE 'PASS  super admin unaffected (interviews 2, scorecards 2)';
END $$;

-- The definer helper must not be reachable with the anon key. has_function_privilege
-- is asked directly, because a REVOKE that silently failed would otherwise look
-- identical to one that worked.
DO $$
BEGIN
  IF has_function_privilege('anon','public.fn_hr_candidate_institution_in_scope(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE fn_hr_candidate_institution_in_scope — the revoke did not take';
  END IF;
  RAISE NOTICE 'PASS  anon cannot execute the scope helper';
END $$;

-- The point of section 4 being SECURITY DEFINER, asserted rather than asserted-about.
-- The reader can no longer see ANY candidate row — as a holder of
-- hr.recruitment.scorecards.view but not hr.recruitment.view cannot in production.
-- A definer helper still resolves the institution link; an invoker-rights
-- subquery would be suppressed with it and confine the reader to 0.
SET test.super='false'; SET test.allinst='false'; SET test.uid='';
SET test.insts='11111111-0000-0000-0000-000000000001';
SET test.orgs='aaaaaaaa-0000-0000-0000-000000000001';
SET test.hide_candidates='true';
DO $$
DECLARE vis int; i int; s int;
BEGIN
  SELECT count(*) INTO vis FROM hr_recruitment_candidates;
  IF vis <> 0 THEN
    RAISE EXCEPTION 'precondition failed: reader still sees % candidate rows, so this proves nothing', vis;
  END IF;
  SELECT count(*) INTO i FROM hr_recruitment_interviews;
  SELECT count(*) INTO s FROM hr_recruitment_scorecards;
  IF (i,s) IS DISTINCT FROM (1,1) THEN
    RAISE EXCEPTION 'definer helper is RLS-coupled: with candidates hidden the reader saw %/1 interviews, %/1 scorecards', i,s;
  END IF;
  RAISE NOTICE 'PASS  scope survives the candidate table being invisible (definer, not invoker) (1,1)';
END $$;
SET test.hide_candidates='false';
