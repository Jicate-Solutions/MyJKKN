-- ─── HR permission realignment ───────────────────────────────────────────────
-- 2026-07-23 (applied via MCP as `hr_permission_realignment`)
--
-- ONE INTENT: Employee Self Service is for every staff member; the rest of the
-- HR module is for super admin and HR roles.
--
-- Follows 20260801002700_grant_employee_self_service_keys, which granted the
-- self-service keys to every role holding `staff.view` (61 of 75). That
-- predicate turned out to be too NARROW (13 staff roles hold no `staff.view`)
-- and one of the keys it granted too BROAD (`hr.leave.view` is also an org-wide
-- RLS read grant). Both are corrected here.
--
-- ══ PART 1 — Self Service reaches the last 13 staff roles ════════════════════
--
-- Scoping on `staff.view` left 13 active roles with NO HR self-service at all:
-- they cannot apply for leave, or see their own attendance, shifts, assets,
-- appraisal, training, FDP, memos or documents. Verified against DATA, not the
-- role name — each has 0 rows in learners_profiles matched by email:
--
--       role_key               users / matched staff records
--       lab_assistant              8 / 8
--       ai_assistant_pilot         5 / 4
--       transport_boarding         4 / 4
--       transport_head             2 / 0
--       ai_pulse_champion          2 / 1
--       cdc_coordinator            2 / 2
--       induction_coordinator      2 / 2
--       sports_coordinator         2 / 2
--       store_admin                2 / 2
--       cdc_head                   1 / 1
--       induction_lead             1 / 0
--       outreach_coordinator       0 / 0
--       program_lead               0 / 0
--
-- Scoped as "every active role EXCEPT the learner-facing ones" rather than an
-- explicit list of 13, so the population is stated as a RULE. `student` is the
-- one that matters: 6101 users, 1393 matched learner records. It already carries
-- these keys explicitly set to `false` and must stay that way. `parent` and
-- `production_learner` are excluded from the grant for the same reason; note
-- they ALREADY hold these keys from an earlier migration (0 users each) — that
-- pre-existing grant is left alone here rather than silently widened or revoked.
--
-- These keys only ever expose the CALLER'S OWN records: every hr_* SELECT policy
-- self-scopes on `employee_id IN fn_my_staff_ids()`, `applied_by = auth.uid()`
-- or `staff.profile_id = auth.uid()`. A wide grant does not widen row
-- visibility. `hr.leave.view` — which DID widen it — is deliberately absent from
-- this list and is revoked in Part 3.
--
-- GUARD. Tests the VALUE, not key presence: most roles already carry these keys
-- set to `false`, so the repo's usual `NOT (permissions ? 'key')` idiom would
-- skip almost every role that needs the grant. Re-runnable.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         -- Leave: own applications end to end (NOT hr.leave.view — see Part 3)
         'hr.leave.apply',                  true,
         'hr.leave.cancel',                 true,  -- own, pre-approval
         'hr.leave.withdraw',               true,  -- own, post-approval
         'hr.leave.balance.view',           true,  -- own balances (RLS self-scopes)
         'hr.leave.encashment.view',        true,  -- own requests
         -- Attendance: view own, request own corrections
         'hr.attendance.view_self',         true,
         'hr.attendance.regularize_self',   true,
         -- Own records across the rest of the HR surface
         'hr.shifts.view_own',              true,
         'hr.assets.view_own',              true,
         'hr.memos.view_own',               true,
         'hr.performance_reviews.view_own', true,
         'hr.promotion.apply_own',          true,
         'hr.training.view_own',            true,
         'hr.fdp.view_own',                 true,
         'hr.documents.view_own',           true,
         'hr.forms.submit_own',             true
       ),
       updated_at = now()
 WHERE is_active
   AND role_key NOT IN ('student', 'parent', 'production_learner');

-- ══ PART 2 — hr.view reaches the HR leadership tier ══════════════════════════
--
-- `hr.view` is the value behind '/hr' in MENU_PERMISSIONS. Because
-- RoutePermissionGuard resolves by LONGEST PREFIX, it is also the effective gate
-- on 14 pages that have no entry of their own:
--
--     /hr/analytics   /hr/workload    /hr/benefits    /hr/compensation
--     /hr/intelligence (+ /recruitment-need/[institutionId])
--     /hr/onboarding  /hr/offboarding /hr/shifts      /hr/shifts/approvals
--     /hr/templates   /hr/staff-specializations       /hr/automation
--     /hr/forms/inbox
--
-- Only hr_admin and hr_head held it. CEO, COO, HR Manager and Board hold
-- `hr.dashboard.view` (the gate on all 99 /hr/admin pages) but NOT `hr.view`, so
-- they were blocked from the HR Command Center itself and all 14 pages above —
-- a PermissionError on '/hr' for the four roles most likely to open it.
--
-- Levelling `hr.view` with `hr.dashboard.view` makes the two core-HR gates hold
-- the same 6 roles. Nothing is opened to staff: 69 roles still lack both.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('hr.view', true),
       updated_at = now()
 WHERE is_active
   AND role_key IN ('ceo', 'coo', 'hr_manager', 'board');

-- ══ PART 3 — hr.leave.view / hr.employees.view return to the HR tier ═════════
--
-- Both keys are DUAL-PURPOSE — a route gate AND an org-wide RLS read grant — and
-- 20260801002700 / 20260801002100 pushed them to the 61-role self-service
-- population. That made every staff member an org-wide reader:
--
--   hla_select on hr_leave_applications
--       ... OR (user_has_permission('hr.leave.view')
--               AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
--
--   hr_employee_documents_select_permission,
--   hr_promotion_applications_select, hr_promotion_decisions_select
--       ... OR (user_has_permission('hr.employees.view')
--               AND role_has_institution_access(institution_id))
--
-- i.e. all 61 roles could read every colleague's leave applications, HR
-- documents and promotion cases across their organization/institution.
--
-- NOTHING SELF-SERVICE IS LOST. Every one of those policies also has an IDENTITY
-- clause that already returns the caller's own rows without either key:
--     hr_leave_applications      employee_id IN fn_my_staff_ids()  /  applied_by = auth.uid()
--     hr_employee_documents      EXISTS (staff s WHERE s.id = staff_id AND s.profile_id = auth.uid())
--     hr_promotion_applications  EXISTS (staff s WHERE s.id = staff_id AND s.profile_id = auth.uid())
--
-- The companion commit repoints the affected routes off `hr.leave.view` onto the
-- self-service key `hr.leave.apply` in lib/sidebarMenuLink.ts —
-- /hr/leave/my-applications, /hr/leave/[id], and the four Time Off workspace
-- tabs (requests, compensatory-off, short-time-off, approvals) that previously
-- had no entry and were gated only by the '[id]' wildcard node.
-- ⚠ THIS MIGRATION AND THAT COMMIT MUST SHIP TOGETHER. Applying this alone takes
-- /hr/leave/my-applications away from every non-HR employee.
--
-- KEEP LIST. The 6 HR/leadership roles, plus `staff_counselor` (52 users): the
-- Staff Counselling module documents both keys as deliberate dependencies
-- (specs/counselor-taxonomy-spec.md §188 — staff roster + absenteeism signal).
-- Its pages land in Phase 2, so revoking would silently strip a documented
-- grant before the feature that needs it exists.
--
-- Written as `false`, not key removal: user_has_permission() tests
-- `(permissions->>key)::boolean = true`, so both work — but an explicit `false`
-- renders as a visible unchecked box in Role Management, whereas a missing key
-- looks like the catalog never offered it.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'hr.leave.view',     false,
         'hr.employees.view', false
       ),
       updated_at = now()
 WHERE is_active
   AND role_key NOT IN ('hr_admin', 'hr_head', 'hr_manager', 'ceo', 'coo', 'board', 'staff_counselor')
   AND ( (permissions->>'hr.leave.view')::boolean     IS TRUE
      OR (permissions->>'hr.employees.view')::boolean IS TRUE );
