-- Only the FINAL step of an approval chain may approve a leave request.
--
-- A three-step flow (HOD reviews -> Principal reviews -> CAO approves) means
-- the first two record a review and pass the request on; only the third grants
-- the leave. The flow editor has written that intent since the multi-step
-- editor shipped -- every step carries step_type 'review' or 'final' -- but
-- NOTHING enforced it:
--
--   * LeaveService.approveApplication decided finality from the ARRAY END
--     (`nextStep >= chain.length`). That agrees with step_type only because the
--     editor happens to mark the last step final; a flow written through the
--     API, a migration, or a future editor that lets an admin choose would
--     approve on a step whose own configuration says "reviews".
--   * The database did not check at all. hla_update's WITH CHECK admits anyone
--     holding hr.leave.approve in the organisation, and
--     hr_trig_leave_enforce_approver validates only WHO sits on the CURRENT
--     step -- never whether that step is allowed to finalise. A reviewer on
--     step 1 could PATCH status='approved' directly and the row would take it.
--     A guard that lives only in a service method is decorative.
--
-- This migration puts the rule in the database and adds the one capability the
-- browser cannot answer for itself.

-- ---------------------------------------------------------------------------
-- 1. Which step grants the approval
-- ---------------------------------------------------------------------------
--
-- Mirrors finalStepIndex() in lib/hr/leave/approval-chain.ts exactly: the LAST
-- step marked 'final', else the last step. Both fallbacks exist to guarantee
-- termination -- a chain no step can finalise would leave every request pending
-- for ever, which is worse than finalising one step early. 1,124 of the 1,220
-- live chains predate step_type and depend on that fallback.
--
-- Returns -1 for an empty chain so callers can tell "no chain" from "step 0".

CREATE OR REPLACE FUNCTION public.fn_hr_leave_final_step_index(p_chain jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (
      SELECT max(t.ord::int - 1)
      FROM jsonb_array_elements(COALESCE(p_chain, '[]'::jsonb)) WITH ORDINALITY AS t(step, ord)
      WHERE t.step ->> 'step_type' = 'final'
    ),
    jsonb_array_length(COALESCE(p_chain, '[]'::jsonb)) - 1
  );
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_final_step_index(jsonb) IS
  'Index of the step that grants approval: the last one marked step_type=final, else the last step, -1 for an empty chain. Mirrors finalStepIndex() in lib/hr/leave/approval-chain.ts.';

-- ---------------------------------------------------------------------------
-- 2. A review step cannot approve the request
-- ---------------------------------------------------------------------------
--
-- The rule is expressed against the ROW BEING WRITTEN rather than against the
-- caller: whatever client wrote this update, the chain it is committing must
-- show the final step approved. A reviewer's decision lands on their own step,
-- so a reviewer simply cannot produce a row that satisfies this.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_final_step_approves()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_idx  integer;
  v_step jsonb;
BEGIN
  IF NOT (NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;

  v_idx := public.fn_hr_leave_final_step_index(NEW.approval_chain);

  IF v_idx < 0 THEN
    RAISE EXCEPTION
      'This request has no approval chain, so there is no approver who can grant it.'
      USING ERRCODE = 'P0001';
  END IF;

  v_step := NEW.approval_chain -> v_idx;

  IF COALESCE(v_step ->> 'status', '') <> 'approved' THEN
    RAISE EXCEPTION
      'Only step % grants this request; the earlier steps record a review and pass it on. Approve it from the final step.',
      v_idx + 1
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $function$;

-- Fires on every UPDATE, not just OF status: a client could otherwise land
-- 'approved' through a column list this trigger was not watching.
DROP TRIGGER IF EXISTS trg_hla_final_step_approves ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_final_step_approves
  BEFORE UPDATE ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_final_step_approves();

COMMENT ON FUNCTION public.hr_trig_leave_final_step_approves() IS
  'Refuses any transition to approved whose chain does not show the FINAL step approved. The database half of the review-vs-approve rule.';

-- ---------------------------------------------------------------------------
-- 3. May this caller approve now, ahead of the pending reviews?
-- ---------------------------------------------------------------------------
--
-- The final authority may approve at any point rather than waiting for the
-- reviews below it (decision 2026-09-05). Only Postgres can answer this: a step
-- routed to a ROLE is matched through user_roles / custom_roles, which an
-- ordinary member of staff cannot select, so a browser-side answer comes back
-- empty for exactly the people it is meant to admit -- the silent false
-- negative this module has already shipped twice.

CREATE OR REPLACE FUNCTION public.fn_hr_leave_can_finalize(p_application_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_idx integer;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT a.approval_chain, a.current_step, a.status, a.employee_id, a.hr_organization_id
    INTO v_app
  FROM public.hr_leave_applications a
  WHERE a.id = p_application_id;

  IF NOT FOUND OR v_app.status NOT IN ('pending', 'escalated') THEN
    RETURN false;
  END IF;

  v_idx := public.fn_hr_leave_final_step_index(v_app.approval_chain);
  IF v_idx < 0 THEN RETURN false; END IF;

  -- Already at (or past) the final step: this is the ordinary path, not a
  -- short-circuit, and the current-step gate already answers it.
  IF v_app.current_step >= v_idx THEN RETURN false; END IF;

  -- Same order as hr_trig_leave_enforce_approver: super admin first, so a
  -- super admin's own request stays decidable exactly as that trigger allows.
  IF public.is_super_admin() THEN RETURN true; END IF;

  IF v_app.employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[])) THEN
    RETURN false;
  END IF;

  RETURN public.fn_leave_step_admits(
    v_app.approval_chain -> v_idx, v_uid, v_app.hr_organization_id);
END $function$;

REVOKE ALL ON FUNCTION public.fn_hr_leave_can_finalize(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_can_finalize(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_hr_leave_can_finalize(uuid) IS
  'True when the caller is admitted by the chain FINAL step while the request still sits with an earlier reviewer — i.e. they may approve it directly.';

-- ---------------------------------------------------------------------------
-- 4. Admit the final approver at any step
-- ---------------------------------------------------------------------------
--
-- hr_trig_leave_enforce_approver validated the caller against the CURRENT step
-- only, so the CAO could not act until the HOD and the Principal had. The final
-- step's approvers are now admitted at any point; everything else is the
-- previous body verbatim.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_step jsonb;
  v_constraining int;
  v_matched int;
  v_labels text;
  v_deciding boolean;
  v_final int;
BEGIN
  v_deciding := (NEW.status IN ('approved','rejected') AND OLD.status IS DISTINCT FROM NEW.status)
             OR (COALESCE(NEW.current_step, 0) > COALESCE(OLD.current_step, 0));

  IF NOT v_deciding THEN RETURN NEW; END IF;
  IF public.is_super_admin() THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  IF OLD.employee_id IN (SELECT unnest(public.fn_my_staff_ids())) THEN
    RAISE EXCEPTION 'You cannot decide on your own leave application.';
  END IF;

  -- THE FINAL AUTHORITY MAY ACT AT ANY POINT. Without this the CAO on step 3
  -- is refused while the request sits on step 1, and a direct approval is
  -- impossible. Deliberately checked BEFORE the current-step test so it also
  -- covers a rejection by the final approver.
  v_final := public.fn_hr_leave_final_step_index(OLD.approval_chain);
  IF v_final >= 0
     AND public.fn_leave_step_admits(
           OLD.approval_chain -> v_final, v_uid, OLD.hr_organization_id) THEN
    RETURN NEW;
  END IF;

  v_step := OLD.approval_chain -> OLD.current_step;
  IF v_step IS NULL THEN RETURN NEW; END IF;

  WITH entries AS (
    SELECT
      (cr.role_key IS NOT NULL OR e.approver_user_id IS NOT NULL) AS constraining,
      (
        e.approver_user_id = v_uid
        OR (cr.role_key IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              JOIN public.custom_roles cr2 ON cr2.id = ur.role_id
              WHERE ur.user_id = v_uid AND cr2.role_key = e.approver_role AND cr2.is_active
            ))
      ) AS matched,
      COALESCE(cr.role_name, 'the assigned approver') AS label
    FROM public.fn_leave_step_approvers(v_step) e
    LEFT JOIN public.custom_roles cr ON cr.role_key = e.approver_role AND cr.is_active
  )
  SELECT count(*) FILTER (WHERE constraining), count(*) FILTER (WHERE matched),
         string_agg(DISTINCT label, ' or ')
  INTO v_constraining, v_matched, v_labels
  FROM entries;

  IF COALESCE(v_constraining, 0) = 0 THEN RETURN NEW; END IF;
  IF COALESCE(v_matched, 0) > 0 THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'This approval step is reserved for %.', COALESCE(v_labels, 'a different approver');
END
$function$;

-- ---------------------------------------------------------------------------
-- 5. The queue reports the stage
-- ---------------------------------------------------------------------------
--
-- The approvals table could not tell a review step from a final one, so every
-- row offered "Approve" even when the click only records a review. Three cheap
-- columns: fn_hr_leave_final_step_index is pure jsonb and reads no tables, so
-- this adds no per-row role resolution to a query that has already hit the 8 s
-- statement_timeout once this month. Whether the CALLER may short-circuit is
-- deliberately NOT computed here -- that needs fn_leave_step_admits per row --
-- and is asked per request by fn_hr_leave_can_finalize when the sheet opens.

DROP FUNCTION IF EXISTS public.hr_leave_approval_queue();

CREATE FUNCTION public.hr_leave_approval_queue()
 RETURNS TABLE(id uuid, employee_id uuid, staff_name text, staff_code text, institution_id uuid, institution_name text, hr_organization_id uuid, hr_organization_name text, leave_type_id uuid, leave_type_name text, leave_type_code text, request_category text, start_date date, end_date date, start_time time without time zone, end_time time without time zone, duration_type text, duration_minutes integer, total_days numeric, reason text, is_emergency boolean, status text, created_at timestamp with time zone, applied_by uuid, applied_by_name text, applied_on_behalf boolean, final_approver_id uuid, final_approver_name text, final_decided_at timestamp with time zone, rejection_reason text, is_own boolean, can_decide boolean, waiting_on_me boolean, biometric_gap_from date, documents jsonb, current_step integer, chain_length integer, step_is_final boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
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
        OR public.fn_leave_step_admits(st.step, v_uid, a.hr_organization_id)
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
    (a.current_step = public.fn_hr_leave_final_step_index(a.approval_chain)) AS step_is_final
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types   lt ON lt.id = a.leave_type_id
  LEFT JOIN public.staff            s  ON s.id  = a.employee_id
  LEFT JOIN public.institutions     i  ON i.id  = s.institution_id
  LEFT JOIN public.hr_organizations o  ON o.id  = a.hr_organization_id
  LEFT JOIN public.profiles         p  ON p.id  = a.applied_by
  LEFT JOIN public.profiles         fp ON fp.id = a.final_approver_id
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
GRANT EXECUTE ON FUNCTION public.hr_leave_approval_queue() TO authenticated;

COMMENT ON FUNCTION public.hr_leave_approval_queue() IS
  'Leave/STO approval queue for the caller. documents carries the supporting files; current_step / chain_length / step_is_final say whether a decision here reviews or grants.';
