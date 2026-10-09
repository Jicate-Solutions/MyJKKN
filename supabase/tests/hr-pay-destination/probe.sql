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

-- 13. An account on file from BEFORE the log began: the first change still
--     names it, because the save function points the old row at the new one.
SELECT public.as_user('a0000000-0000-4000-8000-0000000000aa');
ALTER TABLE public.hr_staff_bank_accounts DISABLE TRIGGER trg_hr_log_bank_destination_change;
INSERT INTO public.hr_staff_bank_accounts (staff_id, account_holder_name, account_number, ifsc_code, bank_name)
VALUES ('5a000000-0000-4000-8000-000000000003', 'MEENA S', '111122223333', 'SBIN0001234', 'SBI');
ALTER TABLE public.hr_staff_bank_accounts ENABLE TRIGGER trg_hr_log_bank_destination_change;
SELECT public.fn_hr_set_staff_bank_account('5a000000-0000-4000-8000-000000000003', 'MEENA S', '444455556666', 'HDFC0000123', 'HDFC');
INSERT INTO public.r (ok, what) SELECT count(*) = 1 AND bool_and(before->>'account_last4' = '3333' AND after->>'account_last4' = '6666'),
  'an account from before the log: its first change is logged as changed 3333 to 6666, not recorded (got ' || count(*) || ')'
  FROM public.hr_pay_destination_changes WHERE kind = 'bank' AND staff_id = '5a000000-0000-4000-8000-000000000003';

-- 14. Delete the account in use, then insert a new one directly (the write
--     policy allows both). The delete is logged as removed, and the insert as
--     a CHANGE from the deleted account, not as a first-time record.
SELECT public.fn_hr_set_staff_bank_account('5a000000-0000-4000-8000-000000000004', 'RAVI T', '555566667777', 'SBIN0001234', 'SBI');
DELETE FROM public.hr_staff_bank_accounts WHERE staff_id = '5a000000-0000-4000-8000-000000000004' AND superseded_by IS NULL;
INSERT INTO public.r (ok, what) SELECT count(*) = 1, 'delete of the account in use: logged as removed (was 7777)'
  FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000004'
   AND before->>'account_last4' = '7777' AND after IS NULL;
INSERT INTO public.hr_staff_bank_accounts (staff_id, account_holder_name, account_number, ifsc_code, bank_name)
VALUES ('5a000000-0000-4000-8000-000000000004', 'RAVI T', '888899990000', 'HDFC0000123', 'HDFC');
INSERT INTO public.r (ok, what) SELECT count(*) = 1, 'direct insert after a delete: logged as changed 7777 to 0000'
  FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000004'
   AND before->>'account_last4' = '7777' AND after->>'account_last4' = '0000';
INSERT INTO public.r (ok, what) SELECT count(*) = 0, 'no first-time "recorded" row after the first one for this person'
  FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000004'
   AND before IS NULL AND after->>'account_last4' <> '7777';

-- 15. The back door: insert an old-looking row, retire the account in use onto
--     it, then put the old-looking row back in use. Every step that moves pay
--     is logged; inserting a row that is not in use is not.
DO $$ DECLARE v_cur uuid; v_new uuid := gen_random_uuid(); n0 int; n1 int; BEGIN
  SELECT id INTO v_cur FROM public.hr_staff_bank_accounts WHERE staff_id = '5a000000-0000-4000-8000-000000000003' AND superseded_by IS NULL;
  SELECT count(*) INTO n0 FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000003';
  INSERT INTO public.hr_staff_bank_accounts (id, staff_id, account_holder_name, account_number, ifsc_code, bank_name, superseded_by)
  VALUES (v_new, '5a000000-0000-4000-8000-000000000003', 'MEENA S', '121212121212', 'ICIC0000456', 'ICICI', v_cur);
  SELECT count(*) INTO n1 FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000003';
  INSERT INTO public.r (ok, what) VALUES (n1 = n0, 'inserting a row that is not in use: no log row');
  UPDATE public.hr_staff_bank_accounts SET superseded_by = v_new WHERE id = v_cur;
  UPDATE public.hr_staff_bank_accounts SET superseded_by = NULL WHERE id = v_new;
END $$;
INSERT INTO public.r (ok, what) SELECT count(*) = 1, 'account in use retired onto a row not in use: logged as removed (was 6666)'
  FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000003'
   AND before->>'account_last4' = '6666' AND after IS NULL;
INSERT INTO public.r (ok, what) SELECT count(*) = 1, 'an old-looking row put back in use: logged as changed 6666 to 1212'
  FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000003'
   AND before->>'account_last4' = '6666' AND after->>'account_last4' = '1212';

-- 16. Deleting an old, superseded row is housekeeping, not a change.
DO $$ DECLARE n0 int; n1 int; BEGIN
  SELECT count(*) INTO n0 FROM public.hr_pay_destination_changes;
  DELETE FROM public.hr_staff_bank_accounts WHERE staff_id = '5a000000-0000-4000-8000-000000000003' AND account_number = '111122223333';
  SELECT count(*) INTO n1 FROM public.hr_pay_destination_changes;
  INSERT INTO public.r (ok, what) VALUES (n1 = n0, 'deleting an old superseded row: no log row');
END $$;

-- 17. Still no full account number anywhere.
INSERT INTO public.r (ok, what) SELECT NOT EXISTS (SELECT 1 FROM public.hr_pay_destination_changes
  WHERE concat(before::text, after::text) ~ '(111122223333|444455556666|555566667777|888899990000|121212121212)'),
  'after every path: no full account number stored';

-- 18. Deleting a staff record must not erase the history of where their pay
--     went: the delete succeeds, the person's log rows stay (staff_id NULL,
--     name and code kept), and the Director's list still names them.
CREATE TABLE public.ravi_before AS SELECT id FROM public.hr_pay_destination_changes WHERE staff_id = '5a000000-0000-4000-8000-000000000004';
GRANT SELECT ON public.ravi_before TO PUBLIC;
DO $$ BEGIN
  DELETE FROM public.staff WHERE id = '5a000000-0000-4000-8000-000000000004';
  INSERT INTO public.r (ok, what) VALUES (true, 'staff delete succeeds with log rows present');
EXCEPTION WHEN others THEN
  INSERT INTO public.r (ok, what) VALUES (false, 'staff delete failed: ' || SQLERRM);
END $$;
INSERT INTO public.r (ok, what) SELECT count(*) = (SELECT count(*) FROM public.ravi_before) AND count(*) >= 3
  AND bool_and(c.staff_id IS NULL AND c.staff_name = 'Ravi T' AND c.staff_code = 'DCH064' AND c.college = 'JKKN Dental College'),
  'after the staff delete: all ' || (SELECT count(*) FROM public.ravi_before) || ' of Ravi''s log rows kept, staff_id NULL, name, code and college kept (got ' || count(*) || ')'
  FROM public.hr_pay_destination_changes c WHERE c.id IN (SELECT id FROM public.ravi_before);
SET ROLE authenticated; SELECT public.as_user('d0000000-0000-4000-8000-000000000001');
INSERT INTO public.r (ok, what) SELECT count(*) = (SELECT count(*) FROM public.ravi_before)
  AND bool_and(l.staff_name = 'Ravi T' AND l.staff_code = 'DCH064' AND l.college = 'JKKN Dental College' AND l.staff_id IS NULL),
  'Director: the list still shows Ravi''s ' || (SELECT count(*) FROM public.ravi_before) || ' changes, named from the kept snapshot (got ' || count(*) || ')'
  FROM public.fn_hr_pay_destination_changes(now() - interval '1 day') l WHERE l.change_id IN (SELECT id FROM public.ravi_before);
RESET ROLE;

-- 19. Past the 2,000-row cap nothing is silent: the list returns 2,000 rows
--     and every row carries the true total.
INSERT INTO public.hr_pay_destination_changes (staff_id, kind, before, after, changed_at)
SELECT '5a000000-0000-4000-8000-000000000001', 'bank', NULL, jsonb_build_object('account_last4', '4242'), now() - interval '1 hour' - g * interval '1 second'
  FROM generate_series(1, 2005) g;
CREATE TABLE public.cap_expect AS SELECT count(*) AS n FROM public.hr_pay_destination_changes WHERE changed_at >= now() - interval '1 day';
GRANT SELECT ON public.cap_expect TO PUBLIC;
SET ROLE service_role; SELECT public.as_user(NULL, 'service_role');
INSERT INTO public.r (ok, what)
SELECT count(*) = 2000 AND bool_and(l.total_count = t.n) AND max(t.n) > 2000,
  'past the cap: 2,000 rows returned, each saying the true total ' || max(t.n) || ' (got ' || count(*) || ' rows, total ' || coalesce(max(l.total_count)::text, 'none') || ')'
  FROM public.fn_hr_pay_destination_changes(now() - interval '1 day') l
  CROSS JOIN public.cap_expect t;
RESET ROLE;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || what FROM public.r ORDER BY n;
SELECT 'RESULT: ' || count(*) FILTER (WHERE ok) || ' PASS / ' || count(*) FILTER (WHERE NOT ok) || ' FAIL' FROM public.r;
