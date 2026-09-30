-- ============================================================================
-- Migration: 20270524090000_hr_salary_revision_director_list
-- The Director's rulings of 30 Sep 2026 on the salary revision workflow that
-- 20270519090000 created and that was applied to production on 30 Sep.
-- ============================================================================
-- !!! MUST NOT MERGE OR APPLY BEFORE #4121 (20270520090000, the Director list) !!!
--   (its file is on main and applied; section 0 checks it is really there.)
--
--  * "The Director" is the NAMED LIST (fn_is_the_director()), never
--    is_super_admin(): 15 accounts are super admins. The final yes, a changed
--    amount and the no are the list's alone. The weekly reminder goes to the
--    list only. The key hr.payroll.salary_revision.approve stays granted to
--    nobody and no longer opens the door either.
--  * A raise is CANCELLED if the person leaves before its start date; the
--    Director and the asker are told; nothing is written. A leaver cannot be
--    approved either.
--  * A principal who is also the head of the person's department goes
--    straight to the Director, MARKED (asker_is_also_hod).
--  * The band is snapshotted when asked (band_snapshot); the Director's list
--    says when it changed since (band_changed, a yes/no only).
--  * A missed start (the daily job did not run on the day; 20270521090000
--    refuses a past start; the missed month is not paid back) is never written
--    late: the request goes back to the Director for a fresh yes and a fresh
--    start date, both are told. The job handles every request on its own.
--  * The comments read policy calls fn_hr_salary_revision_can_see() itself.
--
-- Everything is CREATE OR REPLACE / IF NOT EXISTS: safe to apply twice. The one
-- DROP is fn_hr_salary_revision_list(text), whose result columns grow (a
-- CREATE OR REPLACE cannot change them); its grants are re-stated below.
-- No inner BEGIN/COMMIT. Nothing here changes anybody's pay.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. The Director list first. Stop here, changing nothing, if it is missing.
-- ----------------------------------------------------------------------------
DO $check$
BEGIN
  IF to_regprocedure('public.fn_is_the_director()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.fn_is_the_director() is missing. Apply #4121 (20270520090000_the_director_list) before this migration.';
  END IF;
  IF to_regclass('public.hr_salary_revision_requests') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.hr_salary_revision_requests is missing. Apply 20270519090000 before this migration.';
  END IF;
END
$check$;

-- ----------------------------------------------------------------------------
-- 1. The request row: the marker, the band snapshot, the cancelled state
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_salary_revision_requests
  ADD COLUMN IF NOT EXISTS asker_is_also_hod boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS band_snapshot     jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_note       text;

COMMENT ON COLUMN public.hr_salary_revision_requests.asker_is_also_hod IS
  '30 Sep: the asker is the principal AND the head of this department, so there was no separate check; the Director sees it marked.';
COMMENT ON COLUMN public.hr_salary_revision_requests.band_snapshot IS
  '30 Sep: the college''s pay band as it stood when asked, so the Director''s screen can say the band changed since. Never sent to a browser.';
COMMENT ON COLUMN public.hr_salary_revision_requests.cancel_note IS
  '30 Sep: why an approved raise was cancelled (the person left before its start date).';

-- 'cancelled' joins the statuses. The inline CHECK of 20270519090000 carries
-- PostgreSQL's default name.
ALTER TABLE public.hr_salary_revision_requests
  DROP CONSTRAINT IF EXISTS hr_salary_revision_requests_status_check;
ALTER TABLE public.hr_salary_revision_requests
  ADD CONSTRAINT hr_salary_revision_requests_status_check
  CHECK (status IN ('waiting_principal', 'waiting_director',
                    'approved', 'applied', 'stopped', 'refused', 'cancelled'));
ALTER TABLE public.hr_salary_revision_requests
  DROP CONSTRAINT IF EXISTS hr_srr_cancelled_has_note;
ALTER TABLE public.hr_salary_revision_requests
  ADD CONSTRAINT hr_srr_cancelled_has_note
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_note IS NOT NULL));

-- ----------------------------------------------------------------------------
-- 2. The list's members, and the check everyone else calls
-- ----------------------------------------------------------------------------
-- The list's members, for the notices only the Director should get. Internal:
-- called by the definer functions below, granted to nobody.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_director_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT array_agg((e.v)::uuid)
      FROM public.platform_policies pp
      CROSS JOIN LATERAL jsonb_array_elements_text(pp.value) AS e(v)
     WHERE pp.policy_key = 'platform.the_director_profile_ids'
       AND pp.scope_type = 'global' AND pp.scope_id IS NULL
       AND pp.is_active = true
       AND jsonb_typeof(pp.value) = 'array'
       AND e.v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ), ARRAY[]::uuid[])
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_director_ids() FROM anon, PUBLIC, authenticated;

-- The final yes: the list, never is_super_admin().
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_can_approve()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- 30 Sep: the NAMED list (#4121), never is_super_admin(). The .approve key is
  -- granted to nobody and no longer opens this door either.
  SELECT public.fn_is_the_director()
$function$;

-- Tier 4 (the Director) is the list too.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_user_tier(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_user IS NULL THEN 0
    WHEN p_user = ANY (public.hr_salary_revision_director_ids()) THEN 4
    WHEN public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.ask_anyone') THEN 3
    WHEN public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.ask_own_college')
      OR public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.college_check') THEN 2
    WHEN public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.ask_own_department') THEN 1
    ELSE 0
  END
$function$;

-- ----------------------------------------------------------------------------
-- 3. Asking: the principal-also-HOD marker and the band snapshot
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_propose(
  p_staff_id uuid, p_monthly_gross numeric, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_s        record;
  v_current  numeric;
  v_as       text;
  v_cap_tier integer;
  v_sub_tier integer;
  v_route    text;
  v_open     uuid;
  v_id       uuid;
  v_self     boolean;
  v_name     text;
  v_checkers uuid[];
  v_also_hod boolean := false;
  v_band     jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a reason. The Director reads it before he decides.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'The reason is too long (2,000 characters at most).' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.profile_id, s.institution_id, s.department_id, s.first_name, s.last_name
    INTO v_s
    FROM public.v_hr_staff s
   WHERE s.id = p_staff_id AND COALESCE(s.is_active, false);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This person is not on the HR list of active team members.' USING ERRCODE = 'P0002';
  END IF;

  -- RULING 1 — who may ask for whom. The broadest lane the caller holds wins.
  IF public.fn_hr_salary_revision_can_approve() THEN
    v_as := 'director'; v_cap_tier := 4;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_anyone') THEN
    v_as := 'hr_head'; v_cap_tier := 3;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_college')
        AND v_s.institution_id = ANY (public.fn_my_staff_institution_ids()) THEN
    v_as := 'principal'; v_cap_tier := 2;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_department')
        AND v_s.department_id = ANY (public.fn_hr_salary_revision_my_department_ids()) THEN
    v_as := 'hod'; v_cap_tier := 1;
  ELSE
    RAISE EXCEPTION 'You can ask only for people in your own college (principal) or your own department (head of department).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT monthly_gross INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'This person has no salary recorded yet, so there is nothing to revise. HR records the first salary on Employee Salaries.'
      USING ERRCODE = 'P0002';
  END IF;
  IF p_monthly_gross = v_current THEN
    RAISE EXCEPTION 'That is the same as the pay now.' USING ERRCODE = '22023';
  END IF;

  -- RULING 10. The partial unique index is the real guarantee; this check only
  -- lets the second asker be told WHICH request is waiting.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary_revision', 0));
  SELECT id INTO v_open FROM public.hr_salary_revision_requests
   WHERE staff_id = p_staff_id AND status IN ('waiting_principal', 'waiting_director', 'approved');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'A salary revision for this person is already waiting. You can add a comment to it instead.'
      USING ERRCODE = 'unique_violation', DETAIL = v_open::text;
  END IF;

  -- RULING 9 — flagged, never refused.
  v_self := p_staff_id = ANY (public.fn_my_staff_ids());
  v_sub_tier := public.hr_salary_revision_user_tier(v_s.profile_id);

  -- RULING 2. An HOD's request goes via the principal — unless it is ABOUT a
  -- principal or someone more senior, who cannot check their own pay.
  v_route := CASE WHEN v_as = 'hod' AND v_sub_tier < 2 THEN 'via_principal' ELSE 'direct' END;

  -- 30 Sep: a principal who is ALSO the head of this person's department has
  -- nobody to check them; the request goes straight to the Director, marked.
  v_also_hod := v_as = 'principal'
    AND v_s.department_id IS NOT NULL
    AND v_s.department_id = ANY (public.fn_hr_salary_revision_my_department_ids());

  -- 30 Sep: the college's band as it stands now, kept so the Director's screen
  -- can say when it changed since the request (the same row #4119 reads).
  SELECT bp.value INTO v_band
    FROM public.platform_policies bp
   WHERE bp.policy_key = 'hr.pay_scales' AND bp.scope_type = 'institution'
     AND bp.scope_id = v_s.institution_id
   LIMIT 1;

  INSERT INTO public.hr_salary_revision_requests (
    staff_id, institution_id, department_id, asked_by, asked_as, route,
    is_self, is_for_senior, asker_is_also_hod, band_snapshot,
    current_monthly_gross, asked_monthly_gross, reason, status)
  VALUES (
    p_staff_id, v_s.institution_id, v_s.department_id, v_uid, v_as, v_route,
    v_self, (NOT v_self) AND v_sub_tier > v_cap_tier, v_also_hod, v_band,
    v_current, p_monthly_gross, btrim(p_reason),
    CASE v_route WHEN 'via_principal' THEN 'waiting_principal' ELSE 'waiting_director' END)
  RETURNING id INTO v_id;

  IF v_route = 'via_principal' THEN
    v_name := TRIM(BOTH FROM COALESCE(v_s.first_name, '') || ' ' || COALESCE(v_s.last_name, ''));
    SELECT array_agg(DISTINCT st.profile_id) INTO v_checkers
      FROM public.staff st
     WHERE st.institution_id = v_s.institution_id
       AND st.is_active AND st.profile_id IS NOT NULL
       AND st.id <> p_staff_id
       AND public.hr_salary_revision_user_holds(st.profile_id, 'hr.payroll.salary_revision.college_check');
    PERFORM public.hr_salary_revision_notify(
      v_checkers,
      'A salary revision needs your check',
      'A head of department asked for a salary revision for ' || v_name
        || '. Please agree or stop it before it goes to the Director.',
      '/hr/salary-revisions/' || v_id,
      'hr.payroll.salary_revision.check:' || v_id,
      jsonb_build_object('request_id', v_id));
  END IF;

  RETURN v_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. The yes: a leaver cannot be approved
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_approve_one(
  p_request_id uuid, p_final numeric, p_note text)
RETURNS date
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_r       record;
  v_final   numeric;
  v_start   date;
  v_now_pay numeric;
  v_subject uuid;
  v_name    text;
  v_when    text;
BEGIN
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF v_r.status <> 'waiting_director' THEN
    RAISE EXCEPTION 'This request is not waiting for the Director (it is %).', v_r.status
      USING ERRCODE = '55000';
  END IF;
  -- 30 Sep: a person who has left cannot be given a raise.
  IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s WHERE s.id = v_r.staff_id AND COALESCE(s.is_active, false)) THEN
    RAISE EXCEPTION 'This person is no longer an active team member, so there is no pay to revise.'
      USING ERRCODE = '55000';
  END IF;

  v_final := COALESCE(p_final, v_r.asked_monthly_gross);
  IF v_final IS NULL OR v_final <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;

  v_start := public.hr_salary_revision_start_date(v_r.staff_id, public.hr_salary_revision_ist_today());

  UPDATE public.hr_salary_revision_requests
     SET status = 'approved', final_monthly_gross = v_final, starts_on = v_start,
         director_decided_by = v_uid, director_decided_at = now()
   WHERE id = p_request_id;

  IF p_note IS NOT NULL AND btrim(p_note) <> '' THEN
    INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
    VALUES (p_request_id, COALESCE(v_uid, v_r.asked_by), left(btrim(p_note), 2000));
  END IF;

  SELECT monthly_gross INTO v_now_pay
    FROM public.hr_staff_salaries WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

  INSERT INTO public.hr_salary_revision_outcomes
    (request_id, staff_id, previous_monthly_gross, new_monthly_gross, starts_on)
  VALUES (p_request_id, v_r.staff_id, COALESCE(v_now_pay, v_r.current_monthly_gross), v_final, v_start);

  SELECT profile_id, TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_subject, v_name
    FROM public.staff WHERE id = v_r.staff_id;
  v_when := to_char(v_start, 'FMDD FMMonth YYYY');

  -- RULING 5: the person is told now, and only now.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_subject],
    'Your monthly pay is changing',
    'From ' || v_when || ' your monthly pay will be ' || public.hr_salary_revision_rupees(v_final)
      || ' (it is ' || public.hr_salary_revision_rupees(COALESCE(v_now_pay, v_r.current_monthly_gross)) || ' now).'
      || CASE WHEN v_final < COALESCE(v_now_pay, v_r.current_monthly_gross) THEN ' This is a pay cut.' ELSE '' END,
    '/hr/my-pay-changes',
    'hr.payroll.salary_revision.outcome:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  -- RULING 12: the asker sees his figure.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'Salary revision approved',
    'The Director approved the salary revision you asked for ' || v_name || ': '
      || public.hr_salary_revision_rupees(v_final) || ' a month from ' || v_when
      || CASE WHEN v_final <> v_r.asked_monthly_gross
              THEN ' (you asked for ' || public.hr_salary_revision_rupees(v_r.asked_monthly_gross) || ').'
              ELSE '.' END,
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.approved:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  RETURN v_start;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Writing the pay on its day: leaver cancelled, missed start never written
--    late, every request on its own
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
        -- the fresh yes tells them again, with the new date.
        DELETE FROM public.hr_salary_revision_outcomes WHERE request_id = v_r.id;
        UPDATE public.hr_salary_revision_requests
           SET status = 'waiting_director', starts_on = NULL, final_monthly_gross = NULL,
               director_decided_by = NULL, director_decided_at = NULL,
               apply_note = 'The start date ' || v_when || ' passed without the pay being written, so it needs a fresh yes. '
                            || 'The Director had approved ' || public.hr_salary_revision_rupees(v_r.final_monthly_gross) || '.'
         WHERE id = v_r.id;
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

      v_new := public.fn_hr_set_staff_salary(
        p_staff_id               => v_r.staff_id,
        p_hr_organization_id     => v_cur.hr_organization_id,
        p_monthly_gross          => v_r.final_monthly_gross,
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

-- ----------------------------------------------------------------------------
-- 6. The weekly reminder goes to the list
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_weekly_digest()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_to      uuid[];
  v_waiting integer;
  v_check   integer;
  v_lines   text;
  v_today   date := public.hr_salary_revision_ist_today();
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'The weekly reminder is sent by the schedule only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) FILTER (WHERE status = 'waiting_director'),
         count(*) FILTER (WHERE status = 'waiting_principal')
    INTO v_waiting, v_check
    FROM public.hr_salary_revision_requests;
  IF v_waiting + v_check = 0 THEN RETURN 0; END IF;

  -- 30 Sep: the Director list (#4121), not every super admin.
  v_to := public.hr_salary_revision_director_ids();

  SELECT string_agg(line, E'\n' ORDER BY ord) INTO v_lines FROM (
    SELECT row_number() OVER (ORDER BY r.created_at) AS ord,
           '• ' || TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))
             || ': ' || public.hr_salary_revision_rupees(r.current_monthly_gross)
             || ' → ' || public.hr_salary_revision_rupees(r.asked_monthly_gross)
             || CASE WHEN r.is_cut THEN ' (PAY CUT)' ELSE '' END AS line
      FROM public.hr_salary_revision_requests r
      JOIN public.staff s ON s.id = r.staff_id
     WHERE r.status = 'waiting_director'
     ORDER BY r.created_at
     LIMIT 10) t;

  PERFORM public.hr_salary_revision_notify(
    v_to,
    'Salary revisions waiting for you',
    v_waiting || CASE WHEN v_waiting = 1 THEN ' salary revision is' ELSE ' salary revisions are' END
      || ' waiting for your yes or no.'
      || CASE WHEN v_lines IS NOT NULL THEN E'\n' || v_lines ELSE '' END
      || CASE WHEN v_waiting > 10 THEN E'\n…and ' || (v_waiting - 10) || ' more.' ELSE '' END
      || CASE WHEN v_check > 0 THEN E'\n' || v_check || ' more '
              || CASE WHEN v_check = 1 THEN 'is' ELSE 'are' END || ' waiting for a principal''s check.' ELSE '' END,
    '/hr/salary-revisions/approve',
    'hr.payroll.salary_revision.digest:' || to_char(v_today, 'IYYY-IW'),
    jsonb_build_object('waiting_director', v_waiting, 'waiting_principal', v_check));
  RETURN v_waiting + v_check;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 7. The list read grows four columns (marker, band-changed, the two notes)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_list(text);
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_list(p_view text DEFAULT 'all')
RETURNS TABLE(
  id uuid, staff_id uuid, person_name text, staff_code text, designation text,
  institution_id uuid, institution_name text, department_name text,
  asked_by uuid, asked_by_name text, asked_as text, route text,
  is_self boolean, is_for_senior boolean,
  current_monthly_gross numeric, asked_monthly_gross numeric, is_cut boolean,
  final_monthly_gross numeric, final_is_cut boolean,
  reason text, status text, starts_on date,
  created_at timestamptz, principal_decided_at timestamptz,
  director_decided_at timestamptz, applied_at timestamptz, comment_count integer,
  -- 30 Sep
  asker_is_also_hod boolean, band_changed boolean, apply_note text, cancel_note text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_view NOT IN ('mine', 'college', 'director', 'all') THEN
    RAISE EXCEPTION 'Unknown list: %', p_view USING ERRCODE = '22023';
  END IF;
  IF p_view = 'director' AND NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can open the approval list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_view = 'college' AND NOT public.user_has_permission('hr.payroll.salary_revision.college_check') THEN
    RAISE EXCEPTION 'Only a principal can open the principal''s check list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT r.id, r.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, s.designation::text,
         r.institution_id, i.name::text, d.department_name::text,
         r.asked_by, COALESCE(pr.full_name, 'Someone')::text, r.asked_as, r.route,
         r.is_self, r.is_for_senior,
         r.current_monthly_gross, r.asked_monthly_gross, r.is_cut,
         r.final_monthly_gross, r.final_is_cut,
         r.reason, r.status, r.starts_on,
         r.created_at, r.principal_decided_at, r.director_decided_at, r.applied_at,
         (SELECT count(*)::int FROM public.hr_salary_revision_comments c WHERE c.request_id = r.id),
         r.asker_is_also_hod,
         -- 30 Sep: only a yes/no leaves here, never the band itself. Only the
         -- Director is told (the screen shows the note on his list alone).
         (public.fn_hr_salary_revision_can_approve()
          AND r.band_snapshot IS DISTINCT FROM (
                SELECT bp.value FROM public.platform_policies bp
                 WHERE bp.policy_key = 'hr.pay_scales' AND bp.scope_type = 'institution'
                   AND bp.scope_id = r.institution_id LIMIT 1)),
         r.apply_note, r.cancel_note
    FROM public.hr_salary_revision_requests r
    JOIN public.staff s ON s.id = r.staff_id
    JOIN public.institutions i ON i.id = r.institution_id
    LEFT JOIN public.departments d ON d.id = r.department_id
    LEFT JOIN public.profiles pr ON pr.id = r.asked_by
   WHERE public.fn_hr_salary_revision_can_see(r.staff_id, r.institution_id, r.department_id, r.asked_by)
     AND (p_view <> 'mine' OR r.asked_by = v_uid)
     AND (p_view <> 'college' OR (
           r.status = 'waiting_principal'
           AND r.institution_id = ANY (public.fn_my_staff_institution_ids())
           AND NOT (r.staff_id = ANY (public.fn_my_staff_ids()))))
   ORDER BY CASE r.status WHEN 'waiting_director' THEN 0 WHEN 'waiting_principal' THEN 1
                          WHEN 'approved' THEN 2 ELSE 3 END,
            r.created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_list(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_list(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Comments follow the request's own visibility, explicitly
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_salary_revision_comments_select ON public.hr_salary_revision_comments;
CREATE POLICY hr_salary_revision_comments_select ON public.hr_salary_revision_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r
                  WHERE r.id = request_id
                    AND public.fn_hr_salary_revision_can_see(r.staff_id, r.institution_id, r.department_id, r.asked_by)));

NOTIFY pgrst, 'reload schema';
