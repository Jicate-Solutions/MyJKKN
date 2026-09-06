-- 20260716_hr_head_full_access_and_approval_override.sql
-- HR Head gets full HR-module access (mirror of hr_admin's hr.* grants) and a
-- new recruitment approval-override key is granted to hr_head / hr_admin / coo.
-- Data-only change to custom_roles.permissions JSONB — no schema/policy change.
-- Pattern: permissions || '{...}'::jsonb (right side wins). Safe to re-run.
-- NOTE: a JSONB object literal is used instead of jsonb_build_object() because
-- that function is capped at 100 arguments (58 keys × 2 = 116 would exceed it).

-- 1) HR Head — mirror every hr.* key hr_admin holds (flips 31 present-but-false
--    keys to true and adds 11 missing ones, incl. hr.view which gates '/hr').
UPDATE public.custom_roles
SET permissions = permissions || '{
  "hr.view": true,
  "hr.dashboard.view": true,
  "hr.dashboard.manage": true,
  "hr.attendance.approve_team": true,
  "hr.attendance.audit_export": true,
  "hr.attendance.export": true,
  "hr.attendance.mark_self": true,
  "hr.attendance.override": true,
  "hr.attendance.regularize_approve": true,
  "hr.attendance.regularize_self": true,
  "hr.attendance.status_types.write": true,
  "hr.attendance.thresholds.write": true,
  "hr.attendance.view_all": true,
  "hr.attendance.view_self": true,
  "hr.attendance.view_team": true,
  "hr.career_development.view": true,
  "hr.counseling.notes.create": true,
  "hr.counseling.notes.view_own": true,
  "hr.counseling.sessions.create": true,
  "hr.counseling.sessions.view": true,
  "hr.counseling.view": true,
  "hr.employees.create": true,
  "hr.employees.delete": true,
  "hr.employees.edit": true,
  "hr.employees.export": true,
  "hr.employees.view": true,
  "hr.grievance.escalate": true,
  "hr.grievance.view": true,
  "hr.leave.apply": true,
  "hr.leave.approve": true,
  "hr.leave.balance.dispute": true,
  "hr.leave.balance.view": true,
  "hr.leave.cancel": true,
  "hr.leave.dispute.approve": true,
  "hr.leave.encashment.approve": true,
  "hr.leave.encashment.view": true,
  "hr.leave.policies.write": true,
  "hr.leave.view": true,
  "hr.leave.withdraw": true,
  "hr.onboarding.execute": true,
  "hr.onboarding.manage": true,
  "hr.onboarding.view": true,
  "hr.policies.create": true,
  "hr.policies.edit": true,
  "hr.policies.history.view": true,
  "hr.policies.view": true,
  "hr.promotion.case.create": true,
  "hr.promotion.case.decide": true,
  "hr.promotion.case.view": true,
  "hr.promotion.criteria.write": true,
  "hr.recruitment.approve": true,
  "hr.recruitment.create": true,
  "hr.recruitment.delete": true,
  "hr.recruitment.edit": true,
  "hr.recruitment.packages.approve": true,
  "hr.recruitment.packages.propose": true,
  "hr.recruitment.packages.view": true,
  "hr.recruitment.view": true
}'::jsonb
WHERE role_key = 'hr_head';

-- 2) Override key — hr_head / hr_admin / coo. super_admin bypasses implicitly
--    via user_has_permission(), so it is intentionally not listed.
UPDATE public.custom_roles
SET permissions = permissions || '{"hr.recruitment.approve.override": true}'::jsonb
WHERE role_key IN ('hr_head', 'hr_admin', 'coo');

-- PostgREST schema cache reload so RLS/permission reads pick up the change.
NOTIFY pgrst, 'reload schema';
