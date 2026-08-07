-- Seed a leave/OD application's approver chain server-side.
--
-- REPORTED 2026-08-07 (JKKNCET ECE learner, screenshot): submitting an OD fails
-- with "No approver is set up for your class yet…" even after the department
-- fallback flows were seeded (20260815030000 / 20260815040000). The flows exist
-- and resolve correctly — for staff. They do NOT resolve for the applicant.
--
-- WHY. LeaveOndutyService.createApplication runs entirely in the BROWSER
-- (getSupabase() -> createClientSupabaseClient, and application-form.tsx is a
-- client component), so every statement carries the learner's own JWT. Two
-- layers then block the applicant, both verified by impersonating the reporter:
--
--   1. get_applicable_approval_flow is SECURITY INVOKER (prosecdef = false), so
--      RLS on leave_onduty_approval_flows applies to it. The only SELECT policy,
--      academic_staff_view_flows, admits super_admin / admin / institution_admin
--      / hod / principal / faculty / staff — NOT 'student'. As the reporter the
--      RPC therefore sees 0 flows and returns an all-NULL row, so flow_steps is
--      empty and createApplication refuses the submission. This affects EVERY
--      learner, including cohorts that always had a fully-specific flow (an AHS
--      learner with flow 02d8bc8e… reproduces it identically).
--
--   2. Even with the flow in hand, the client then INSERTs the approver rows
--      itself, and leave_onduty_approvals' only INSERT policy
--      (admins_insert_approvals) requires the writer to be an admin OR
--      approver_id = auth.uid(). A learner naming their HOD and Principal
--      satisfies neither:
--        ERROR 42501: new row violates row-level security policy
--
-- THE FIX. The applicant is structurally the wrong principal for that write —
-- they are creating rows that assign work to their own approvers. Rather than
-- widen RLS so a learner may insert approver rows (which would let them name
-- ANY approver, including themselves, and self-approve), the whole seeding step
-- moves into this SECURITY DEFINER function. The learner never reads the flow
-- table and never chooses who approves; they can only ask the database to seed
-- an application that is already theirs.
--
-- Resolution order per step matches what the TypeScript did after the
-- 2026-08-07 field-name fix:
--   1. the first non-blank entry of the step's `approver_ids` ARRAY — the
--      approver the academic team pinned in the flow-builder UI. (The old code
--      read `approver_id`, singular, a field no flow has ever carried: 156 of
--      162 active flows store `approver_ids`, zero store `approver_id`. It
--      always read NULL and always fell through to step 3, which is why 77 of
--      98 seeded approval steps pointed at the wrong person.)
--   2. the legacy singular `approver_id`, tolerated for hand-written flows.
--   3. a role lookup: earliest-created profile holding that role in the
--      institution, additionally matched on department for hod/faculty.
--
-- Returns the number of approver rows seeded. 0 means the chain could not be
-- built (no flow, or no step resolved an approver) — the caller rolls the
-- application back and tells the learner, rather than leaving an application
-- no approver can ever see.

CREATE OR REPLACE FUNCTION public.fn_seed_application_approvals(p_application_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- SECURITY DEFINER bypasses RLS, so authorize explicitly: only the applicant
  -- themselves or an admin may seed. Never gate on hardcoded role names.
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

  -- Idempotent, and a hard guard against re-seeding: an application that
  -- already has approver rows is left completely alone, so this can never
  -- duplicate a chain or disturb one that is mid-approval.
  SELECT count(*) INTO v_existing
  FROM leave_onduty_approvals WHERE application_id = p_application_id;
  IF v_existing > 0 THEN
    RETURN v_existing;
  END IF;

  -- The 5-arg overload — the SAME one the approval path resolves against
  -- (leave-onduty-approval-service.ts:70, :366). The 7-arg variant adds
  -- degree/program and would resolve a MORE specific flow than approve-time,
  -- recreating the seed-vs-judge mismatch that stranded 54 applications.
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

    -- approver_role is a NOT NULL enum on leave_onduty_approvals. The
    -- flow-builder derives it from the selected person's profiles.role, which
    -- can be any role key, so skip anything the enum cannot hold rather than
    -- failing the whole submission on one malformed step.
    CONTINUE WHEN v_role IS NULL
              OR v_role NOT IN ('faculty', 'hod', 'principal', 'super_admin');

    v_approver := NULL;

    -- 1. pinned approver_ids (array)
    IF jsonb_typeof(v_step->'approver_ids') = 'array' THEN
      SELECT btrim(e)::uuid INTO v_approver
      FROM jsonb_array_elements_text(v_step->'approver_ids') e
      WHERE btrim(coalesce(e, '')) <> ''
      LIMIT 1;
    END IF;

    -- 2. legacy singular form
    IF v_approver IS NULL AND btrim(coalesce(v_step->>'approver_id', '')) <> '' THEN
      v_approver := btrim(v_step->>'approver_id')::uuid;
    END IF;

    -- 3. role lookup
    IF v_approver IS NULL THEN
      SELECT p.id INTO v_approver
      FROM profiles p
      WHERE p.role = v_role
        AND p.institution_id = v_app.institution_id
        AND (v_role NOT IN ('hod', 'faculty') OR p.department_id = v_app.department_id)
      ORDER BY p.created_at
      LIMIT 1;
    END IF;

    -- The applicant must never end up approving their own request, however the
    -- flow was configured.
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
$$;

-- Explicit ACL. A prior incident on this database saw a DROP+CREATE silently
-- drop EXECUTE for `authenticated`, 403-ing 16 routes for users who held the
-- permission, so state the grant rather than inheriting it.
REVOKE ALL ON FUNCTION public.fn_seed_application_approvals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_seed_application_approvals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seed_application_approvals(uuid) TO service_role;
