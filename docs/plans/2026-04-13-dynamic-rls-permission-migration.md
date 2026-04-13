# Dynamic RLS Permission Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Migrate all hardcoded role-check RLS policies to use `user_has_permission()` so that Role Management UI becomes the single source of truth for ALL access control — both UI rendering and database-level access. When you toggle a permission in Role Management, it immediately controls both the sidebar visibility AND the actual database queries.

**Architecture:** Fix the `user_has_permission()` function first (add super admin bypass, SECURITY DEFINER, NULL safety), then systematically replace all 63+ hardcoded policies across 6 modules with dynamic permission-based checks. Each table gets a standardized policy pattern: `is_super_admin() OR (institution_scoped AND user_has_permission('module.action'))`.

**Tech Stack:** Supabase PostgreSQL, RLS policies, PL/pgSQL functions. All changes are SQL-only — no frontend code changes needed (the permission keys already exist in permissions.ts and are already checked by usePermissions() hook).

---

## Phase Overview

| Phase | Description | Policies Affected | Risk |
|-------|-------------|-------------------|------|
| 1 | Fix `user_has_permission()` + helper functions | 0 (foundation) | LOW |
| 2 | Migrate Billing module RLS | ~15 policies | HIGH (financial data) |
| 3 | Migrate Organization tables RLS | ~20 policies | MEDIUM |
| 4 | Migrate Academic tables RLS | ~8 policies | MEDIUM |
| 5 | Migrate Learners/Staff/Service Requests RLS | ~15 policies | MEDIUM |
| 6 | Migrate remaining modules + cleanup | ~5 policies | LOW |

**IMPORTANT:** Each phase should be tested before moving to the next. After each phase, verify that:
- Super admins still have full access
- Admin role still works as before
- The custom roles that previously had access still work
- Custom roles that were previously blocked now get access if they have the permission granted

---

## Phase 1: Fix Core Permission Functions (BLOCKING)

### Task 1: Upgrade `user_has_permission()` function

This is the MOST CRITICAL task. The function must be upgraded before any RLS migration.

**Apply via Supabase MCP execute_sql:**

```sql
-- UPGRADED user_has_permission() with:
-- 1. SECURITY DEFINER (prevents RLS recursion)
-- 2. Super admin bypass (returns true for everything)
-- 3. NULL/empty parameter safety
-- 4. Safe text extraction with ->>
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Guard: NULL or empty permission name
    IF permission_name IS NULL OR permission_name = '' THEN
        RETURN false;
    END IF;

    -- Super admin bypass: always grant all permissions
    IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND is_super_admin = true
    ) THEN
        RETURN true;
    END IF;

    -- Multi-role system: check all assigned roles (OR logic)
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role -> custom_roles
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    );
END;
$$;
```

Also update in `supabase/setup/02_functions.sql` for consistency.

**Commit:** `fix(rls): upgrade user_has_permission with super admin bypass and SECURITY DEFINER`

---

### Task 2: Fix `is_super_admin()` function

Upgrade to SECURITY DEFINER for consistency:

```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND is_super_admin = true
    );
$$;
```

**Commit:** `fix(rls): upgrade is_super_admin to SECURITY DEFINER`

---

### Task 3: Fix `is_admin()` function

Upgrade to check multi-role system and use SECURITY DEFINER:

```sql
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = check_user_id
        AND (
            is_super_admin = true
            OR role IN ('admin', 'super_admin', 'administrator')
        )
    );
$$;
```

**Commit:** `fix(rls): upgrade is_admin to include is_super_admin check and SECURITY DEFINER`

---

### Task 4: Fix `can_user_manage_staff()` function

Upgrade to check multi-role system:

```sql
CREATE OR REPLACE FUNCTION public.can_user_manage_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    -- Super admin bypass
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- Check via multi-role permissions
    IF user_has_permission('staff.create') OR user_has_permission('staff.edit') THEN
        RETURN true;
    END IF;

    -- Legacy fallback: admin role
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin')
    );
END;
$$;
```

**Commit:** `fix(rls): upgrade can_user_manage_staff to use multi-role system`

---

### Task 5: Create `get_my_role()` alias function

Some policies reference `get_my_role()` which does not exist. Create it as an alias:

```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;
```

Also create `auth_institution_id()` alias referenced by some admission policies:

```sql
CREATE OR REPLACE FUNCTION public.auth_institution_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT institution_id FROM profiles WHERE id = auth.uid();
$$;
```

**Commit:** `fix(rls): add get_my_role and auth_institution_id alias functions`

---

## Phase 2: Migrate Billing Module RLS (CRITICAL — affects 40 HOD users)

### Task 6: Migrate billing_student_bills policies

**Current:** Uses `profiles.role IN ('super_admin', 'admin', 'faculty', 'accounts')` — blocks HOD, digital_coordinator
**Target:** Use `user_has_permission('billing.schedule.*')` — any role with billing permission gets access

```sql
-- Drop old hardcoded policies
DROP POLICY IF EXISTS "Faculty users can view institution billing student bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Accounts users can view institution billing student bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Faculty users can insert institution billing student bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Accounts users can insert institution billing student bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Faculty users can update institution billing student bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Accounts users can update institution billing student bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Faculty users can delete institution billing student bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Accounts users can delete institution billing student bills" ON billing_student_bills;
-- Keep admin and student policies (admin uses is_admin(), student uses own-record check)

-- Create new dynamic policies
CREATE POLICY "billing_bills_select_permission" ON billing_student_bills
FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.schedule.view'))
    OR (student_id IN (
        SELECT lp.id FROM learners_profiles lp
        JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
        WHERE p.id = auth.uid() AND p.role = 'student'
    ))
);

CREATE POLICY "billing_bills_insert_permission" ON billing_student_bills
FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.schedule.create'))
);

CREATE POLICY "billing_bills_update_permission" ON billing_student_bills
FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.schedule.update'))
);

CREATE POLICY "billing_bills_delete_permission" ON billing_student_bills
FOR DELETE USING (
    is_super_admin()
    OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.schedule.delete'))
);
```

**Commit:** `feat(rls): migrate billing_student_bills to dynamic permission-based policies`

---

### Task 7: Migrate billing_receipts policies

Same pattern — replace hardcoded role checks with `user_has_permission('billing.receipts.*')`:

```sql
DROP POLICY IF EXISTS "Faculty users can view institution billing receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Accounts users can view institution billing receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Faculty users can insert institution billing receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Accounts users can insert institution billing receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Faculty users can update institution billing receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Accounts users can update institution billing receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Faculty users can delete institution billing receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Accounts users can delete institution billing receipts" ON billing_receipts;

CREATE POLICY "billing_receipts_select_permission" ON billing_receipts
FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.view'))
    OR (student_id IN (SELECT lp.id FROM learners_profiles lp JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email) WHERE p.id = auth.uid() AND p.role = 'student'))
);

CREATE POLICY "billing_receipts_insert_permission" ON billing_receipts
FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.create'))
);

CREATE POLICY "billing_receipts_update_permission" ON billing_receipts
FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.edit'))
);

CREATE POLICY "billing_receipts_delete_permission" ON billing_receipts
FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('billing.receipts.delete'))
);
```

**Commit:** `feat(rls): migrate billing_receipts to dynamic permission-based policies`

---

### Task 8: Migrate billing_invoices policies

Same pattern with `user_has_permission('billing.invoices.*')`.

**Commit:** `feat(rls): migrate billing_invoices to dynamic permission-based policies`

---

### Task 9: Migrate remaining billing tables

Apply same pattern to:
- `billing_discounts` -> `billing.discounts.*`
- `billing_refunds` -> `billing.refunds.*`
- `billing_parent_categories` -> `billing.parent_categories.*`
- `billing_sub_categories` -> `billing.sub_categories.*`
- `billing_item_categories` -> `billing.item_categories.*`
- `billing_invoice_items` -> `billing.invoices.*` (uses parent permission)
- `billing_receipt_items` -> `billing.receipts.*` (uses parent permission)

**Commit:** `feat(rls): migrate all remaining billing tables to dynamic permission-based policies`

---

## Phase 3: Migrate Organization Tables RLS

### Task 10: Migrate institutions, degrees, departments, programs

These all follow the same pattern — replace `get_current_user_role() IN ('super_admin', 'admin')` + admission/event_coordinator special cases with `user_has_permission()`:

For each table (institutions, degrees, departments, programs):

```sql
-- Pattern for SELECT (replace all existing SELECT policies):
CREATE POLICY "{table}_select_permission" ON {table}
FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR institution_id = get_current_user_institution_id()
    OR user_has_permission('organizations.{table}.view')
);

-- Pattern for INSERT:
CREATE POLICY "{table}_insert_permission" ON {table}
FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('organizations.{table}.create')
);

-- Pattern for UPDATE:
CREATE POLICY "{table}_update_permission" ON {table}
FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.{table}.edit'))
);

-- Pattern for DELETE:
CREATE POLICY "{table}_delete_permission" ON {table}
FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('organizations.{table}.delete'))
);
```

**Key change:** The admission and event_coordinator special SELECT policies are REMOVED because these roles will now get access through `user_has_permission('organizations.*.view')` which is already granted in their custom_roles.permissions JSONB.

**Commit:** `feat(rls): migrate organization tables to dynamic permission-based policies`

---

### Task 11: Migrate semesters, sections, courses, course_mappings

Same pattern as Task 10 using:
- `semesters` -> `organizations.semesters.*`
- `sections` -> `organizations.sections.*`
- `courses` -> `organizations.courses.*`
- `course_mappings` -> `organizations.course.mappings.*`

**Commit:** `feat(rls): migrate academic structure tables to dynamic permission-based policies`

---

## Phase 4: Migrate Academic Tables RLS

### Task 12: Migrate academic_years, staff_plans, staff_plan_courses

```sql
-- academic_years
-- Replace get_current_user_role() IN ('super_admin', 'admin') + admission role
CREATE POLICY "academic_years_select_permission" ON academic_years
FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR institution_id = get_current_user_institution_id()
    OR user_has_permission('academic.years.view')
);
-- INSERT/UPDATE/DELETE follow same pattern with academic.years.create/edit/delete
```

For staff_plans and staff_plan_courses, use `academic.staff.planning.*` permission keys.

**Commit:** `feat(rls): migrate academic metadata tables to dynamic permission-based policies`

---

## Phase 5: Migrate Learners, Staff, Service Requests

### Task 13: Migrate learners_profiles policies

Replace `get_my_role() IN ('administrator', 'faculty', 'hod')` with permission checks:

```sql
-- INSERT: replace hardcoded role list with permission
CREATE POLICY "learners_profiles_insert_permission" ON learners_profiles
FOR INSERT WITH CHECK (
    is_super_admin()
    OR user_has_permission('learners.create')
);

-- UPDATE: replace hardcoded role list with permission
CREATE POLICY "learners_profiles_update_permission" ON learners_profiles
FOR UPDATE USING (
    is_super_admin()
    OR (user_has_institution_access(auth.uid(), institution_id) AND user_has_permission('learners.edit'))
    OR id = auth.uid()  -- self-edit
);

-- DELETE: replace hardcoded role list with permission
CREATE POLICY "learners_profiles_delete_permission" ON learners_profiles
FOR DELETE USING (
    is_super_admin()
    OR (user_has_institution_access(auth.uid(), institution_id) AND user_has_permission('learners.delete'))
);
```

Keep existing SELECT policies (admission role, event_coordinator, institution-scoped) but add a dynamic one.

**Commit:** `feat(rls): migrate learners_profiles to dynamic permission-based policies`

---

### Task 14: Migrate profiles table policies

Replace hardcoded role checks in profiles DELETE and UPDATE with permission-based:

```sql
-- DELETE
CREATE POLICY "profiles_delete_permission" ON profiles
FOR DELETE USING (
    is_super_admin()
    OR (can_user_manage_staff() AND institution_id = get_current_user_institution_id() AND id <> auth.uid())
    OR user_has_permission('users.delete')
);

-- UPDATE (keep self-edit, add permission check)
CREATE POLICY "profiles_update_permission" ON profiles
FOR UPDATE USING (
    id = auth.uid()  -- self-edit always allowed
    OR is_super_admin()
    OR (can_user_manage_staff() AND (get_current_user_role() = 'super_admin' OR institution_id = get_current_user_institution_id()))
    OR user_has_permission('users.edit')
);
```

**Commit:** `feat(rls): migrate profiles to dynamic permission-based policies`

---

### Task 15: Migrate service request policies

Replace `get_current_user_role() IN ('super_admin', 'administrator')` with permission checks:

```sql
-- service_types, service_type_fields, service_request_approval_steps
-- Currently super_admin only, add permission check
CREATE POLICY "service_types_manage_permission" ON service_types
FOR ALL USING (
    is_super_admin()
    OR user_has_permission('service_requests.types.create')
);

-- service_requests admin view
CREATE POLICY "service_requests_admin_view_permission" ON service_requests
FOR SELECT USING (
    is_super_admin()
    OR user_has_permission('service_requests.view_all')
    OR user_has_permission('service_requests.approve')
    OR requester_id = auth.uid()
);
```

**Commit:** `feat(rls): migrate service request tables to dynamic permission-based policies`

---

## Phase 6: Update SQL Setup File and Cleanup

### Task 16: Update 03_policies.sql setup file

After all migrations are applied to the live database, update the `supabase/setup/03_policies.sql` file to reflect the new dynamic policies. This ensures fresh installs get the correct policies.

For each table migrated in Phases 2-5:
- Remove the old hardcoded policy definitions
- Add the new `user_has_permission()` based policies
- Add comments noting the migration date and reason

**Commit:** `feat(rls): update setup file with all dynamic permission-based policies`

---

### Task 17: Update 02_functions.sql setup file

Update the functions file to reflect all function changes from Phase 1:
- `user_has_permission()` — upgraded version
- `is_super_admin()` — SECURITY DEFINER version
- `is_admin()` — upgraded version
- `can_user_manage_staff()` — multi-role version
- `get_my_role()` — new alias
- `auth_institution_id()` — new alias

**Commit:** `feat(rls): update setup file with upgraded permission functions`

---

## Standardized Policy Pattern Reference

Every table should follow this pattern after migration:

```sql
-- SELECT: institution-scoped + permission check
CREATE POLICY "{table}_select_permission" ON {table}
FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('{module}.{entity}.view'))
);

-- INSERT: permission check (institution set by app code)
CREATE POLICY "{table}_insert_permission" ON {table}
FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('{module}.{entity}.create')
);

-- UPDATE: institution-scoped + permission check
CREATE POLICY "{table}_update_permission" ON {table}
FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('{module}.{entity}.edit'))
);

-- DELETE: institution-scoped + permission check
CREATE POLICY "{table}_delete_permission" ON {table}
FOR DELETE USING (
    is_super_admin()
    OR is_admin()
    OR (institution_id = get_current_user_institution_id() AND user_has_permission('{module}.{entity}.delete'))
);
```

**Variations:**
- Tables without `institution_id`: omit institution scoping
- Student self-access tables: add `OR student_id/user_id = auth.uid()` to SELECT
- Cross-institutional roles (admission): `user_has_permission()` handles this since it checks the role's JSONB regardless of institution

---

## Verification Checklist

After each phase, verify:

1. **Super admin:** Can access everything (SELECT/INSERT/UPDATE/DELETE on all tables)
2. **Administrator:** Can access their institution's data
3. **HOD with billing permission:** Can now access billing tables (previously blocked)
4. **Digital Coordinator with billing.*.view:** Can now read billing data
5. **Faculty:** Can still mark attendance, view timetables
6. **Student:** Can still view own bills, attendance, profile
7. **Accountant:** Can still manage billing (same as before, now via permission)
8. **Admission Officer:** Can access admission tables cross-institutionally
9. **Custom role with NO permissions:** Gets blocked from everything (correct)
10. **New custom role with selective permissions:** Gets exactly what was granted

---

## Risk Mitigation

1. **Always keep is_super_admin() OR is_admin() as first checks** in every policy. This ensures admin access never breaks during migration.

2. **Drop old policies BEFORE creating new ones** for the same table+operation to avoid conflicts. PostgreSQL evaluates multiple PERMISSIVE policies with OR logic, so having both old and new would be overly permissive during the transition.

3. **Test each phase independently** before moving to the next. If a phase breaks something, only that module's policies need rollback.

4. **The setup files (01-05) are NOT applied to the live database** — they are reference files. All live changes go through Supabase MCP execute_sql or SQL Editor. Update setup files AFTER verifying live changes work.
