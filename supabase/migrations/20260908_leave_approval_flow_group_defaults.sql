-- Group-wide default leave approval flows (2026-09-08)
--
-- Leave approval flows are configured per (institution, leave type) from
-- HR -> Admin -> Leave Types -> row menu -> "Who approves this". Each is a row in
-- hr_approval_flows WHERE flow_for='leave_approval' with conditions={leave_type_id};
-- a row with no leave_type_id is that institution's catch-all.
-- LeaveService.buildApprovalChain() picks most-specific-first and FREEZES the chain
-- onto the application at apply time.
--
-- Before this migration those flows were inconsistent institution to institution:
-- Engineering's Casual Leave was HOD -> Principal, Dental's was Principal alone,
-- Education's was CAO alone, and 13 (institution, type) pairs had no per-type flow at
-- all and silently inherited a catch-all. HR asked for ONE standard per leave type,
-- with the CAO on every final step.
--
-- THE FIVE TEMPLATES
--   Casual Leave        1. final  -> [Principal, CAO]  quorum any
--   Permission (Hourly) 1. final  -> [Principal, CAO]  quorum any
--   On Duty (Hourly)    1. review -> HOD  2. review -> Principal  3. final -> CAO
--   On-Duty Leave       1. review -> HOD  2. review -> Principal  3. final -> CAO
--   Compensatory Off    1. review -> Principal         2. final -> CAO
--
-- SCOPE. The 11 hr_organizations with included_in_hr = true, MINUS JKKN Main Office
-- and Jicate Solutions. Those two have ZERO principal and ZERO hod holders, so the
-- HOD/Principal rungs would admit nobody and their On-Duty and Comp-Off requests would
-- sit pending forever with no error. They keep their existing flows, which pin
-- DR. RAJENDIRAN K M directly (a pinned approver is exempt from org scope). Nine
-- institutions are targeted; only the leave types each one actually has are written,
-- so Matric HSS and Nattraja Vidhyalya get three templates rather than five.
--
-- WHY THE CAO STEP RESOLVES AT ALL. There is exactly ONE cao holder group-wide,
-- staffed at College of Education with no user_institution_access rows, and the cao
-- role has hr.leave.approve = false. fn_leave_step_admits() still admits them in every
-- institution because they ALSO hold HR Head, which grants hr.leave.approve = true at
-- institution_scope = 'all'. Remove that second role and every final step here dies at
-- once, silently. A second CAO holder, or hr.leave.approve on the cao role, would fix
-- the fragility.
--
-- NOT RETROACTIVE. Chains freeze at apply time, so the ~600 live pending requests keep
-- the flow they were submitted under. This applies to requests submitted from now on.
--
-- Step JSON mirrors what LeaveApprovalFlowService.save() writes: approvers[] plus the
-- singular approver_role / approver_user_id / approver_name fields taken from the FIRST
-- approver, which is what fn_leave_step_approvers() and every legacy reader fall back to.
--
-- No BEGIN/COMMIT: scripts/apply-migration-file.mjs refuses transaction control.

WITH target_org AS (
  SELECT o.id
  FROM public.hr_organizations o
  WHERE o.included_in_hr
    AND o.name NOT IN ('JKKN Main Office', 'Jicate Solutions')
),

template (leave_type_code, steps) AS (
  VALUES
  ('CL', '[
    {"chain_order":1,"step_type":"final","quorum":"any",
     "approvers":[
       {"approver_role":"principal","approver_user_id":null,"approver_name":null},
       {"approver_role":"cao","approver_user_id":null,"approver_name":null}],
     "approver_role":"principal","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48}
  ]'::jsonb),

  ('Permission', '[
    {"chain_order":1,"step_type":"final","quorum":"any",
     "approvers":[
       {"approver_role":"principal","approver_user_id":null,"approver_name":null},
       {"approver_role":"cao","approver_user_id":null,"approver_name":null}],
     "approver_role":"principal","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48}
  ]'::jsonb),

  ('ODH', '[
    {"chain_order":1,"step_type":"review","quorum":"any",
     "approvers":[{"approver_role":"hod","approver_user_id":null,"approver_name":null}],
     "approver_role":"hod","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48},
    {"chain_order":2,"step_type":"review","quorum":"any",
     "approvers":[{"approver_role":"principal","approver_user_id":null,"approver_name":null}],
     "approver_role":"principal","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48},
    {"chain_order":3,"step_type":"final","quorum":"any",
     "approvers":[{"approver_role":"cao","approver_user_id":null,"approver_name":null}],
     "approver_role":"cao","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48}
  ]'::jsonb),

  ('OD', '[
    {"chain_order":1,"step_type":"review","quorum":"any",
     "approvers":[{"approver_role":"hod","approver_user_id":null,"approver_name":null}],
     "approver_role":"hod","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48},
    {"chain_order":2,"step_type":"review","quorum":"any",
     "approvers":[{"approver_role":"principal","approver_user_id":null,"approver_name":null}],
     "approver_role":"principal","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48},
    {"chain_order":3,"step_type":"final","quorum":"any",
     "approvers":[{"approver_role":"cao","approver_user_id":null,"approver_name":null}],
     "approver_role":"cao","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48}
  ]'::jsonb),

  ('comp_off', '[
    {"chain_order":1,"step_type":"review","quorum":"any",
     "approvers":[{"approver_role":"principal","approver_user_id":null,"approver_name":null}],
     "approver_role":"principal","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48},
    {"chain_order":2,"step_type":"final","quorum":"any",
     "approvers":[{"approver_role":"cao","approver_user_id":null,"approver_name":null}],
     "approver_role":"cao","approver_user_id":null,"approver_name":null,
     "escalate_after_hours":48}
  ]'::jsonb)
),

-- Only the leave types each institution actually has. Nothing is invented, so
-- Nursing's Clinical Leave and Pharmacy's Clinical Duty are left untouched.
target AS (
  SELECT
    lt.hr_organization_id,
    lt.id AS leave_type_id,
    lt.leave_type_name,
    t.steps
  FROM public.hr_leave_types lt
  JOIN target_org o ON o.id = lt.hr_organization_id
  JOIN template   t ON t.leave_type_code = lt.leave_type_code
  WHERE lt.is_active
),

-- Rewrite in place rather than deactivate-and-recreate, so the flow stays one row in
-- the Leave Types table instead of a growing stack of superseded ones.
updated AS (
  UPDATE public.hr_approval_flows f
  SET steps                = tg.steps,
      flow_name            = tg.leave_type_name || ' approval',
      step_source          = 'explicit',
      run_mode             = 'sequential',
      role_ladder          = '[]'::jsonb,
      fallback_approver    = NULL,
      escalate_after_hours = 48,
      updated_at           = now()
  FROM target tg
  WHERE f.hr_organization_id = tg.hr_organization_id
    AND f.flow_for = 'leave_approval'
    AND f.is_active
    AND f.valid_until IS NULL
    AND (f.conditions ->> 'leave_type_id')::uuid = tg.leave_type_id
  RETURNING tg.hr_organization_id, tg.leave_type_id
)

INSERT INTO public.hr_approval_flows (
  hr_organization_id, flow_for, flow_name, conditions, steps, is_active,
  step_source, run_mode, role_ladder, fallback_approver, escalate_after_hours
)
SELECT
  tg.hr_organization_id,
  'leave_approval',
  tg.leave_type_name || ' approval',
  jsonb_build_object('leave_type_id', tg.leave_type_id),
  tg.steps,
  true,
  'explicit',
  'sequential',
  '[]'::jsonb,
  NULL,
  48
FROM target tg
WHERE NOT EXISTS (
  SELECT 1 FROM updated u
  WHERE u.hr_organization_id = tg.hr_organization_id
    AND u.leave_type_id = tg.leave_type_id
);
