-- 20271009141300_hr_salary_raises_read_paying_trust.sql
--
-- THE RULING (Director): the HR head may change a team member's paying trust
-- (logged, weekly list to the Director list). Only the Director list changes
-- pay (#4122, Draft).
--
-- WHY
--   The paying trust lives in hr_staff_payroll. Each salary row also keeps a
--   copy of the payer it was saved with (hr_staff_salaries.hr_organization_id).
--   The salary register and Employee Salaries read hr_staff_payroll, so the
--   right trust pays. The raise machinery read the COPY on the row in force:
--     - hr_salary_revision_start_date: which trust's closed register months to
--       skip when choosing a raise's start month;
--     - hr_salary_revision_apply_due_on: the payer written on an approved raise;
--     - hr_salary_revision_target_pay: the payer written when the held part of
--       a target-gated raise is paid, paused or resumed.
--   Once the HR head changes the trust (no salary write, #4122), the copy is
--   stale, and the next approved raise was written with the OLD trust and its
--   start month checked against the old trust's registers. Raised by the
--   #4122 deep-review panel (finding 1, 9 Oct 2026).
--
-- WHAT THIS CHANGES
--   The three functions, re-created from their newest bodies on main
--   (start_date: 20270519090000; apply_due_on and target_pay: 20271007180207),
--   each with ONE change: the payer is hr_staff_payroll's row for the person,
--   and the salary row's copy only when nobody is assigned yet (unchanged
--   behaviour for them). Signatures, SECURITY DEFINER, search_path, grants
--   (EXECUTE revoked from anon, PUBLIC, authenticated; internal functions) and
--   comments are unchanged.
--
-- NOT CHANGED: rows already written keep the payer they were saved with.
--
-- Rehearsal: supabase/tests/hr-salary-revision/run-paying-trust.sh (local
-- PostgreSQL 16; the full approvals stack, this file on top, twice).
-- Live bodies NOT compared: the three are expected to equal main's newest
-- bodies on production; whoever applies this should diff them first.

DO $precondition$
BEGIN
  IF to_regclass('public.hr_staff_payroll') IS NULL THEN
    RAISE EXCEPTION '20271009141300 needs public.hr_staff_payroll (20260731071358).';
  END IF;
  IF to_regclass('public.hr_salary_revision_target_plans') IS NULL THEN
    RAISE EXCEPTION '20271009141300 needs 20271007180207 (target-gated raises). Apply that first.';
  END IF;
END
$precondition$;

-- ----------------------------------------------------------------------------
-- 1. The start month: skip months the PAYING trust's register has closed.
--    20270519090000's body; one change, marked 2026-10-09.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_start_date(p_staff_id uuid, p_today date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := (date_trunc('month', p_today) + interval '1 month')::date;
  v_org   uuid;
BEGIN
  -- 2026-10-09: who pays is hr_staff_payroll, which the HR head may change
  -- (Director's ruling); the salary row's copy is the payer when it was saved.
  -- Nobody assigned yet: the copy, as before.
  SELECT COALESCE(
           (SELECT p.hr_organization_id FROM public.hr_staff_payroll p WHERE p.staff_id = p_staff_id),
           (SELECT s.hr_organization_id FROM public.hr_staff_salaries s
             WHERE s.staff_id = p_staff_id AND s.superseded_by IS NULL))
    INTO v_org;

  FOR i IN 1..24 LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs rr
       WHERE rr.hr_organization_id = v_org
         AND rr.period_year = EXTRACT(YEAR FROM v_start)::int
         AND rr.period_month = EXTRACT(MONTH FROM v_start)::int
         AND rr.superseded_by IS NULL);
    v_start := (v_start + interval '1 month')::date;
  END LOOP;
  RETURN v_start;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_start_date(uuid, date) FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Writing an approved raise on its day. 20271007180207's body (section
--    e2); one change, marked 2026-10-09.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_apply_due_on(p_today date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r    record;
  v_cur  record;
  v_new  uuid;
  v_done integer := 0;
  v_name text;
  v_when text;
  -- 7 Oct 2026: the held part, kept back from this write.
  v_held numeric;
BEGIN
  FOR v_r IN
    SELECT * FROM public.hr_salary_revision_requests
     WHERE status = 'approved' AND starts_on <= p_today
     ORDER BY starts_on, id
     FOR UPDATE SKIP LOCKED
  LOOP
    -- 30 Sep: every request on its own. One that cannot be written is noted
    -- and the next one is still tried; nothing rolls the whole run back.
    BEGIN
      -- 1 Oct 2026, RULE 8: linked to no account, then or now: never written,
      -- never changed, listed for the Director, stamped or not.
      IF public.hr_salary_revision_is_unlinked(v_r.staff_id, v_r.subject_profile_id) THEN
        CONTINUE;
      END IF;

      -- 1 Oct 2026, RULE 6: an UNSTAMPED yes (given before those rules) that
      -- breaks rule 1 or 2 is never written and never changed: it stays as it
      -- is and is listed for the Director (fn_hr_salary_revision_held_approvals).
      -- A stamped yes passed the rules when it was given and is always written.
      IF NOT v_r.decided_under_rules
         AND public.hr_salary_revision_decision_breach(v_r.staff_id, v_r.subject_profile_id, v_r.director_decided_by, v_r.subject_was_list_member) IS NOT NULL THEN
        CONTINUE;
      END IF;

      SELECT TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) INTO v_name
        FROM public.staff s WHERE s.id = v_r.staff_id;
      v_when := to_char(v_r.starts_on, 'FMDD FMMonth YYYY');

      -- 30 Sep: the person left before the start date: cancelled, both told.
      IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s WHERE s.id = v_r.staff_id AND COALESCE(s.is_active, false)) THEN
        UPDATE public.hr_salary_revision_requests
           SET status = 'cancelled', cancelled_at = now(), apply_note = NULL,
               cancel_note = 'Cancelled: ' || COALESCE(NULLIF(v_name, ''), 'the person')
                             || ' left before the new pay was due to start on ' || v_when || '.'
         WHERE id = v_r.id;
        -- 7 Oct 2026: its held part lapses with it (listed), so it blocks nothing.
        UPDATE public.hr_salary_revision_target_plans
           SET state = 'lapsed', state_reason = 'left_before_start', updated_at = now()
         WHERE request_id = v_r.id AND state <> 'none';
        PERFORM public.hr_salary_revision_notify(
          public.hr_salary_revision_director_ids() || ARRAY[v_r.asked_by],
          'A salary revision was cancelled',
          COALESCE(NULLIF(v_name, ''), 'The person') || ' left before the approved pay change was due to start on '
            || v_when || ', so it was cancelled. Nothing was written.',
          '/hr/salary-revisions/' || v_r.id,
          'hr.payroll.salary_revision.cancelled:' || v_r.id,
          jsonb_build_object('request_id', v_r.id));
        CONTINUE;
      END IF;

      -- 30 Sep: the start date has passed without the pay being written (the
      -- job did not run that day). It is never written late (#4122 refuses a
      -- past start; the missed month is not paid back): back to the Director
      -- for a fresh yes, which sets a fresh start date. Both are told.
      IF v_r.starts_on < p_today THEN
        -- The person was told of a change that is not happening on that date;
        -- the fresh yes tells them again, with the new date, and overwrites
        -- their outcome row (approve_one upserts on request_id).
        UPDATE public.hr_salary_revision_requests
           SET status = 'waiting_director', starts_on = NULL, final_monthly_gross = NULL,
               director_decided_by = NULL, director_decided_at = NULL, decided_under_rules = false,
               apply_note = 'The start date ' || v_when || ' passed without the pay being written, so it needs a fresh yes. '
                            || 'The Director had approved ' || public.hr_salary_revision_rupees(v_r.final_monthly_gross) || '.'
         WHERE id = v_r.id;
        -- 7 Oct 2026: its held part lapses (listed); a fresh yes writes a new one.
        UPDATE public.hr_salary_revision_target_plans
           SET state = 'lapsed', state_reason = 'start_missed', updated_at = now()
         WHERE request_id = v_r.id AND state <> 'none';
        PERFORM public.hr_salary_revision_notify(
          public.hr_salary_revision_director_ids() || ARRAY[v_r.asked_by],
          'A salary revision missed its start date',
          'The pay change for ' || COALESCE(NULLIF(v_name, ''), 'a team member') || ' was due to start on '
            || v_when || ' but was not written that day. It is back with the Director for a fresh yes; '
            || 'it will start on the 1st of the month after that. The missed month is not paid back.',
          '/hr/salary-revisions/' || v_r.id,
          'hr.payroll.salary_revision.missed:' || v_r.id || ':' || v_when,
          jsonb_build_object('request_id', v_r.id));
        CONTINUE;
      END IF;

      SELECT * INTO v_cur FROM public.hr_staff_salaries
       WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

      IF NOT FOUND THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'No salary is recorded for this person any more, so the new pay could not be written. HR must record it on Employee Salaries.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;
      IF v_cur.effective_from > v_r.starts_on THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'HR recorded a salary starting ' || to_char(v_cur.effective_from, 'FMDD FMMonth YYYY')
                            || ', after this revision''s start. HR must decide which one stands.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;

      -- 7 Oct 2026, RULING 1: the held part is not written on the start date;
      -- only the increment is. A yes given before 7 Oct has no plan: whole figure.
      v_held := COALESCE((SELECT p.held_amount FROM public.hr_salary_revision_target_plans p
                           WHERE p.request_id = v_r.id), 0);
      -- 7 Oct 2026, default p: the pay changed since the yes (another raise,
      -- an HR edit): nothing is written; noted and listed for the Director.
      IF EXISTS (SELECT 1 FROM public.hr_salary_revision_target_plans p
                  WHERE p.request_id = v_r.id AND p.base_monthly_gross IS DISTINCT FROM v_cur.monthly_gross) THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'The pay in force (' || public.hr_salary_revision_rupees(v_cur.monthly_gross)
                            || ') is no longer the pay this raise was split from. Nothing was written; the Director must decide it again.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;

      -- 1 Oct 2026, RULE 7: tells the Employee Salaries trigger which approved
      -- request this write is (this transaction only; undone with it).
      PERFORM set_config('app.hr_salary_revision_apply', v_r.id::text, true);
      v_new := public.fn_hr_set_staff_salary(
        p_staff_id               => v_r.staff_id,
        -- 2026-10-09: the payer on record now (hr_staff_payroll), not the copy
        -- on the old salary row; nobody assigned yet: the copy, as before.
        p_hr_organization_id     => COALESCE((SELECT p.hr_organization_id FROM public.hr_staff_payroll p
                                               WHERE p.staff_id = v_r.staff_id), v_cur.hr_organization_id),
        p_monthly_gross          => v_r.final_monthly_gross - v_held,
        p_effective_from         => v_r.starts_on,
        p_salary_structure       => v_cur.salary_structure,
        p_overtime_level         => v_cur.overtime_level,
        p_overtime_amount        => v_cur.overtime_amount,
        p_eligible_for_pf        => v_cur.eligible_for_pf,
        p_exempt_edli            => v_cur.exempt_edli,
        p_eligible_for_insurance => v_cur.eligible_for_insurance,
        p_eligible_for_gratuity  => v_cur.eligible_for_gratuity,
        p_eligible_for_etf       => v_cur.eligible_for_etf,
        p_notes                  => 'Salary revision approved by the Director on '
                                    || to_char((v_r.director_decided_at AT TIME ZONE 'Asia/Kolkata')::date, 'FMDD FMMonth YYYY')
                                    || ' (request ' || v_r.id || ').',
        p_epf_amount             => v_cur.epf_amount,
        p_eligible_for_esi       => v_cur.eligible_for_esi,
        p_esi_amount             => v_cur.esi_amount,
        p_allowance_amount       => v_cur.allowance_amount,
        p_allowance_label        => v_cur.allowance_label);
      PERFORM set_config('app.hr_salary_revision_apply', '', true);

      UPDATE public.hr_salary_revision_requests
         SET status = 'applied', applied_salary_id = v_new, applied_at = now(), apply_note = NULL
       WHERE id = v_r.id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Kept on the request, in the words the database gave, and the run goes on.
      UPDATE public.hr_salary_revision_requests
         SET apply_note = 'The new pay could not be written: ' || SQLERRM
       WHERE id = v_r.id;
    END;
  END LOOP;
  RETURN v_done;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_apply_due_on(date) FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The held part of a target-gated raise. 20271007180207's body (section
--    f); one change, marked 2026-10-09.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_target_pay(p_request_id uuid, p_action text, p_today date)
RETURNS date
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p   record;
  v_cur record;
  v_eff date;
  v_new numeric;
BEGIN
  IF p_action NOT IN ('release', 'pause', 'resume') THEN
    RAISE EXCEPTION 'Unknown step %.', p_action USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.hr_salary_revision_target_plans WHERE request_id = p_request_id FOR UPDATE;

  -- Default e (7 Oct 2026): never in the past. Run on the 1st: that day;
  -- otherwise the next 1st; a month payroll is already working on is skipped.
  v_eff := public.hr_salary_revision_start_date(v_p.staff_id, p_today - 1);

  SELECT * INTO v_cur FROM public.hr_staff_salaries WHERE staff_id = v_p.staff_id AND superseded_by IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No salary is recorded for this person, so the held part could not be written. HR must record it on Employee Salaries.';
  END IF;
  IF v_cur.effective_from > v_eff THEN
    RAISE EXCEPTION 'HR recorded a salary starting %, after %. HR must decide which one stands.',
      to_char(v_cur.effective_from, 'FMDD FMMonth YYYY'), to_char(v_eff, 'FMDD FMMonth YYYY');
  END IF;
  v_new := v_cur.monthly_gross + CASE WHEN p_action = 'pause' THEN -v_p.held_amount ELSE v_p.held_amount END;
  IF v_new <= 0 THEN
    RAISE EXCEPTION 'Pausing the held part would leave no pay; nothing was written.';
  END IF;

  UPDATE public.hr_salary_revision_target_plans
     SET pending_action = p_action, pending_effective_from = v_eff
   WHERE request_id = p_request_id;

  PERFORM set_config('app.hr_salary_revision_target_pay', p_request_id::text, true);
  PERFORM public.fn_hr_set_staff_salary(
    p_staff_id               => v_p.staff_id,
    -- 2026-10-09: the payer on record now (hr_staff_payroll), not the copy
    -- on the old salary row; nobody assigned yet: the copy, as before.
    p_hr_organization_id     => COALESCE((SELECT p.hr_organization_id FROM public.hr_staff_payroll p
                                           WHERE p.staff_id = v_p.staff_id), v_cur.hr_organization_id),
    p_monthly_gross          => v_new,
    p_effective_from         => v_eff,
    p_salary_structure       => v_cur.salary_structure,
    p_overtime_level         => v_cur.overtime_level,
    p_overtime_amount        => v_cur.overtime_amount,
    p_eligible_for_pf        => v_cur.eligible_for_pf,
    p_exempt_edli            => v_cur.exempt_edli,
    p_eligible_for_insurance => v_cur.eligible_for_insurance,
    p_eligible_for_gratuity  => v_cur.eligible_for_gratuity,
    p_eligible_for_etf       => v_cur.eligible_for_etf,
    p_notes                  => CASE p_action
                                  WHEN 'release' THEN 'Held part of a salary revision paid: targets met'
                                  WHEN 'resume'  THEN 'Held part of a salary revision paid again: back on target'
                                  ELSE 'Held part of a salary revision paused: targets missed '
                                       || (v_p.rules->>'pause_after_missed_months') || ' months in a row'
                                END || ' (request ' || p_request_id || ').',
    p_epf_amount             => v_cur.epf_amount,
    p_eligible_for_esi       => v_cur.eligible_for_esi,
    p_esi_amount             => v_cur.esi_amount,
    p_allowance_amount       => v_cur.allowance_amount,
    p_allowance_label        => v_cur.allowance_label);
  PERFORM set_config('app.hr_salary_revision_target_pay', '', true);

  UPDATE public.hr_salary_revision_target_plans
     SET state = CASE WHEN p_action = 'pause' THEN 'paused' ELSE 'released' END,
         held_paid_from = CASE WHEN p_action = 'pause' THEN held_paid_from ELSE v_eff END,
         paused_from = CASE WHEN p_action = 'pause' THEN v_eff ELSE NULL END,
         pending_action = NULL, pending_effective_from = NULL, missed_in_row = 0, updated_at = now()
   WHERE request_id = p_request_id;
  RETURN v_eff;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_target_pay(uuid, text, date) FROM anon, PUBLIC, authenticated;
