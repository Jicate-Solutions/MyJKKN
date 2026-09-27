-- Learner leave / on-duty: an approver's decision now actually moves the application.
--
-- 📄 FILE ONLY — NOT APPLIED. HELD for the Director: finishing a chain turns a
-- stuck application into an APPROVED one, and an approved application then
-- credits attendance (LeaveOndutyService.updateAttendanceOnApproval).
--
-- TIER: ADDITIVE — 1 new SECURITY DEFINER function, 0 tables, 0 policies,
-- 0 rows rewritten. No existing function is replaced. The table's UPDATE
-- policies are NOT widened.
--
-- ─── THE DEFECT (production, read-only, 2026-09-24) ─────────────────────────
--
-- LeaveOndutyApprovalService.processApproval runs in the BROWSER under the
-- approver's own login. For a faculty / HOD / principal it:
--   1. updates their own leave_onduty_approvals row  → allowed
--      (policy approvers_update_own), so the step flips to 'approved';
--   2. updates leave_onduty_applications.current_step / status → REFUSED
--      silently. The only UPDATE policies on that table are
--      admins_update_applications (profiles.role super_admin / admin /
--      institution_admin), learners_update_own_pending and
--      sponsors_update_own_pending. PostgREST answers an UPDATE that matches
--      0 rows under RLS with 200 and no error, so the service carried on,
--      the screen said "Application approved successfully", and the chain
--      never advanced. The final approval could not land either, so it never
--      finished; and the attendance write ran anyway, on an application whose
--      status never became 'approved'.
--
-- Production numbers (read-only queries, 2026-09-24):
--   150 applications since January; 49 of them in the last 30 days.
--   Only 3 ever reached 'approved' — every one by a super_admin.
--   0 have ever been 'rejected' by an approver.
--   114 approval steps are still pending: faculty 50, hod 46, principal 18.
--   3 steps by a non-admin approver are marked 'approved' while their
--   applications stayed 'pending' (one application has BOTH its steps
--   approved and is still 'pending').
--   All 199 active flows are 'sequential'.
--
-- ─── THE FIX ────────────────────────────────────────────────────────────────
--
-- fn_leave_onduty_decide_step(application, decision, comments) makes the whole
-- decision in ONE transaction, server-side, for the person holding the step:
--
--   * who: auth.uid() must hold a PENDING approval row on this application at
--     its CURRENT step. The authority is that row — the seeder
--     (fn_seed_application_approvals) decided who approves; this function never
--     lets anyone else decide, and never lets the applicant decide their own.
--   * current step: the lowest step_order that still has a pending row. It is
--     judged from the seeded rows, NOT from applications.current_step, because
--     (a) the seeder skips a flow step it cannot staff, so the chain can start
--     at 2, and (b) current_step never advanced for a non-admin approver, so on
--     production it is stale. For a 'parallel' flow every pending row of the
--     caller is current (that is what parallel means).
--   * then: records the step decision; on 'rejected' the application becomes
--     'rejected'; on 'approved' current_step moves to the next step that still
--     has a pending row, or — when no pending row remains — the application
--     becomes 'approved'. Every seeded row counts as required: all 401 active
--     flow steps are is_required true (389) or unset (12, read as required,
--     exactly as the approval timeline reads them).
--   * returns the new state, so the caller writes attendance ONLY when the
--     returned status is 'approved' and can prove the state really changed.
--
-- The application row is locked (FOR UPDATE) first, so two approvers pressing
-- the button at the same moment are serialised, not interleaved.
--
-- ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
--
--   * No backfill. The application whose steps are all approved stays
--     'pending' — nothing is waiting on anyone, so this function refuses it.
--     Settling it (and deciding whether its attendance should be credited) is
--     the Director's call, not a migration's.
--   * The super_admin override path is unchanged (it already had UPDATE rights).
--   * Sponsor-gated applications whose sponsor approved but which were never
--     seeded (7 on production) have no pending row, so nothing here reaches
--     them. That is a separate seeding defect.
--   * Attendance counting is untouched.
--
-- ci:allow-secdef-authenticated Every signed-in approver must be able to call this; the body authorises per row — it refuses unless auth.uid() holds the PENDING approval row at the application's current step (raised 42501), and refuses the applicant themselves.

CREATE OR REPLACE FUNCTION public.fn_leave_onduty_decide_step(
  p_application_id uuid,
  p_decision       text,
  p_comments       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_app          leave_onduty_applications%ROWTYPE;
  v_flow_type    text;
  v_current_step integer;
  v_row_id       uuid;
  v_row_step     integer;
  v_next_step    integer;
  v_step_status  text;
  v_status       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to act on an application'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected, not %', coalesce(p_decision, 'nothing')
      USING ERRCODE = '22023';
  END IF;

  -- Lock first: a second approver acting at the same instant waits here and
  -- then sees the state the first one left.
  SELECT * INTO v_app
  FROM leave_onduty_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'This application is already %, so it cannot be decided again', v_app.status
      USING ERRCODE = '55000';
  END IF;

  IF v_app.sponsor_approval_status = 'pending' THEN
    RAISE EXCEPTION 'This application is still waiting for its sponsor'
      USING ERRCODE = '55000';
  END IF;

  -- The applicant never decides their own application, however a row got there.
  IF EXISTS (
    SELECT 1 FROM learners_profiles lp
    WHERE lp.id = v_app.learner_id AND lp.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You cannot decide your own application'
      USING ERRCODE = '42501';
  END IF;

  SELECT min(step_order) INTO v_current_step
  FROM leave_onduty_approvals
  WHERE application_id = p_application_id AND status = 'pending';

  IF v_current_step IS NULL THEN
    RAISE EXCEPTION 'No approval step is waiting on this application'
      USING ERRCODE = '55000';
  END IF;

  -- The same 5-argument flow lookup the seeder and the approval screen use.
  -- Called from a definer function it is not limited by the flows table's RLS.
  SELECT f.flow_type::text INTO v_flow_type
  FROM get_applicable_approval_flow(
    v_app.institution_id,
    v_app.department_id,
    v_app.semester_id,
    v_app.category::text,
    v_app.sub_category::text
  ) f;

  SELECT a.id, a.step_order INTO v_row_id, v_row_step
  FROM leave_onduty_approvals a
  WHERE a.application_id = p_application_id
    AND a.approver_id = v_uid
    AND a.status = 'pending'
    AND (v_flow_type = 'parallel' OR a.step_order = v_current_step)
  ORDER BY a.step_order, a.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_row_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM leave_onduty_approvals a
      WHERE a.application_id = p_application_id
        AND a.approver_id = v_uid
        AND a.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'This application is waiting for step % first; your step comes after it', v_current_step
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'You are not the approver for this application''s current step'
      USING ERRCODE = '42501';
  END IF;

  -- Every write below reads back what actually landed (RETURNING), so the
  -- caller is told the stored state, never the intended one.
  UPDATE leave_onduty_approvals
  SET status          = p_decision::approval_status,
      comments        = nullif(btrim(coalesce(p_comments, '')), ''),
      action_taken_at = now()
  WHERE id = v_row_id
  RETURNING status::text INTO v_step_status;

  IF p_decision = 'rejected' THEN
    UPDATE leave_onduty_applications
    SET status = 'rejected'
    WHERE id = p_application_id
    RETURNING status::text, current_step INTO v_status, v_next_step;
  ELSE
    SELECT min(step_order) INTO v_next_step
    FROM leave_onduty_approvals
    WHERE application_id = p_application_id AND status = 'pending';

    IF v_next_step IS NULL THEN
      UPDATE leave_onduty_applications
      SET status = 'approved'
      WHERE id = p_application_id
      RETURNING status::text, current_step INTO v_status, v_next_step;
    ELSE
      UPDATE leave_onduty_applications
      SET current_step = v_next_step
      WHERE id = p_application_id
      RETURNING status::text, current_step INTO v_status, v_next_step;
    END IF;
  END IF;

  IF v_step_status IS DISTINCT FROM p_decision OR v_status IS NULL THEN
    RAISE EXCEPTION 'The decision did not save; nothing was changed'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'application_id', p_application_id,
    'decision',       p_decision,
    'decided_step',   v_row_step,
    'step_status',    v_step_status,
    'status',         v_status,
    'current_step',   v_next_step
  );
END;
$$;

COMMENT ON FUNCTION public.fn_leave_onduty_decide_step(uuid, text, text) IS
  'An approver decides their own pending step of a learner leave/on-duty application in one transaction: records the step, then rejects, advances current_step, or approves the application. Returns the stored state {application_id, decision, decided_step, step_status, status, current_step}.';

-- Explicit ACL (a DROP+CREATE once silently lost EXECUTE for `authenticated`
-- on this database, and Supabase grants EXECUTE to anon by default).
REVOKE ALL ON FUNCTION public.fn_leave_onduty_decide_step(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_leave_onduty_decide_step(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_leave_onduty_decide_step(uuid, text, text) TO authenticated;
