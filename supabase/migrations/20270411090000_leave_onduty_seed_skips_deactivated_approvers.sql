-- Leave / on-duty: never route a request to a DEACTIVATED approver.
--
-- 📄 FILE ONLY — HELD for the Director: rewrites a live function, and leave /
-- on-duty approval feeds attendance.
--
-- BUG-004247 / BUG-004128 (learner, JKKN Dental, "On duty workflow not mapped
-- ... my On-Duty are not approved"; answered "still happening" 19 Sep).
-- Replayed live as the learner on 27 Sep: both April on-duty requests are
-- still Pending. Their step 1 approver is a faculty member whose account is
-- deactivated, so nobody can ever act on them.
--
-- CAUSE: fn_seed_application_approvals (20260815050000, live body identical)
-- takes the FIRST approver_id a flow step names, without checking that the
-- person is still active; its role fallback does not check either.
-- Production, 27 Sep (read-only): 25 of 57 pending learner leave / on-duty
-- requests wait on one of 5 deactivated approvers (Nursing 12, Dental 7,
-- Engineering 6), the oldest from 21 Mar.
--
-- THIS MIGRATION fixes NEW requests only: the seed now picks the first
-- ACTIVE person the step names, else the active-only role lookup. The 25
-- requests already stranded are a separate data repair, parked for the
-- Director (see the PR body for the preview query).
--
-- Everything else in the function is unchanged (auth check, one-seed-only
-- guard, flow lookup, the "applicant never approves themselves" rule).

CREATE OR REPLACE FUNCTION public.fn_seed_application_approvals(p_application_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_app      leave_onduty_applications%ROWTYPE;
  v_flow     leave_onduty_approval_flows%ROWTYPE;
  v_step     jsonb;
  v_role     text;
  v_approver uuid;
  v_seeded   integer := 0;
  v_existing integer;
BEGIN
  SELECT * INTO v_app FROM leave_onduty_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM learners_profiles lp
      WHERE lp.id = v_app.learner_id
        AND lp.profile_id = (SELECT auth.uid())
    )
    OR is_super_admin()
    OR is_admin()
  ) THEN
    RAISE EXCEPTION 'Not authorized to seed approvers for this application'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_existing
  FROM leave_onduty_approvals WHERE application_id = p_application_id;
  IF v_existing > 0 THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_flow FROM get_applicable_approval_flow(
    v_app.institution_id,
    v_app.department_id,
    v_app.semester_id,
    v_app.category::text,
    v_app.sub_category::text
  );

  IF v_flow.id IS NULL OR v_flow.flow_steps IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(v_flow.flow_steps::jsonb)
  LOOP
    v_role := v_step->>'approver_role';

    CONTINUE WHEN v_role IS NULL
              OR v_role NOT IN ('faculty', 'hod', 'principal', 'super_admin');

    v_approver := NULL;

    -- CHANGED 2026-09-27 (bugs desk): every choice below skips a DEACTIVATED
    -- account (profiles.is_active false, or login disabled). A flow names its
    -- approvers by person; when that person left, every new request still went
    -- to them and sat pending for ever — 25 of 57 pending learner leave / OD
    -- requests on 27 Sep, across 5 deactivated approvers, the oldest 21 Mar.
    -- Now the first ACTIVE person named in the step is used; if none is, the
    -- step falls through to the role lookup, which is also active-only.
    IF jsonb_typeof(v_step->'approver_ids') = 'array' THEN
      SELECT p.id INTO v_approver
      FROM jsonb_array_elements_text(v_step->'approver_ids') WITH ORDINALITY AS t(e, ord)
      JOIN profiles p ON p.id::text = btrim(t.e)
      WHERE btrim(coalesce(t.e, '')) <> ''
        AND p.is_active
        AND NOT coalesce(p.is_login_disabled, false)
      ORDER BY t.ord
      LIMIT 1;
    END IF;

    IF v_approver IS NULL AND btrim(coalesce(v_step->>'approver_id', '')) <> '' THEN
      SELECT p.id INTO v_approver
      FROM profiles p
      WHERE p.id::text = btrim(v_step->>'approver_id')
        AND p.is_active
        AND NOT coalesce(p.is_login_disabled, false);
    END IF;

    IF v_approver IS NULL THEN
      SELECT p.id INTO v_approver
      FROM profiles p
      WHERE p.role = v_role
        AND p.institution_id = v_app.institution_id
        AND (v_role NOT IN ('hod', 'faculty') OR p.department_id = v_app.department_id)
        AND p.is_active
        AND NOT coalesce(p.is_login_disabled, false)
      ORDER BY p.created_at
      LIMIT 1;
    END IF;

    IF v_approver IS NOT NULL AND EXISTS (
      SELECT 1 FROM learners_profiles lp
      WHERE lp.id = v_app.learner_id AND lp.profile_id = v_approver
    ) THEN
      v_approver := NULL;
    END IF;

    IF v_approver IS NOT NULL THEN
      INSERT INTO leave_onduty_approvals
        (application_id, approver_id, step_order, approver_role, status)
      VALUES
        (p_application_id, v_approver, (v_step->>'step_order')::int,
         v_role::approver_role, 'pending');
      v_seeded := v_seeded + 1;
    END IF;
  END LOOP;

  RETURN v_seeded;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_seed_application_approvals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_seed_application_approvals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seed_application_approvals(uuid) TO service_role;
