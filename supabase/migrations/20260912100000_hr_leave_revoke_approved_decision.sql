-- =====================================================================================
-- HR Leave — revoke an APPROVED decision (2026-09-12)
-- =====================================================================================
--
-- An approval was terminal. A final approver who granted a request by mistake had no
-- way back: the balance stayed drawn down, the comp-off credit stayed spent, and
-- hr_attendance_records kept reading LEAVE for a day that was no longer leave — which
-- is the table the monthly report and payroll read.
--
-- A revocation is an approved -> rejected transition. Almost every consequence of that
-- transition is ALREADY implemented and must not be rebuilt here:
--
--   hr_trig_update_leave_balance   restores `used` on approved -> rejected
--   hr_trig_comp_off_consume       returns a consumed credit to 'approved'
--   fn_trg_hr_leave_applications_duty_log logs the counselor back on duty
--   trg_hla_block_locked_period    refuses ANY write overlapping a locked month
--
-- What was missing is a GATE (who may do it, and until when), an AUDIT TRAIL (this row
-- was approved and then taken back, by whom and why) and a NOTIFICATION. This migration
-- adds those three. The attendance un-stamp lives in TypeScript — the day evaluator is
-- lib/hr/biometric/evaluate-day.ts and cannot be called from plpgsql — and is awaited in
-- app/api/hr/leave/applications/[id]/revoke/route.ts.
--
-- THE MONTH CLOSE IS THE DEADLINE. Once hr_attendance_periods.status = 'locked' for the
-- applicant's institution and month, nothing about that month may move: not a new
-- request, not a decision, and not a revocation. That wall already exists
-- (trg_hla_block_locked_period); the predicate below reads it up front so the approver
-- is told which month is closed instead of meeting a raw trigger error after the click.
-- =====================================================================================


-- -------------------------------------------------------------------------------------
-- 1. Audit columns
--
-- The status stays 'rejected' — inside the existing CHECK, understood by every trigger,
-- report and filter already written. `revoked_at IS NOT NULL` is the ONE fact that
-- separates "approved, then taken back" from "refused on day one", which are materially
-- different things to the applicant and must not render identically.
-- -------------------------------------------------------------------------------------
ALTER TABLE public.hr_leave_applications
  ADD COLUMN IF NOT EXISTS revoked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS revoke_reason text;

ALTER TABLE public.hr_comp_off_credits
  ADD COLUMN IF NOT EXISTS revoked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS revoke_reason text;

COMMENT ON COLUMN public.hr_leave_applications.revoked_at IS
  'Set when an APPROVED request was taken back. status is ''rejected''; this is what tells a revocation apart from an ordinary rejection.';
COMMENT ON COLUMN public.hr_comp_off_credits.revoked_at IS
  'Set when an APPROVED credit claim was taken back. status is ''rejected''.';


-- -------------------------------------------------------------------------------------
-- 2. Permission key — hr.leave.revoke
--
-- Granted to the roles that actually sit as the FINAL step of live leave chains
-- (principal 670, cao 505, hod 72, vice_principal 31 approvals in the last 12 months)
-- plus the two roles that hold hr.leave.approve today (hr_head, managing_director).
--
-- NONE of the four chain roles holds hr.leave.approve — which is exactly why declaring
-- the key without granting it here would produce a button that renders and then denies.
-- -------------------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('hr.leave.revoke', true),
       updated_at  = now()
 WHERE role_key IN ('hr_head', 'managing_director',
                    'principal', 'cao', 'vice_principal', 'hod');


-- -------------------------------------------------------------------------------------
-- 3. THE predicate — one rule, one wording
--
-- Returns NULL when the caller may revoke, otherwise the exact sentence the dialog shows
-- AND the trigger raises. A boolean would have forced the UI to invent its own
-- explanation, and two wordings of one rule is how this module previously shipped a
-- disabled button whose reason disagreed with the database's refusal.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_revoke_block_reason(p_application_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_app    record;
  v_inst   uuid;
  v_locked record;
  v_idx    integer;
  v_sa     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'You must be signed in to revoke a request.';
  END IF;

  SELECT a.id, a.status, a.employee_id, a.hr_organization_id,
         a.start_date, a.end_date, a.approval_chain
    INTO v_app
  FROM public.hr_leave_applications a
  WHERE a.id = p_application_id;

  IF NOT FOUND THEN
    RETURN 'That request no longer exists.';
  END IF;

  IF v_app.status <> 'approved' THEN
    RETURN 'Only an approved request can be revoked — this one is ' || v_app.status || '.';
  END IF;

  v_sa := public.is_super_admin();

  -- A super admin is exempt from the self-decision bar exactly as
  -- hr_trig_leave_enforce_approver is; refusing them here would refuse what the
  -- database is about to accept.
  IF NOT v_sa
     AND v_app.employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[])) THEN
    RETURN 'You cannot revoke your own request.';
  END IF;

  -- THE DEADLINE. Same overlap test trg_hla_block_locked_period applies, read up front so
  -- the approver is told which month is closed rather than meeting the raw trigger error.
  -- There is deliberately NO override, super admin included: reopening the month is the
  -- documented route (fn_hr_reopen_attendance_period).
  SELECT s.institution_id INTO v_inst
    FROM public.staff s WHERE s.id = v_app.employee_id;

  IF v_inst IS NOT NULL THEN
    SELECT ap.period_year, ap.period_month, ap.locked_at
      INTO v_locked
      FROM public.hr_attendance_periods ap
     WHERE ap.institution_id = v_inst
       AND ap.status = 'locked'
       AND make_date(ap.period_year, ap.period_month, 1) <= v_app.end_date
       AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_app.start_date
     LIMIT 1;

    IF FOUND THEN
      RETURN format(
        'Attendance for %s-%s is closed (locked %s). Reopen the month before revoking this request.',
        v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
        to_char(v_locked.locked_at, 'DD Mon YYYY'));
    END IF;
  END IF;

  IF v_sa THEN
    RETURN NULL;
  END IF;

  -- AUTHORITY. The final step of the FROZEN chain, whoever it names — a role, a pinned
  -- person, or the org catch-all. current_step is useless here: it has already advanced
  -- past the final step, which is why fn_is_designated_leave_approver (and therefore the
  -- hla_update policy) stops admitting the very person who granted the request.
  v_idx := public.fn_hr_leave_final_step_index(v_app.approval_chain);
  IF v_idx >= 0
     AND public.fn_leave_step_admits(
           v_app.approval_chain -> v_idx, v_uid,
           v_app.hr_organization_id, v_app.employee_id) THEN
    RETURN NULL;
  END IF;

  -- The HR lane, independent of the chain: a holder of the new key, in the applicant's
  -- organisation. Kept separate rather than ANDed with the chain test — requiring both
  -- would lock out every pinned approver who holds none of the granted roles, and every
  -- 'hr_approver' catch-all step, which is not a role at all.
  IF public.user_has_permission('hr.leave.revoke')
     AND v_app.hr_organization_id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[])) THEN
    RETURN NULL;
  END IF;

  RETURN 'Only the final approver of this request, or HR, may revoke it.';
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_leave_can_revoke(p_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.fn_hr_leave_revoke_block_reason(p_application_id) IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_leave_revoke_block_reason(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_leave_can_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_revoke_block_reason(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_can_revoke(uuid) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 4. The comp-off twin
--
-- A credit claim has NO approval chain — hcoc_update gates on hr.leave.approve in the
-- organisation and nothing else — so authority here is the key, not a step.
--
-- The extra rule is consumption: a credit already spent by a booked leave cannot be
-- taken back on its own, or that leave is left standing on a credit that no longer
-- exists. The message names the leave so the approver knows what to revoke first;
-- revoking THAT returns the credit to 'approved' through hr_trig_comp_off_consume.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_revoke_block_reason(p_credit_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_credit record;
  v_leave  record;
  v_inst   uuid;
  v_locked record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'You must be signed in to revoke a claim.';
  END IF;

  SELECT c.id, c.status, c.employee_id, c.hr_organization_id,
         c.worked_date, c.consumed_by_application_id
    INTO v_credit
  FROM public.hr_comp_off_credits c
  WHERE c.id = p_credit_id;

  IF NOT FOUND THEN
    RETURN 'That claim no longer exists.';
  END IF;

  IF v_credit.status = 'consumed' THEN
    SELECT a.start_date, a.end_date INTO v_leave
      FROM public.hr_leave_applications a
     WHERE a.id = v_credit.consumed_by_application_id;

    IF FOUND THEN
      RETURN format(
        'This credit was already used by the compensatory off booked for %s to %s. Revoke that leave first — doing so returns the credit — then revoke this claim.',
        to_char(v_leave.start_date, 'DD/MM/YYYY'), to_char(v_leave.end_date, 'DD/MM/YYYY'));
    END IF;
    RETURN 'This credit was already used by a booked compensatory off. Revoke that leave first, which returns the credit.';
  END IF;

  IF v_credit.status <> 'approved' THEN
    RETURN 'Only an approved claim can be revoked — this one is ' || v_credit.status || '.';
  END IF;

  IF NOT public.is_super_admin()
     AND v_credit.employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[])) THEN
    RETURN 'You cannot revoke your own claim.';
  END IF;

  SELECT s.institution_id INTO v_inst
    FROM public.staff s WHERE s.id = v_credit.employee_id;

  IF v_inst IS NOT NULL THEN
    SELECT ap.period_year, ap.period_month, ap.locked_at
      INTO v_locked
      FROM public.hr_attendance_periods ap
     WHERE ap.institution_id = v_inst
       AND ap.status = 'locked'
       AND make_date(ap.period_year, ap.period_month, 1) <= v_credit.worked_date
       AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_credit.worked_date
     LIMIT 1;

    IF FOUND THEN
      RETURN format(
        'Attendance for %s-%s is closed (locked %s). Reopen the month before revoking this claim.',
        v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
        to_char(v_locked.locked_at, 'DD Mon YYYY'));
    END IF;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NULL;
  END IF;

  IF (public.user_has_permission('hr.leave.revoke')
      OR public.user_has_permission('hr.leave.approve'))
     AND v_credit.hr_organization_id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[])) THEN
    RETURN NULL;
  END IF;

  RETURN 'You do not have permission to revoke compensatory off claims in this organisation.';
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_can_revoke(p_credit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.fn_hr_comp_off_revoke_block_reason(p_credit_id) IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_comp_off_revoke_block_reason(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_comp_off_can_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_comp_off_revoke_block_reason(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_comp_off_can_revoke(uuid) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 5. Enforcement
--
-- This closes a hole that exists TODAY, not one the feature opens: hla_update's WITH
-- CHECK and hr_trig_leave_enforce_approver between them already accept a PATCH of an
-- approved row to 'rejected' from a browser console — with no reason, no month check and
-- no reversal. The service layer refused it; nothing in the database did.
--
-- auth.uid() IS NULL means the service-role client (maintenance SQL, cron). The authority
-- half is skipped there exactly as hr_trig_leave_enforce_approver skips it; the month
-- lock is NOT skipped, because trg_hla_block_locked_period has no such exemption.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_leave_revoke_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_reason text;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    v_reason := public.fn_hr_leave_revoke_block_reason(NEW.id);
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.revoked_at := COALESCE(NEW.revoked_at, now());
  NEW.revoked_by := COALESCE(NEW.revoked_by, (SELECT auth.uid()));
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_hla_revoke_gate ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_revoke_gate
  BEFORE UPDATE ON public.hr_leave_applications
  FOR EACH ROW
  WHEN (OLD.status = 'approved' AND NEW.status = 'rejected')
  EXECUTE FUNCTION public.hr_trig_leave_revoke_gate();

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_revoke_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_reason text;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    v_reason := public.fn_hr_comp_off_revoke_block_reason(NEW.id);
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.revoked_at := COALESCE(NEW.revoked_at, now());
  NEW.revoked_by := COALESCE(NEW.revoked_by, (SELECT auth.uid()));
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_hcoc_revoke_gate ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_revoke_gate
  BEFORE UPDATE ON public.hr_comp_off_credits
  FOR EACH ROW
  WHEN (OLD.status = 'approved' AND NEW.status = 'rejected')
  EXECUTE FUNCTION public.hr_trig_comp_off_revoke_gate();

-- Supabase grants EXECUTE to anon/authenticated on every new function, TRIGGER
-- functions included, which publishes them at /rest/v1/rpc/<name>. Postgres
-- refuses a direct call ("trigger functions can only be called as triggers",
-- 0A000) so this is not exploitable, but a SECURITY DEFINER function with a
-- public grant it does not need is exactly the drift the security advisor exists
-- to catch. The triggers themselves run as the table owner and need no grant.
REVOKE ALL ON FUNCTION public.hr_trig_leave_revoke_gate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_trig_comp_off_revoke_gate() FROM PUBLIC, anon, authenticated;


-- -------------------------------------------------------------------------------------
-- 6. RLS
--
-- Without this the trigger above never runs for the person it is written for. For an
-- APPROVED row hla_update admits only super admins, the applicant, and hr.leave.approve
-- holders: fn_is_designated_leave_approver tests approval_chain -> current_step, and
-- current_step has advanced PAST the final step the moment the request was granted. A
-- Principal who granted the leave is therefore refused by the policy itself, before any
-- trigger has an opinion.
-- -------------------------------------------------------------------------------------
DROP POLICY IF EXISTS hla_update ON public.hr_leave_applications;
CREATE POLICY hla_update ON public.hr_leave_applications
  FOR UPDATE
  USING (
    (SELECT public.is_super_admin())
    OR (employee_id IN (SELECT unnest(public.fn_my_staff_ids())))
    OR ((SELECT public.user_has_permission('hr.leave.approve'))
        AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
    OR public.fn_is_designated_leave_approver(id)
    OR public.fn_hr_leave_can_revoke(id)
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR ((status)::text <> ALL (ARRAY['approved'::text, 'rejected'::text]))
    OR ((SELECT public.user_has_permission('hr.leave.approve'))
        AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
    OR public.fn_is_designated_leave_approver(id)
    OR public.fn_hr_leave_can_revoke(id)
  );

DROP POLICY IF EXISTS hcoc_update ON public.hr_comp_off_credits;
CREATE POLICY hcoc_update ON public.hr_comp_off_credits
  FOR UPDATE
  USING (
    (SELECT public.is_super_admin())
    OR (((SELECT public.user_has_permission('hr.leave.approve'))
         OR (SELECT public.user_has_permission('hr.leave.revoke')))
        AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (((SELECT public.user_has_permission('hr.leave.approve'))
         OR (SELECT public.user_has_permission('hr.leave.revoke')))
        AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
        AND NOT (employee_id IN (SELECT unnest(public.fn_my_staff_ids()))))
  );


-- -------------------------------------------------------------------------------------
-- 7. The applicant's email
--
-- A revocation is NOT a rejection to the person receiving it: they had an approved leave
-- and have now lost it, often after planning around it. It gets its own decision value so
-- the template can say so, and so the outbox's (record, decision) unique index lets the
-- 'revoked' row sit beside the earlier 'approved' one instead of being swallowed by
-- ON CONFLICT DO NOTHING.
-- -------------------------------------------------------------------------------------
ALTER TABLE public.hr_decision_emails
  DROP CONSTRAINT IF EXISTS hr_decision_emails_decision_check;
ALTER TABLE public.hr_decision_emails
  ADD CONSTRAINT hr_decision_emails_decision_check
  CHECK (decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'revoked'::text]));

CREATE OR REPLACE FUNCTION public.hr_trig_enqueue_decision_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email    text;
  v_decision text;
BEGIN
  -- A person decided. pg_cron jobs and maintenance SQL carry no auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT nullif(btrim(s.institution_email), '')
    INTO v_email
    FROM public.staff s
   WHERE s.id = NEW.employee_id;

  -- approved -> rejected is a revocation, never a plain refusal.
  v_decision := CASE
    WHEN TG_OP = 'UPDATE'
         AND OLD.status = 'approved'
         AND NEW.status = 'rejected' THEN 'revoked'
    ELSE NEW.status::text
  END;

  IF TG_TABLE_NAME = 'hr_leave_applications' THEN
    INSERT INTO public.hr_decision_emails
      (leave_application_id, employee_id, decision, to_email, status, last_error)
    VALUES
      (NEW.id, NEW.employee_id, v_decision, v_email,
       CASE WHEN v_email IS NULL THEN 'skipped' ELSE 'pending' END,
       CASE WHEN v_email IS NULL THEN 'No institution email on the staff record' END)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.hr_decision_emails
      (comp_off_credit_id, employee_id, decision, to_email, status, last_error)
    VALUES
      (NEW.id, NEW.employee_id, v_decision, v_email,
       CASE WHEN v_email IS NULL THEN 'skipped' ELSE 'pending' END,
       CASE WHEN v_email IS NULL THEN 'No institution email on the staff record' END)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hla_zz_decision_email ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_zz_decision_email
  AFTER UPDATE OF status ON public.hr_leave_applications
  FOR EACH ROW
  WHEN (
    (OLD.status::text = ANY (ARRAY['pending'::text, 'escalated'::text])
     AND NEW.status::text = ANY (ARRAY['approved'::text, 'rejected'::text]))
    OR (OLD.status::text = 'approved' AND NEW.status::text = 'rejected')
  )
  EXECUTE FUNCTION public.hr_trig_enqueue_decision_email();

DROP TRIGGER IF EXISTS trg_hcoc_zz_decision_email ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_zz_decision_email
  AFTER UPDATE OF status ON public.hr_comp_off_credits
  FOR EACH ROW
  WHEN (
    NEW.source::text = 'claim'
    AND (
      (OLD.status::text = 'pending'
       AND NEW.status::text = ANY (ARRAY['approved'::text, 'rejected'::text]))
      OR (OLD.status::text = 'approved' AND NEW.status::text = 'rejected')
    )
  )
  EXECUTE FUNCTION public.hr_trig_enqueue_decision_email();


-- -------------------------------------------------------------------------------------
-- 8. The approvals queue carries the revocation
--
-- DROP + CREATE, not CREATE OR REPLACE: a RETURNS TABLE signature cannot change in place.
--
-- Three plain columns and one more LEFT JOIN on profiles. NOTHING role-resolving is added:
-- computing a per-row "can revoke" would call fn_leave_step_admits over ~976 approved
-- rows, which is precisely the shape that produced the 57014 statement timeouts on this
-- very function in Sep 2026. The row menu offers Revoke on the cheap test (approved and
-- not your own) and the dialog asks fn_hr_leave_revoke_block_reason for that one row —
-- the same per-row pattern useCanFinalizeLeave already uses.
-- -------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hr_leave_approval_queue();

CREATE OR REPLACE FUNCTION public.hr_leave_approval_queue()
RETURNS TABLE(
  id uuid, employee_id uuid, staff_name text, staff_code text,
  institution_id uuid, institution_name text,
  department_id uuid, department_name text,
  hr_organization_id uuid, hr_organization_name text,
  leave_type_id uuid, leave_type_name text, leave_type_code text, request_category text,
  start_date date, end_date date,
  start_time time without time zone, end_time time without time zone,
  duration_type text, duration_minutes integer, total_days numeric,
  reason text, is_emergency boolean, status text,
  created_at timestamp with time zone,
  applied_by uuid, applied_by_name text, applied_on_behalf boolean,
  final_approver_id uuid, final_approver_name text,
  final_decided_at timestamp with time zone, rejection_reason text,
  is_own boolean, can_decide boolean, waiting_on_me boolean,
  biometric_gap_from date, documents jsonb,
  current_step integer, chain_length integer, step_is_final boolean,
  revoked_at timestamp with time zone, revoked_by_name text, revoke_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_sa   boolean;
  v_orgs uuid[];
  v_mine uuid[];
  v_key  boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF NOT public.hr_can_approve_leave() THEN
    RAISE EXCEPTION 'You do not have permission to approve leave' USING ERRCODE = '42501';
  END IF;

  v_sa   := public.is_super_admin();
  v_orgs := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_mine := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);
  v_key  := public.user_has_permission('hr.leave.approve');

  RETURN QUERY
  SELECT
    a.id, a.employee_id,
    NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), '')::text,
    NULLIF(btrim(s.staff_id), '')::text,
    s.institution_id, i.name::text,
    s.department_id, d.department_name::text,
    a.hr_organization_id, o.name::text,
    a.leave_type_id, lt.leave_type_name::text, lt.leave_type_code::text,
    COALESCE(lt.request_category, 'leave')::text,
    a.start_date, a.end_date, a.start_time, a.end_time,
    a.duration_type::text, a.duration_minutes, a.total_days,
    a.reason, a.is_emergency, a.status::text, a.created_at, a.applied_by,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email)::text,
    (a.applied_by IS DISTINCT FROM s.profile_id),
    a.final_approver_id,
    COALESCE(NULLIF(btrim(fp.full_name), ''), fp.email)::text,
    a.final_decided_at, a.rejection_reason,
    (a.employee_id = ANY (v_mine)) AS is_own,
    (a.status IN ('pending','escalated') AND (v_sa OR a.employee_id <> ALL (v_mine))) AS can_decide,
    (
      a.status IN ('pending', 'escalated')
      AND (v_sa OR a.employee_id <> ALL (v_mine))
      AND (
        st.step IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.fn_leave_step_approvers(st.step) e
          LEFT JOIN public.custom_roles cr ON cr.role_key = e.approver_role AND cr.is_active
          WHERE e.approver_user_id IS NOT NULL OR cr.role_key IS NOT NULL
        )
        OR public.fn_leave_step_admits(st.step, v_uid, a.hr_organization_id, a.employee_id)
      )
    ) AS waiting_on_me,
    CASE
      WHEN a.status IN ('pending', 'escalated')
        THEN public.fn_hr_leave_biometric_gap(a.employee_id, a.leave_type_id, a.start_date, a.end_date)
      ELSE NULL
    END AS biometric_gap_from,
    COALESCE(a.documents, '[]'::jsonb) AS documents,
    a.current_step,
    jsonb_array_length(COALESCE(a.approval_chain, '[]'::jsonb)) AS chain_length,
    (a.current_step = public.fn_hr_leave_final_step_index(a.approval_chain)) AS step_is_final,
    a.revoked_at,
    COALESCE(NULLIF(btrim(rp.full_name), ''), rp.email)::text AS revoked_by_name,
    a.revoke_reason
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types   lt ON lt.id = a.leave_type_id
  LEFT JOIN public.staff            s  ON s.id  = a.employee_id
  LEFT JOIN public.institutions     i  ON i.id  = s.institution_id
  LEFT JOIN public.departments      d  ON d.id  = s.department_id
  LEFT JOIN public.hr_organizations o  ON o.id  = a.hr_organization_id
  LEFT JOIN public.profiles         p  ON p.id  = a.applied_by
  LEFT JOIN public.profiles         fp ON fp.id = a.final_approver_id
  LEFT JOIN public.profiles         rp ON rp.id = a.revoked_by
  CROSS JOIN LATERAL (SELECT a.approval_chain -> a.current_step AS step) st
  WHERE (
      a.status IN ('pending', 'escalated')
      OR a.final_decided_at >= now() - interval '12 months'
      OR (a.status IN ('withdrawn','cancelled') AND a.updated_at >= now() - interval '12 months')
    )
    AND (
      v_sa
      OR (v_key AND a.hr_organization_id = ANY (v_orgs))
      OR public.fn_is_designated_leave_approver(a.id)
    )
  ORDER BY a.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_leave_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approval_queue() TO authenticated, service_role;
