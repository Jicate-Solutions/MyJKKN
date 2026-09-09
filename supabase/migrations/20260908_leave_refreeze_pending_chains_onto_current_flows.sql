-- Re-freeze pending leave chains onto the current flows (2026-09-08)
--
-- Companion to 20260908_leave_approval_flow_group_defaults.sql, which standardised
-- the per-type approval flows across nine institutions. That migration changed the
-- CONFIGURATION only. An application's approval_chain is a SNAPSHOT frozen at apply
-- time (LeaveService.buildApprovalChain -> lib/hr/leave/approval-chain.ts buildChain),
-- so ~594 requests submitted before it kept routing to whoever the OLD flow named.
--
-- The symptom that surfaced it: MR. VIJAYSABARI S holds `principal` and `hod` in
-- Allied Health Sciences and matches the new Casual Leave flow ([principal, cao]),
-- but the three pending CL requests there still carried a chain with ONE slot pinned
-- to DR DHANASEKAR BALAKRISHNAN. assertCanDecide() refuses when every slot on a step
-- is pinned and none is the caller (lib/services/hr/leave-service.ts:622), and
-- fn_leave_step_admits() agrees, so the block was real and not a UI artefact.
--
-- WHAT THIS REBUILDS. For every pending/escalated request whose chain no longer
-- matches its flow, the chain is rebuilt from that flow's steps. All nine
-- institutions' flows are step_source='explicit' + run_mode='sequential', so the map
-- is one flow step -> one chain step; the ladder and parallel branches of buildChain()
-- do not apply and are deliberately not reimplemented here.
--
-- The chain step shape mirrors toChainStep() exactly:
--   step_order           = the flow step's chain_order
--   approver_role        = the FIRST approver's role, or 'hr_approver' when it names
--                          nobody (the placeholder the gate reads as "any permitted
--                          approver")
--   approver_user_id     = the FIRST approver's user id
--   approvers / quorum / step_type / escalate_after_hours carried through
--   decisions [] , status 'pending', decided_at/decided_by/comment null
--
-- WHAT IS DELIBERATELY SKIPPED
--   * current_step > 0, or ANY step already carrying a decision — rebuilding would
--     erase a recorded approval. 3 requests (Engineering: 1 CL, 2 Permission).
--   * requests whose dates overlap a LOCKED hr_attendance_period.
--     trg_hla_block_locked_period fires on EVERY update of this table, not just on
--     status, and raises P0001 — one such request would abort the whole statement.
--     1 request today.
--   * JKKN Main Office and Jicate Solutions, whose flows this standardisation left
--     alone because neither has a principal or hod holder.
--
-- CONSEQUENCE WORTH KNOWING. On-Duty and On Duty (Hourly) go from a 1-step chain to
-- the 3-step HOD -> Principal -> CAO path, so 41 in-flight requests get a LONGER
-- route and restart at step 1. Casual Leave in Engineering and Pharmacy goes the
-- other way, 2 steps -> 1. Signed off by the user 2026-09-08.
--
-- trg_hla_guard_chain_decisions passes because it returns early when auth.uid() is
-- NULL, which it is in a migration; the rebuilt chains carry no decisions in any case.
-- Every other trigger on this table is scoped to status or to the date columns, none
-- of which this touches.
--
-- No BEGIN/COMMIT: scripts/apply-migration-file.mjs refuses transaction control.

WITH flow_chain AS (
  SELECT
    f.hr_organization_id,
    (f.conditions ->> 'leave_type_id')::uuid AS leave_type_id,
    jsonb_agg(
      jsonb_build_object(
        'step_order',           (st ->> 'chain_order')::int,
        'approver_role',        COALESCE(st -> 'approvers' -> 0 ->> 'approver_role', 'hr_approver'),
        'approver_user_id',     st -> 'approvers' -> 0 ->> 'approver_user_id',
        'approvers',            st -> 'approvers',
        'quorum',               COALESCE(st ->> 'quorum', 'any'),
        'decisions',            '[]'::jsonb,
        'status',               'pending',
        'decided_at',           NULL,
        'decided_by',           NULL,
        'comment',              NULL,
        'escalate_after_hours', COALESCE((st ->> 'escalate_after_hours')::int, f.escalate_after_hours),
        'step_type',            st ->> 'step_type'
      )
      ORDER BY (st ->> 'chain_order')::int
    ) AS chain
  FROM public.hr_approval_flows f
  JOIN public.hr_organizations o ON o.id = f.hr_organization_id
  CROSS JOIN LATERAL jsonb_array_elements(f.steps) st
  WHERE f.flow_for = 'leave_approval'
    AND f.is_active
    AND f.valid_until IS NULL
    AND f.conditions ->> 'leave_type_id' IS NOT NULL
    AND f.step_source = 'explicit'
    AND f.run_mode = 'sequential'
    AND o.included_in_hr
    AND o.name NOT IN ('JKKN Main Office', 'Jicate Solutions')
  GROUP BY f.hr_organization_id, f.conditions ->> 'leave_type_id', f.escalate_after_hours
)

UPDATE public.hr_leave_applications a
SET approval_chain = fc.chain,
    current_step   = 0,
    updated_at     = now()
FROM flow_chain fc
WHERE a.hr_organization_id = fc.hr_organization_id
  AND a.leave_type_id      = fc.leave_type_id
  AND a.status IN ('pending', 'escalated')
  AND a.current_step = 0
  AND a.approval_chain IS DISTINCT FROM fc.chain
  -- Nothing decided yet: rebuilding a chain that carries a decision would erase it.
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(a.approval_chain, '[]'::jsonb)) s
    WHERE jsonb_array_length(COALESCE(s -> 'decisions', '[]'::jsonb)) > 0
  )
  -- trg_hla_block_locked_period raises on ANY update once the dates overlap a locked
  -- attendance period, and one raise aborts the whole statement.
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.hr_attendance_periods ap
      ON ap.institution_id = s.institution_id AND ap.status = 'locked'
    WHERE s.id = a.employee_id
      AND make_date(ap.period_year, ap.period_month, 1) <= a.end_date
      AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > a.start_date
  );
