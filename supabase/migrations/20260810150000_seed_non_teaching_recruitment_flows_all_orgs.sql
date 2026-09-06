-- =====================================================================================
-- Give every HR organisation a band-agnostic `non_teaching` recruitment_approval flow.
--
-- WHY
--   RecruitmentService.buildApprovalChain() (lib/services/hr/recruitment-service.ts)
--   throws "No approval flow matches this candidate" when no active
--   recruitment_approval flow carries conditions->>'role_category' = the candidate's
--   category. Only JKKN Main Office had a non_teaching flow, so promoting ANY
--   non-teaching applicant in ANY college failed — first surfaced by
--   "ASSISTANT LIBRARIAN - AHS" (application 94bb821b) at JKKN College of Allied
--   Health Sciences.
--
--   The earlier fan-out seed (20260703130100_seed_recruitment_approval_flows_all_orgs)
--   copied whatever Main Office happened to hold at run time; Main Office has since
--   been trimmed to 2 flows, so the propagation never reached the other 13 orgs.
--
-- WHAT
--   Copies each org's OWN 'senior_leadership' chain (cao -> coo -> ceo -> super_admin
--   -> super_admin, final on step 5) onto a new 'Non-Teaching Staff' flow. Chosen
--   because Main Office's existing Non Teaching Staff flow is byte-identical to its
--   Senior Leadership chain, so this keeps routing consistent with what is already live.
--   Deliberately band-agnostic (no monthly_salary_band key) — the Promote dialog never
--   sends a band, so only the category-only pass can ever match on that path.
--
-- IDEMPOTENCY
--   The NOT EXISTS guard skips any org that already has an active non_teaching flow.
--   There is no unique constraint on this table, so the guard is the only protection —
--   do not remove it. DISTINCT ON keeps the copy to one source row per org.
--
-- SCOPE
--   TIER-0 safe-additive INSERT only. No DDL. No row modifications. No deletes.
--   Applied to prod 2026-08-05; 13 rows inserted (all orgs except JKKN Main Office).
-- =====================================================================================

WITH sl AS (
  SELECT DISTINCT ON (hr_organization_id)
         hr_organization_id, steps, escalate_after_hours
  FROM hr_approval_flows
  WHERE flow_for = 'recruitment_approval'
    AND is_active
    AND conditions->>'role_category' = 'senior_leadership'
  ORDER BY hr_organization_id, created_at
)
INSERT INTO hr_approval_flows (
  hr_organization_id, flow_for, flow_name, conditions, steps, is_active, escalate_after_hours
)
SELECT sl.hr_organization_id,
       'recruitment_approval',
       'Non-Teaching Staff',
       '{"role_category":"non_teaching"}'::jsonb,
       sl.steps,
       true,
       sl.escalate_after_hours
FROM sl
WHERE NOT EXISTS (
  SELECT 1 FROM hr_approval_flows f
  WHERE f.hr_organization_id = sl.hr_organization_id
    AND f.flow_for = 'recruitment_approval'
    AND f.is_active
    AND f.conditions->>'role_category' = 'non_teaching'
);
