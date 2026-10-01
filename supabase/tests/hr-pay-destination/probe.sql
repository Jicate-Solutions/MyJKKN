-- Every line prints PASS or FAIL. Runs after the migration was applied twice.
\set ON_ERROR_STOP 0
CREATE TABLE public.r (n serial, ok boolean, what text);
GRANT ALL ON public.r TO PUBLIC; GRANT ALL ON SEQUENCE public.r_n_seq TO PUBLIC;
CREATE FUNCTION public.as_user(p uuid, p_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p::text, ''), false);
  PERFORM set_config('request.jwt.claim.role', p_role, false);
END $$;
GRANT EXECUTE ON FUNCTION public.as_user(uuid, text) TO PUBLIC;

-- 1. The HR head records Priya's first bank account (through the real save function).
SELECT public.as_user('a0000000-0000-4000-8000-0000000000aa');
SELECT public.fn_hr_set_staff_bank_account('5a000000-0000-4000-8000-000000000001', 'PRIYA R', '123456789012', 'SBIN0001234', 'SBI');
INSERT INTO public.r (ok, what) SELECT count(*) = 1 AND bool_and(before IS NULL) AND bool_and(after->>'account_last4' = '9012')
  AND bool_and(changed_by = 'a0000000-0000-4000-8000-0000000000aa'), 'first account: one log row, no before, last4 9012, changed_by = HR head'
  FROM public.hr_pay_destination_changes WHERE kind = 'bank';

-- 2. A different account: before AND after, both masked.
SELECT public.fn_hr_set_staff_bank_account('5a000000-0000-4000-8000-000000000001', 'PRIYA R', '999988887777', 'HDFC0000123', 'HDFC');
INSERT INTO public.r (ok, what) SELECT count(*) = 1, 'second account: before last4 9012 at SBI, after last4 7777 at HDFC'
  FROM public.hr_pay_destination_changes WHERE kind = 'bank'
   AND before->>'account_last4' = '9012' AND after->>'account_last4' = '7777' AND before->>'bank' = 'SBI' AND after->>'bank' = 'HDFC';

-- 3. Re-saving the same account writes nothing (the save returns the incumbent).
SELECT public.fn_hr_set_staff_bank_account('5a000000-0000-4000-8000-000000000001', 'PRIYA R', '999988887777', 'HDFC0000123', 'HDFC');
INSERT INTO public.r (ok, what) SELECT count(*) = 2, 'same account re-saved: no new row (still 2)' FROM public.hr_pay_destination_changes WHERE kind = 'bank';

-- 4. Verifying, or notes, is not a change of destination.
UPDATE public.hr_staff_bank_accounts SET verified_at = now(), notes = 'passbook seen' WHERE superseded_by IS NULL;
INSERT INTO public.r (ok, what) SELECT count(*) = 2, 'verify / notes update: no new row' FROM public.hr_pay_destination_changes WHERE kind = 'bank';

-- 5. An in-place edit of the number IS logged.
UPDATE public.hr_staff_bank_accounts SET account_number = '999988880000' WHERE superseded_by IS NULL;
INSERT INTO public.r (ok, what) SELECT count(*) = 1, 'in-place number edit: logged 7777 to 0000'
  FROM public.hr_pay_destination_changes WHERE kind = 'bank' AND before->>'account_last4' = '7777' AND after->>'account_last4' = '0000';

-- 6. No full account number anywhere in the log.
INSERT INTO public.r (ok, what) SELECT NOT EXISTS (SELECT 1 FROM public.hr_pay_destination_changes
  WHERE before::text ~ '(123456789012|999988887777|999988880000)' OR after::text ~ '(123456789012|999988887777|999988880000)')
  AND NOT EXISTS (SELECT 1 FROM public.hr_pay_destination_changes WHERE kind = 'bank'
  AND ((before IS NOT NULL AND before->>'account_last4' !~ '^[0-9]{4}$') OR (after IS NOT NULL AND after->>'account_last4' !~ '^[0-9]{4}$'))),
  'no full account number stored; every bank entry keeps exactly the last 4 digits';

-- 7. Paying trust: recorded, changed, a notes-only edit, removed.
INSERT INTO public.hr_staff_payroll (staff_id, hr_organization_id) VALUES ('5a000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000001');
UPDATE public.hr_staff_payroll SET hr_organization_id = '0a000000-0000-4000-8000-000000000002' WHERE staff_id = '5a000000-0000-4000-8000-000000000002';
UPDATE public.hr_staff_payroll SET notes = 'checked' WHERE staff_id = '5a000000-0000-4000-8000-000000000002';
DELETE FROM public.hr_staff_payroll WHERE staff_id = '5a000000-0000-4000-8000-000000000002';
INSERT INTO public.r (ok, what) SELECT count(*) = 3, 'payer: recorded + changed + removed = 3 rows; a notes-only edit adds none'
  FROM public.hr_pay_destination_changes WHERE kind = 'payer';
INSERT INTO public.r (ok, what) SELECT count(*) = 1, 'payer change names both trusts'
  FROM public.hr_pay_destination_changes WHERE kind = 'payer'
   AND before->>'organization_name' = 'JKKN Educational Trust' AND after->>'organization_name' = 'JKKN Dental Trust';

-- 8. The HR head (not on the list) sees nothing and cannot read or touch the list.
SET ROLE authenticated; SELECT public.as_user('a0000000-0000-4000-8000-0000000000aa');
INSERT INTO public.r (ok, what) SELECT count(*) = 0, 'HR head: the log table shows 0 rows' FROM public.hr_pay_destination_changes;
DO $$ BEGIN
  PERFORM * FROM public.fn_hr_pay_destination_changes(now() - interval '1 day');
  INSERT INTO public.r (ok, what) VALUES (false, 'HR head: the list function should refuse');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO public.r (ok, what) VALUES (true, 'HR head: the list function refuses (42501)');
END $$;
DO $$ BEGIN
  INSERT INTO public.hr_pay_destination_changes (staff_id, kind) VALUES ('5a000000-0000-4000-8000-000000000001', 'bank');
  INSERT INTO public.r (ok, what) VALUES (false, 'HR head: should not be able to write a log row');
EXCEPTION WHEN others THEN
  INSERT INTO public.r (ok, what) VALUES (true, 'HR head: cannot write a log row');
END $$;
DO $$ DECLARE n int; BEGIN
  DELETE FROM public.hr_pay_destination_changes; GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.r (ok, what) VALUES (n = 0, 'HR head: cannot delete log rows (deleted ' || n || ')');
EXCEPTION WHEN others THEN
  INSERT INTO public.r (ok, what) VALUES (true, 'HR head: cannot delete log rows (refused)');
END $$;
RESET ROLE;

-- 9. The Director reads it, with names; so does Isvarya.
SET ROLE authenticated; SELECT public.as_user('d0000000-0000-4000-8000-000000000001');
INSERT INTO public.r (ok, what) SELECT count(*) = 6 AND bool_and(staff_name IS NOT NULL) AND bool_or(changed_by_name = 'HR Head') AND bool_or(college = 'JKKN Dental College'),
  'Director: the list returns all 6 changes (3 bank + 3 payer), named, with who and which college (got ' || count(*) || ')' FROM public.fn_hr_pay_destination_changes(now() - interval '1 day');
SELECT public.as_user('d0000000-0000-4000-8000-000000000006');
INSERT INTO public.r (ok, what) SELECT count(*) = 6, 'Isvarya: the table shows all 6 rows (got ' || count(*) || ')' FROM public.hr_pay_destination_changes;
RESET ROLE;

-- 10. The weekly job (service role) reads it; anon cannot run it.
SET ROLE service_role; SELECT public.as_user(NULL, 'service_role');
INSERT INTO public.r (ok, what) SELECT count(*) = 6, 'weekly job (service role): the list returns 6 (got ' || count(*) || ')' FROM public.fn_hr_pay_destination_changes(now() - interval '1 day');
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  PERFORM * FROM public.fn_hr_pay_destination_changes(now());
  INSERT INTO public.r (ok, what) VALUES (false, 'anon: should not be able to run the list');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO public.r (ok, what) VALUES (true, 'anon: cannot run the list function');
END $$;
RESET ROLE;

-- 11. Old changes fall out of the window.
UPDATE public.hr_pay_destination_changes SET changed_at = now() - interval '10 days' WHERE kind = 'payer';
SET ROLE service_role; SELECT public.as_user(NULL, 'service_role');
INSERT INTO public.r (ok, what) SELECT count(*) = 3, 'the 7-day window: payer rows moved 10 days back drop out (3 bank rows left, got ' || count(*) || ')' FROM public.fn_hr_pay_destination_changes(now() - interval '7 days');
RESET ROLE;

-- 12. The schedule row, once.
INSERT INTO public.r (ok, what) SELECT count(*) = 1 AND bool_and(days_of_week = ARRAY[1]::smallint[] AND minute_of_day = 497),
  'Monday 08:17 IST schedule row present once' FROM public.ai_routine_schedules WHERE routine_id = 'hr-pay-destination-weekly';

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || what FROM public.r ORDER BY n;
SELECT 'RESULT: ' || count(*) FILTER (WHERE ok) || ' PASS / ' || count(*) FILTER (WHERE NOT ok) || ' FAIL' FROM public.r;
