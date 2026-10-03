-- ============================================================================
-- 20270613101117_hr_leave_deadline_enforcement.sql
-- HR staff harness, lane A (Director-approved build, 2026-10-01):
-- enforce the leave deadlines that are stored but never enforced.
-- ----------------------------------------------------------------------------
-- 1. LEAVE ESCALATION. Every approval step carries `escalate_after_hours`
--    (default 48, editable in the flow editor) and 19 screens already treat
--    status 'escalated' as open — but no code ever set it. From now on an
--    hourly job (app/api/cron/hr/leave-escalations) finds each pending request
--    whose CURRENT step has waited past its own limit and:
--      * marks the request 'escalated' — ONCE; the request stays open, every
--        approver who could act still can, and a review step that advances
--        leaves it 'escalated' (the status says "this request has been late
--        at least once", never "it is now someone else's");
--      * records the escalation, per STEP, in hr_leave_deadline_nudges — who
--        was told and when. That row is also the idempotency key, so a step is
--        escalated at most once however often the job runs;
--      * tells the current approver(s) and the next level in-app.
--
--    WHAT "ESCALATED" MEANS, precisely: status 'escalated' = open and at least
--    one step has overrun its limit. It is NOT a new owner, NOT a decision, and
--    does not move current_step. Every reader that treats ('pending',
--    'escalated') as open keeps working unchanged; the three SQL digests below
--    that counted only 'pending' as overdue are widened so the late requests do
--    not vanish from the very counters meant to show them.
--
-- 2. COMP-OFF EXPIRY NUDGES. fn_hr_comp_off_reject_expired_claims (nightly,
--    pg_cron) is NOT changed. A daily job now nudges the approvers 7 days and
--    2 days before an undecided claim's credit expires, and tells the claimant
--    when the nightly job closed their claim. Same ledger, same idempotency.
--
-- 3. The comp-off job is a dispatcher routine (daily, 09:17 IST, editable at
--    /admin/ai-routines). The escalation job is hourly, which
--    ai_routine_schedules cannot express (one minute_of_day), so it is a
--    vercel.json cron like every other sub-daily job.
--
-- Every new SECURITY DEFINER function is service_role only: the cron routes
-- call them with the service key; no signed-in user needs them.
--
-- NOT APPLIED by merging — the production apply is a separate step.
-- No BEGIN;/COMMIT; (rollback-rehearsal safe). Re-runnable.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The ledger: one row per escalation / nudge sent
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_deadline_nudges (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 text NOT NULL CHECK (kind IN (
                         'leave_escalation',
                         'comp_off_expiry_7d',
                         'comp_off_expiry_2d',
                         'comp_off_lapsed')),
  leave_application_id uuid REFERENCES public.hr_leave_applications(id) ON DELETE CASCADE,
  comp_off_credit_id   uuid REFERENCES public.hr_comp_off_credits(id) ON DELETE CASCADE,
  -- 0-based index into approval_chain (the same number as current_step).
  step_index           integer,
  due_at               timestamptz,
  notified_user_ids    uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  -- 'escalated' | 'status_refused' | 'recorded'
  outcome              text NOT NULL,
  detail               text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_deadline_nudges_one_subject
    CHECK (num_nonnulls(leave_application_id, comp_off_credit_id) = 1),
  CONSTRAINT hr_leave_deadline_nudges_leave_has_step
    CHECK (kind <> 'leave_escalation'
           OR (leave_application_id IS NOT NULL AND step_index IS NOT NULL)),
  CONSTRAINT hr_leave_deadline_nudges_comp_off_kind
    CHECK (kind = 'leave_escalation' OR comp_off_credit_id IS NOT NULL)
);

COMMENT ON TABLE public.hr_leave_deadline_nudges IS
  'HR staff harness: one row per leave-step escalation or comp-off expiry nudge actually sent, with who was told. Also the idempotency key — a step is escalated, and a claim nudged per window, at most once.';

-- The idempotency keys. ON CONFLICT DO NOTHING in the record functions below
-- relies on these, so they are unique, not merely indexed.
CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_deadline_nudges_leave_step_uq
  ON public.hr_leave_deadline_nudges (leave_application_id, step_index)
  WHERE kind = 'leave_escalation';
CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_deadline_nudges_comp_off_uq
  ON public.hr_leave_deadline_nudges (comp_off_credit_id, kind)
  WHERE comp_off_credit_id IS NOT NULL;

ALTER TABLE public.hr_leave_deadline_nudges ENABLE ROW LEVEL SECURITY;

-- Read: whoever can see the request or claim can see its escalation history —
-- the EXISTS runs hla_select / hcoc_select as the caller (the hde_select
-- pattern of hr_decision_emails). Write: nobody through the API; the service
-- role writes through the functions below.
DROP POLICY IF EXISTS hldn_select ON public.hr_leave_deadline_nudges;
CREATE POLICY hldn_select ON public.hr_leave_deadline_nudges
  FOR SELECT TO authenticated
  USING (
    (leave_application_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.hr_leave_applications a
      WHERE a.id = hr_leave_deadline_nudges.leave_application_id))
    OR
    (comp_off_credit_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.hr_comp_off_credits c
      WHERE c.id = hr_leave_deadline_nudges.comp_off_credit_id))
  );

REVOKE ALL ON public.hr_leave_deadline_nudges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hr_leave_deadline_nudges TO authenticated;
GRANT ALL ON public.hr_leave_deadline_nudges TO service_role;


-- ---------------------------------------------------------------------------
-- 2. Who is on approved leave today (IST)
-- ---------------------------------------------------------------------------
-- A chase never reaches someone on approved leave. Full or half day counts; a
-- few hours of short time off does not. profiles.id in, profiles.id out.
CREATE OR REPLACE FUNCTION public.fn_hr_profiles_on_leave_today(p_user_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT s.profile_id), ARRAY[]::uuid[])
  FROM public.hr_leave_applications a
  JOIN public.staff s ON s.id = a.employee_id
  WHERE s.profile_id = ANY (COALESCE(p_user_ids, ARRAY[]::uuid[]))
    AND a.status = 'approved'
    AND a.superseded_by IS NULL
    AND a.duration_type IS DISTINCT FROM 'hourly'
    AND (now() AT TIME ZONE 'Asia/Kolkata')::date BETWEEN a.start_date AND a.end_date;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_profiles_on_leave_today(uuid[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_profiles_on_leave_today(uuid[]) TO service_role;


-- ---------------------------------------------------------------------------
-- 3. Who holds one step of a frozen chain
-- ---------------------------------------------------------------------------
-- The INVERSE of fn_leave_step_admits for a job with no auth.uid(): every
-- person that step's approver set names, confined the way the gate confines
-- them.
--   * a PINNED approver is named outright, from any institution (the gate
--     exempts a pinned person from every scope test);
--   * a ROLE is expanded to its active holders, confined by the role's
--     hr_leave_approver_scopes level (default 'institution', as in
--     fn_hr_leave_scope_admits): 'group' = every holder; 'institution' =
--     holders working in, or explicitly granted, the applicant's institution;
--     'department' = holders in the applicant's institution AND department,
--     and nobody at all when the applicant holds an institution/group-level
--     role themselves (a HOD never decides a Principal's leave);
--   * a step naming nobody, or only a placeholder role such as 'hr_approver'
--     that matches no custom_roles row, yields NOBODY — "any permitted
--     approver" cannot be enumerated, and the caller falls back to HR.
-- The applicant is never returned: nobody is chased to decide their own leave.
--
-- Unlike hr_leave_step_approver_user_ids (the submit notifier), this reads the
-- multi-approver `approvers` array through fn_leave_step_approvers and applies
-- the department scope, and it takes the step to read rather than always the
-- current one.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_step_holders(
  p_application_id uuid,
  p_step_index     integer
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH app AS (
    SELECT a.approval_chain -> p_step_index AS step,
           s.institution_id AS inst,
           s.department_id  AS dept,
           s.profile_id     AS applicant_uid
    FROM public.hr_leave_applications a
    LEFT JOIN public.staff s ON s.id = a.employee_id
    WHERE a.id = p_application_id
      AND p_step_index IS NOT NULL
      AND p_step_index >= 0
  ),
  entries AS (
    SELECT e.approver_user_id, e.approver_role, app.inst, app.dept, app.applicant_uid,
           COALESCE(sc.scope_level, 'institution') AS scope_level
    FROM app
    CROSS JOIN LATERAL public.fn_leave_step_approvers(app.step) e
    LEFT JOIN public.hr_leave_approver_scopes sc ON sc.role_key = e.approver_role
    WHERE app.step IS NOT NULL
      AND jsonb_typeof(app.step) = 'object'
  ),
  holders AS (
    SELECT x.approver_user_id AS uid, x.applicant_uid
    FROM entries x
    WHERE x.approver_user_id IS NOT NULL

    UNION

    SELECT ur.user_id, x.applicant_uid
    FROM entries x
    JOIN public.custom_roles cr ON cr.role_key = x.approver_role AND cr.is_active
    JOIN public.user_roles ur   ON ur.role_id = cr.id
    JOIN public.profiles p      ON p.id = ur.user_id
    WHERE x.approver_user_id IS NULL
      AND COALESCE(p.is_active, true)
      AND NOT COALESCE(p.is_login_disabled, false)
      AND (
            x.scope_level = 'group'
         OR (x.scope_level = 'institution' AND x.inst IS NOT NULL AND (
               EXISTS (SELECT 1 FROM public.staff st
                       WHERE st.profile_id = ur.user_id AND COALESCE(st.is_active, true)
                         AND st.institution_id = x.inst)
               OR EXISTS (SELECT 1 FROM public.user_institution_access uia
                          WHERE uia.user_id = ur.user_id AND uia.is_active
                            AND uia.institution_id = x.inst)))
         OR (x.scope_level = 'department' AND x.inst IS NOT NULL AND x.dept IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.staff st
                         WHERE st.profile_id = ur.user_id AND COALESCE(st.is_active, true)
                           AND st.institution_id = x.inst
                           AND st.department_id = x.dept)
             AND NOT EXISTS (
               SELECT 1
               FROM public.user_roles ur3
               JOIN public.custom_roles cr3 ON cr3.id = ur3.role_id AND cr3.is_active
               JOIN public.hr_leave_approver_scopes sc3 ON sc3.role_key = cr3.role_key
               WHERE ur3.user_id = x.applicant_uid
                 AND sc3.scope_level IN ('institution', 'group')))
      )
  )
  SELECT COALESCE(array_agg(DISTINCT h.uid), ARRAY[]::uuid[])
  FROM holders h
  WHERE h.uid IS NOT NULL
    AND h.uid IS DISTINCT FROM h.applicant_uid;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_step_holders(uuid, integer) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_step_holders(uuid, integer) TO service_role;


-- ---------------------------------------------------------------------------
-- 4. The HR tier: holders of hr.leave.approve who reach an HR organisation
-- ---------------------------------------------------------------------------
-- Since 20260831150000 the key is held only by the HR Head (plus the MD), so
-- this is "the HR head" without naming a role in SQL. Reach mirrors
-- role_has_institution_access: a role with institution_scope 'all', the
-- person's own institution, or an explicit user_institution_access grant.
-- Super admins are EXCLUDED on purpose: the harness's guardrail is that the
-- Director receives a weekly digest, never per-item alerts.
-- NOT mirrored: the legacy profiles.role fallback, the Director-handover arm
-- of user_has_permission, and CAS sibling institutions — none of them belongs
-- in a chase list.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_approve_key_holders(p_hr_organization_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  CROSS JOIN public.user_roles ur
  JOIN public.custom_roles cr ON cr.id = ur.role_id
                             AND cr.is_active
                             AND (cr.permissions ->> 'hr.leave.approve')::boolean IS TRUE
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE o.id = p_hr_organization_id
    AND COALESCE(p.is_active, true)
    AND NOT COALESCE(p.is_login_disabled, false)
    AND NOT COALESCE(p.is_super_admin, false)
    AND (
          EXISTS (SELECT 1 FROM public.user_roles ur2
                  JOIN public.custom_roles cr2 ON cr2.id = ur2.role_id
                  WHERE ur2.user_id = ur.user_id AND cr2.institution_scope = 'all')
       OR p.institution_id = o.institution_id
       OR EXISTS (SELECT 1 FROM public.staff st
                  WHERE st.profile_id = ur.user_id AND COALESCE(st.is_active, true)
                    AND st.institution_id = o.institution_id)
       OR EXISTS (SELECT 1 FROM public.user_institution_access uia
                  WHERE uia.user_id = ur.user_id AND uia.is_active
                    AND uia.institution_id = o.institution_id)
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_approve_key_holders(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_approve_key_holders(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 5. Everyone an escalation could reach, by tier, with today's leave flag
-- ---------------------------------------------------------------------------
--   'current' — holders of the step the request is waiting on;
--   'final'   — holders of the FINAL step, only while the request is below
--               it. The final approver may approve at any point
--               (fn_hr_leave_can_finalize), so they are the next level that
--               can actually act, not the step directly above;
--   'hr'      — the HR tier (section 4), the fallback when there is no final
--               step above, or nobody on it can be reached.
-- Which tier is told is decided in TypeScript
-- (lib/hr/leave/deadline-harness.ts, pickEscalationRecipients) so the rule is
-- unit-tested; this only reports who exists and who is on leave today.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_escalation_recipients(p_application_id uuid)
RETURNS TABLE (tier text, user_id uuid, on_leave_today boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_app   record;
  v_final integer;
BEGIN
  SELECT a.current_step, a.approval_chain, a.hr_organization_id, s.profile_id AS applicant_uid
    INTO v_app
  FROM public.hr_leave_applications a
  LEFT JOIN public.staff s ON s.id = a.employee_id
  WHERE a.id = p_application_id;

  IF NOT FOUND OR jsonb_typeof(v_app.approval_chain) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;

  v_final := public.fn_hr_leave_final_step_index(v_app.approval_chain);

  RETURN QUERY
  WITH t AS (
    SELECT 'current'::text AS t_tier, u AS t_uid
    FROM unnest(public.fn_hr_leave_step_holders(p_application_id, COALESCE(v_app.current_step, 0))) u
    UNION ALL
    SELECT 'final'::text, u
    FROM unnest(CASE WHEN v_final > COALESCE(v_app.current_step, 0)
                     THEN public.fn_hr_leave_step_holders(p_application_id, v_final)
                     ELSE ARRAY[]::uuid[] END) u
    UNION ALL
    SELECT 'hr'::text, u
    FROM unnest(public.fn_hr_leave_approve_key_holders(v_app.hr_organization_id)) u
  ),
  away AS (
    SELECT unnest(public.fn_hr_profiles_on_leave_today(
             ARRAY(SELECT DISTINCT t.t_uid FROM t))) AS a_uid
  )
  SELECT t.t_tier, t.t_uid, EXISTS (SELECT 1 FROM away WHERE away.a_uid = t.t_uid)
  FROM t
  WHERE t.t_uid IS NOT NULL
    AND t.t_uid IS DISTINCT FROM v_app.applicant_uid;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_escalation_recipients(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_escalation_recipients(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 6. Record one escalation — atomically, once per step
-- ---------------------------------------------------------------------------
-- Returns what happened; the caller notifies ONLY on 'escalated' or
-- 'status_refused':
--   'missing'        no such request;
--   'decided'        no longer open (approved, rejected, withdrawn, cancelled,
--                    superseded) — a decided request is never escalated;
--   'moved'          the request is no longer waiting on that step;
--   'locked'         its dates sit in a closed attendance month, so nobody can
--                    decide it. NOT recorded, so reopening the month re-arms it;
--   'already'        this step was escalated before (the ledger row exists);
--   'escalated'      recorded, and status is now 'escalated';
--   'status_refused' recorded, but a guard trigger refused the status change
--                    (e.g. the balance or period cap moved since the request
--                    was filed). The approver still has to act — usually to
--                    reject — so the caller still notifies.
-- The row lock serialises this with an approver deciding at the same moment:
-- whichever commits second sees the other's result.
-- ONLY the status column is written. approval_chain is never touched, so this
-- cannot race a decision into the chain, and the chain-guard and approver-gate
-- triggers have nothing to object to.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_record_escalation(
  p_application_id uuid,
  p_step_index     integer,
  p_due_at         timestamptz,
  p_notified       uuid[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app  record;
  v_inst uuid;
  v_id   uuid;
BEGIN
  SELECT a.* INTO v_app
  FROM public.hr_leave_applications a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_app.status NOT IN ('pending', 'escalated')
     OR v_app.superseded_by IS NOT NULL
     OR v_app.final_decided_at IS NOT NULL THEN
    RETURN 'decided';
  END IF;

  IF v_app.current_step IS DISTINCT FROM p_step_index
     OR jsonb_typeof(v_app.approval_chain -> p_step_index) IS DISTINCT FROM 'object'
     OR COALESCE(v_app.approval_chain -> p_step_index ->> 'status', 'pending') <> 'pending' THEN
    RETURN 'moved';
  END IF;

  -- Mirrors hr_trig_block_leave_in_locked_period's predicate.
  SELECT s.institution_id INTO v_inst FROM public.staff s WHERE s.id = v_app.employee_id;
  IF v_inst IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.hr_attendance_periods ap
       WHERE ap.institution_id = v_inst
         AND ap.status = 'locked'
         AND make_date(ap.period_year, ap.period_month, 1) <= v_app.end_date
         AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_app.start_date) THEN
    RETURN 'locked';
  END IF;

  INSERT INTO public.hr_leave_deadline_nudges
    (kind, leave_application_id, step_index, due_at, notified_user_ids, outcome)
  VALUES
    ('leave_escalation', p_application_id, p_step_index, p_due_at,
     COALESCE(p_notified, ARRAY[]::uuid[]), 'escalated')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN 'already';
  END IF;

  IF v_app.status = 'pending' THEN
    BEGIN
      UPDATE public.hr_leave_applications
         SET status = 'escalated'
       WHERE id = p_application_id
         AND status = 'pending';
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.hr_leave_deadline_nudges
         SET outcome = 'status_refused', detail = SQLERRM, updated_at = now()
       WHERE id = v_id;
      RETURN 'status_refused';
    END;
  END IF;

  RETURN 'escalated';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_record_escalation(uuid, integer, timestamptz, uuid[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_record_escalation(uuid, integer, timestamptz, uuid[]) TO service_role;


-- ---------------------------------------------------------------------------
-- 7. Comp-off: who to tell, and record a nudge once
-- ---------------------------------------------------------------------------
-- A comp-off claim has no approval chain: hcoc_update admits holders of
-- hr.leave.approve in the claim's organisation, so they are the approvers
-- ('approver' tier, section 4's list minus the claimant). 'claimant' is the
-- person who claimed, for the lapse notice.
CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_nudge_recipients(p_credit_id uuid)
RETURNS TABLE (tier text, user_id uuid, on_leave_today boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_c record;
BEGIN
  SELECT c.hr_organization_id, s.profile_id AS claimant_uid
    INTO v_c
  FROM public.hr_comp_off_credits c
  LEFT JOIN public.staff s ON s.id = c.employee_id
  WHERE c.id = p_credit_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH t AS (
    SELECT 'approver'::text AS t_tier, u AS t_uid
    FROM unnest(public.fn_hr_leave_approve_key_holders(v_c.hr_organization_id)) u
    WHERE u IS DISTINCT FROM v_c.claimant_uid
    UNION ALL
    SELECT 'claimant'::text, v_c.claimant_uid
    WHERE v_c.claimant_uid IS NOT NULL
  ),
  away AS (
    SELECT unnest(public.fn_hr_profiles_on_leave_today(
             ARRAY(SELECT DISTINCT t.t_uid FROM t))) AS a_uid
  )
  SELECT t.t_tier, t.t_uid, EXISTS (SELECT 1 FROM away WHERE away.a_uid = t.t_uid)
  FROM t;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_comp_off_nudge_recipients(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_comp_off_nudge_recipients(uuid) TO service_role;

-- Returns 'recorded' (send it), 'already' (sent before), 'stale' (the claim is
-- no longer in the state the nudge is about) or 'missing'. Never updates the
-- claim itself, so trg_hcoc_block_locked_period and the revoke gate are never
-- involved.
CREATE OR REPLACE FUNCTION public.fn_hr_comp_off_record_nudge(
  p_credit_id uuid,
  p_kind      text,
  p_notified  uuid[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_c     record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_id    uuid;
BEGIN
  IF p_kind NOT IN ('comp_off_expiry_7d', 'comp_off_expiry_2d', 'comp_off_lapsed') THEN
    RAISE EXCEPTION 'Unknown comp-off nudge kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_c FROM public.hr_comp_off_credits c WHERE c.id = p_credit_id;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF p_kind = 'comp_off_lapsed' THEN
    -- Only the nightly auto-reject (fn_hr_comp_off_reject_expired_claims):
    -- no person decided it, and its reason text is fixed.
    IF v_c.status <> 'rejected'
       OR v_c.approved_by IS NOT NULL
       OR COALESCE(v_c.rejection_reason, '') NOT LIKE 'Automatically rejected: not approved before%' THEN
      RETURN 'stale';
    END IF;
  ELSE
    IF v_c.status <> 'pending' OR v_c.source <> 'claim' OR v_c.expires_on < v_today THEN
      RETURN 'stale';
    END IF;
  END IF;

  INSERT INTO public.hr_leave_deadline_nudges
    (kind, comp_off_credit_id, notified_user_ids, outcome)
  VALUES
    (p_kind, p_credit_id, COALESCE(p_notified, ARRAY[]::uuid[]), 'recorded')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN CASE WHEN v_id IS NULL THEN 'already' ELSE 'recorded' END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_comp_off_record_nudge(uuid, text, uuid[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_comp_off_record_nudge(uuid, text, uuid[]) TO service_role;


-- ---------------------------------------------------------------------------
-- 8. Keep the late requests in the counters that exist to show them
-- ---------------------------------------------------------------------------
-- Three SQL generators count "leave pending longer than 24/48 hours" with
-- `la.status = 'pending'`. Once this job escalates a request at 48 hours, those
-- are EXACTLY the rows that would drop out. Each is widened to
-- ('pending', 'escalated').
--
-- CARRIED FORWARD FROM THE LIVE DEFINITION, not retyped: the body is read with
-- pg_get_functiondef and only that one predicate is replaced, so no later fix
-- to these long functions can be reverted by this file. Exactly one match is
-- required per function; anything else stops the migration. A function that
-- already carries the widened predicate is left alone (re-runnable). Grants
-- survive CREATE OR REPLACE and are not touched.
DO $$
DECLARE
  v_fn   text;
  v_def  text;
  v_old  constant text := 'la.status = ''pending''';
  v_new  constant text := 'la.status IN (''pending'', ''escalated'')';
  v_hits integer;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'fn_generate_pending_leave_approval_items',
    'fn_generate_hr_command_center_brief_items',
    'fn_generate_super_admin_daily_digest'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn AND p.pronargs = 0;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'public.%() not found; cannot widen its leave-overdue count', v_fn;
    END IF;

    v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);

    IF v_hits = 0 AND position(v_new IN v_def) > 0 THEN
      CONTINUE; -- already widened
    END IF;

    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'public.%() has % copies of "%" (expected exactly 1); widen it by hand',
        v_fn, v_hits, v_old;
    END IF;

    EXECUTE replace(v_def, v_old, v_new);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 9. The daily comp-off routine on the AI-routine dispatcher
-- ---------------------------------------------------------------------------
-- 09:17 IST every day (minute_of_day 557 — the dispatcher floors it to the
-- 09:15 slot). Morning, so a nudge lands when approvers are at work, and after
-- the 00:20 IST auto-reject so the lapse notice follows the same night's run.
-- The registry entry ships in lib/ai-routines/platform-ops.ts in the same PR.
-- ON CONFLICT DO NOTHING: a re-run never clobbers a time retuned on
-- /admin/ai-routines.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('hr-comp-off-expiry-nudges', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 557, false)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'hr-comp-off-expiry-nudges';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'hr-comp-off-expiry-nudges schedule row missing after seed (count=%)', v_count;
  END IF;
END $$;
