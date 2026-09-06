-- ─── Backfill approver rows for stranded learner leave/on-duty applications ──
-- 2026-07-21 (applied via MCP as `backfill_stuck_leave_onduty_approvals`)
--
-- WHY. 54 of 60 learner applications sat `pending` with ZERO rows in
-- leave_onduty_approvals, so no approver could ever see or act on them — the
-- approver inbox queries by `approver_id` on that table. Learners saw a
-- submitted application that silently went nowhere.
--
-- CAUSE (fixed separately in lib/services/academic/leave-onduty-service.ts):
-- apply-time flow seeding used an inline query filtering
--   .eq('category', data.category).eq('sub_category', data.sub_category)
-- which could never match the 155 flows stored as category='all' with
-- sub_category IS NULL — 'onduty' != 'all', and PostgREST emits
-- `sub_category=eq.null`, which never matches SQL NULL. The code now calls
-- get_applicable_approval_flow(), the same RPC the approval path uses.
--
-- That code fix only helps NEW applications. This migration repairs the
-- existing backlog using the identical resolution logic:
--   1. resolve the flow via get_applicable_approval_flow() (5-arg overload —
--      the one the approval path calls; the 7-arg overload would resolve a
--      more specific flow and desync the two ends)
--   2. expand flow_steps into one row per step
--   3. resolve each step's approver_role to a concrete profile: matching role
--      + institution, additionally matching department for hod/faculty,
--      earliest created_at wins
--
-- Live flow_steps carry NO approver_id/approver_ids — only step_order,
-- is_optional and approver_role — so step 3's role lookup is the only
-- available resolution path. It is order-dependent (earliest profile wins),
-- which means it selects *an* eligible HOD rather than *the* designated one.
-- Recorded as a known limitation; pinning approver_ids per flow is a config
-- decision for the academic team, not something to guess at here.
--
-- SCOPE (verified by dry run before applying):
--   54 stuck applications
--   47 resolve a flow  → 95 approver rows, 0 unresolvable
--    7 resolve NO flow → untouched; they need flow config for their
--                        institution/department/category, not code or data.
--
-- IDEMPOTENT: the NOT EXISTS guard means re-running inserts nothing. It only
-- ever touches applications that currently have zero approver rows, so it can
-- never duplicate or disturb an in-flight approval chain.

INSERT INTO public.leave_onduty_approvals
  (application_id, step_order, approver_role, approver_id, status)
SELECT
  st.application_id,
  st.step_order,
  st.approver_role::approver_role,
  st.approver_id,
  'pending'::approval_status
FROM (
  SELECT
    s.id                         AS application_id,
    (step->>'step_order')::int   AS step_order,
    step->>'approver_role'       AS approver_role,
    (
      SELECT p.id FROM public.profiles p
      WHERE p.role = step->>'approver_role'
        AND p.institution_id = s.institution_id
        AND (step->>'approver_role' NOT IN ('hod','faculty')
             OR p.department_id = s.department_id)
      ORDER BY p.created_at ASC
      LIMIT 1
    ) AS approver_id
  FROM public.leave_onduty_applications s
  CROSS JOIN LATERAL (
    SELECT f.flow_steps
    FROM public.get_applicable_approval_flow(
      s.institution_id, s.department_id, s.semester_id,
      s.category::text, s.sub_category
    ) f
  ) fl
  CROSS JOIN LATERAL jsonb_array_elements(fl.flow_steps) step
  WHERE s.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.leave_onduty_approvals ap
      WHERE ap.application_id = s.id
    )
) st
WHERE st.approver_id IS NOT NULL;
