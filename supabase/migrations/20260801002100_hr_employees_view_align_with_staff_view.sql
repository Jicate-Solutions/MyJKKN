-- ─── Align hr.employees.view with staff.view ────────────────────────────────
-- 2026-07-21 (applied via MCP as `hr_employees_view_align_with_staff_view`)
--
-- WHY. The "Employee List" sidebar entry under HR Management now points at
-- /hr/employees (the read-only HR directory) instead of /staff/list. That
-- swaps the gate from `staff.view` to `hr.employees.view`:
--
--     staff.view          → 61 of 75 roles hold it (value true)
--     hr.employees.view   →  6 of 75 (ceo, coo, hr_admin, hr_head,
--                             hr_manager, staff_counselor)
--
-- 55 roles carried the gap. After this migration both keys sit at 61.
--
-- Without this grant, 55 roles — including Principal, HOD, Staff,
-- Administrator and System Administrator — lose the entry from the sidebar
-- (GetRoleBasedPages hides a row when no submenu survives the permission
-- filter) AND get a 403 from app/api/hr/employees/route.ts, which enforces
-- `hr.employees.view` server-side via withAuth's requirePermission. A
-- front-end-only change would produce exactly the silent empty state this
-- codebase keeps getting bitten by.
--
-- SAFETY. /hr/employees is a READ-ONLY lens over the `staff` table
-- (hr_employees was dropped by 20260524083600_consolidate_hr_employees_to_staff).
-- Every role granted here already holds `staff.view`, so RLS on `staff`
-- already returns these rows to them today via /staff/list — this exposes no
-- row a role could not already read. It is a second door onto the same data,
-- not a widening of it.
--
-- DELIBERATELY NOT GRANTED: `hr.employees.export`. The route gates export as a
-- separate check (route.ts:19), so bulk extraction stays with the HR tier
-- while everyone else gets the on-screen directory only.

-- NOTE ON THE GUARD: 63 roles already carry the `hr.employees.view` KEY with
-- value `false`, so `NOT (permissions ? 'hr.employees.view')` — the usual
-- idiom in this repo — would skip almost every role that needs the grant.
-- The predicate must test the VALUE, not key presence.
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('hr.employees.view', true),
       updated_at  = now()
 WHERE (permissions->>'staff.view')::boolean IS TRUE
   AND COALESCE((permissions->>'hr.employees.view')::boolean, false) IS NOT TRUE;
