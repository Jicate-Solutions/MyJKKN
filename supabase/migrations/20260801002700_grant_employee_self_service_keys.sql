-- ─── Phase 1 — grant Employee Self Service keys ─────────────────────────────
-- 2026-07-21 (applied via MCP as `grant_employee_self_service_keys`)
--
-- WHY. HR was provisioned as an ADMIN module. Only 11 of 75 roles hold any HR
-- permission at all; `faculty` and plain `staff` hold none. Every self-service
-- key sits at 2-6 roles:
--
--     hr.leave.apply             4 of 75
--     hr.leave.balance.view      4
--     hr.leave.view              6
--     hr.attendance.view_self    2
--     hr.attendance.regularize_self  2
--
-- So the pages an employee needs for their OWN records were reachable by
-- hr_admin, hr_head, ceo and coo — the four people who least need them.
-- Without this grant the new "Employee Self Service" sidebar group renders for
-- almost nobody, and the RLS retrofit in 20260801002600 has no one to serve.
--
-- SCOPE. Every role holding `staff.view` (61 roles) — the same population used
-- by 20260801002100 for hr.employees.view. These keys only ever expose the
-- CALLER'S OWN records: hr_leave_* RLS self-scopes on
-- `employee_id IN (SELECT unnest(fn_my_staff_ids()))`, and each page filters by
-- the caller's profile. A wide grant here does not widen row visibility.
--
-- DELIBERATELY NOT GRANTED — these are approver/admin keys and must stay narrow:
--     hr.leave.approve             (5 roles)
--     hr.leave.encashment.approve  (4)
--     hr.leave.policies.write      (2)
--     hr.attendance.regularize_approve / approve_team / override / view_all
--     hr.view                      (2 — the /hr Command Center, an admin dashboard)
--
-- hr.leave.approve in particular now does real work: after the RLS retrofit it
-- is what lets a user read OTHER employees' leave rows and balances. Widening
-- it would re-open the balance IDOR that migration just closed.
--
-- GUARD. Tests the VALUE, not key presence. 63 roles already carry most of
-- these keys set to `false`, so the repo's usual `NOT (permissions ? 'key')`
-- idiom would skip almost every role that needs the grant. Re-runnable.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         -- Leave: own applications end to end
         'hr.leave.view',              true,  -- own applications list + detail
         'hr.leave.apply',             true,
         'hr.leave.balance.view',      true,  -- own balances (RLS self-scopes)
         'hr.leave.cancel',            true,  -- own, pre-approval
         'hr.leave.withdraw',          true,  -- own, post-approval
         'hr.leave.encashment.view',   true,  -- own requests
         -- Attendance: view own, request own corrections
         'hr.attendance.view_self',       true,
         'hr.attendance.regularize_self', true,
         -- Own records across the rest of the HR surface
         'hr.shifts.view_own',            true,
         'hr.assets.view_own',            true,
         'hr.memos.view_own',             true,
         'hr.performance_reviews.view_own', true,
         'hr.promotion.apply_own',        true,
         'hr.training.view_own',          true,
         'hr.fdp.view_own',               true,
         'hr.documents.view_own',         true,
         'hr.forms.submit_own',           true
       ),
       updated_at = now()
 WHERE (permissions->>'staff.view')::boolean IS TRUE;
