-- =====================================================================================
-- Seed the 8 recruitment_approval flows (role-category chains) for every HR
-- organization. They previously existed only for JKKN Main Office
-- (feb0b6ae-b040-4c21-94e0-d2243155ff5d, seeded 20260513230000), so candidates
-- promoted in any other college hit "No recruitment approval flows configured".
-- Idempotent: skips any org that already has an active recruitment_approval
-- flow with the same flow_name. Colleges can tune their copies at
-- /hr/policies/hr_approval_flows.
-- =====================================================================================

INSERT INTO hr_approval_flows (hr_organization_id, flow_for, flow_name, conditions, steps, is_active, escalate_after_hours)
SELECT o.id, src.flow_for, src.flow_name, src.conditions, src.steps, true, src.escalate_after_hours
FROM hr_organizations o
CROSS JOIN (
  SELECT flow_for, flow_name, conditions, steps, escalate_after_hours
  FROM hr_approval_flows
  WHERE hr_organization_id = 'feb0b6ae-b040-4c21-94e0-d2243155ff5d'
    AND flow_for = 'recruitment_approval'
    AND is_active = true
) src
WHERE NOT EXISTS (
  SELECT 1 FROM hr_approval_flows f
  WHERE f.hr_organization_id = o.id
    AND f.flow_for = 'recruitment_approval'
    AND f.flow_name = src.flow_name
    AND f.is_active = true
);
