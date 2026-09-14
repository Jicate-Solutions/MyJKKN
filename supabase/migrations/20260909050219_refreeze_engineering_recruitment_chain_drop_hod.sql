-- Re-freeze one Engineering recruitment candidate onto the current approval flow.
--
-- Context: JKKN College of Engineering and Technology removed the HOD review
-- step from its recruitment approval flows. hr_recruitment_candidates.approval_chain
-- is a FROZEN snapshot taken at promote time (RecruitmentService.buildApprovalChain),
-- so candidates promoted before the flow edit still carry the old
-- hod -> principal -> coo -> ceo -> final chain and sit blocked on a HOD step
-- that no longer exists in the flow.
--
-- Only KAVITHA R P (23d00f0d-a8e5-4eb5-9f12-d7f737a2e080) is actually blocked at
-- HOD -- every other Engineering candidate already cleared that step, so their
-- chains are left alone rather than rewriting completed approval history.
--
-- The rebuild mirrors toChainSteps() in lib/services/hr/recruitment-service.ts
-- exactly, so the result is identical to what a promotion today would freeze.
--
-- Guarded: only applies while every step is still 'pending' (nothing decided yet).

WITH flow AS (
  SELECT steps
  FROM hr_approval_flows
  WHERE flow_for = 'recruitment_approval'
    AND is_active = true
    AND hr_organization_id = (
      SELECT id FROM hr_organizations
      WHERE name = 'JKKN College of Engineering and Technology'
    )
    AND conditions->>'role_category' = 'teaching_faculty'
    AND (conditions->>'monthly_salary_band' IS NULL
         OR conditions->>'monthly_salary_band' = '')
  ORDER BY created_at NULLS LAST
  LIMIT 1
), target AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'step_order',           COALESCE((s.step->>'chain_order')::int, s.ord::int),
             'approver_role',        s.step->>'approver_role',
             'approver_user_id',     s.step->'approver_user_id',
             'status',               'pending',
             'escalate_after_hours', COALESCE((s.step->>'escalate_after_hours')::int, 72),
             'step_type',            COALESCE(
                                       s.step->>'step_type',
                                       CASE WHEN s.ord = (SELECT jsonb_array_length(steps) FROM flow)
                                            THEN 'final' ELSE 'review' END
                                     ),
             'interview_required',   COALESCE((s.step->>'interview_required')::boolean, false),
             'interview_id',         NULL
           )
           ORDER BY s.ord
         ) AS chain
  FROM flow f
  CROSS JOIN LATERAL jsonb_array_elements(f.steps) WITH ORDINALITY s(step, ord)
)
UPDATE hr_recruitment_candidates c
SET approval_chain = (SELECT chain FROM target),
    current_step   = 0,
    updated_at     = now()
WHERE c.id = '23d00f0d-a8e5-4eb5-9f12-d7f737a2e080'
  AND c.status = 'pending_approval'
  AND (SELECT chain FROM target) IS NOT NULL
  -- nothing decided yet: every frozen step is still pending
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(c.approval_chain) AS s(step)
    WHERE s.step->>'status' IS DISTINCT FROM 'pending'
  );
