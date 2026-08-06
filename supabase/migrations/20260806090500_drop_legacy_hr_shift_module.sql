-- =====================================================================
-- Remove the legacy HR shift module
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Superseded by hr_shift_timings (20260806090000). Running two shift models
-- side by side was rejected: one flow, not two.
--
-- Safe to drop — verified 2026-08-06 before deletion:
--   hr_shift_templates      0 rows
--   hr_shift_assignments    0 rows
--   hr_shift_swap_requests  0 rows
-- and the only code references outside the module itself were two stale
-- comments (types/hr-comp-off.ts, hr/leave/_components/claim-worked-day-dialog.tsx),
-- both corrected in the same change.
--
-- Application files removed alongside this migration:
--   app/(routes)/hr/shifts/{page,my/page,approvals/page}.tsx
--   app/(routes)/hr/admin/shift-templates/page.tsx
--   lib/services/hr/shift-service.ts
--   hooks/hr/use-shifts.ts
--   types/hr-shifts.ts
--
-- What is lost: per-employee rotating rosters and the shift-swap request
-- workflow. Neither was ever used (0 rows), no function or trigger ever
-- materialized an approved swap into an assignment, and rotation_pattern had
-- no runtime consumer.
-- =====================================================================

-- Child first: hr_shift_swap_requests FKs both assignments and staff.
DROP TABLE IF EXISTS public.hr_shift_swap_requests;
DROP TABLE IF EXISTS public.hr_shift_assignments;
DROP TABLE IF EXISTS public.hr_shift_templates;

-- Retire the dead permission key. It was held by 76 roles and gated exactly one
-- page (/hr/shifts/my), which no longer exists. Leaving it in place would show
-- an unrevokable orphan key in Role Management.
UPDATE public.custom_roles
   SET permissions = permissions - 'hr.shifts.view_own',
       updated_at = now()
 WHERE permissions ? 'hr.shifts.view_own';
