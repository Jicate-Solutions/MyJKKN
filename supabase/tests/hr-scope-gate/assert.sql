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
