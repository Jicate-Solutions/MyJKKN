# Role-Based Institution Scope — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add per-role institution scope setting to Role Management so each custom role can be configured to access "All Institutions" or "Own Institution Only." Super admin always gets all institutions. RLS policies dynamically respect this setting — no more hardcoded institution logic.

**Architecture:** Add `institution_scope` column to `custom_roles` table ('all' | 'own'), create a `role_has_institution_access(inst_id)` database function that checks the user's role scope + institution_id + user_institution_access, then update all dynamic RLS policies to use `user_has_permission() AND role_has_institution_access()`.

**Tech Stack:** Supabase PostgreSQL (column + function), Next.js (Role Management UI updates), TypeScript types.

---

## Phase Overview

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-3 | Database: add column + helper function + update RLS policies |
| 2 | 4-5 | Frontend: add scope toggle to create/edit role dialogs |
| 3 | 6 | Set default scopes for existing roles |

---

## Phase 1: Database Changes

### Task 1: Add institution_scope column to custom_roles

Add column with default 'own' (most restrictive by default):

```sql
ALTER TABLE custom_roles
ADD COLUMN IF NOT EXISTS institution_scope VARCHAR(10) DEFAULT 'own'
CHECK (institution_scope IN ('all', 'own'));

COMMENT ON COLUMN custom_roles.institution_scope IS
'Controls data access scope: all = cross-institutional access, own = restricted to users own institution. Managed via Role Management UI.';

-- Set super_admin to 'all' by default
UPDATE custom_roles SET institution_scope = 'all' WHERE role_key = 'super_admin';
-- Set admission to 'all' (cross-institutional by design)
UPDATE custom_roles SET institution_scope = 'all' WHERE role_key = 'admission';
```

### Task 2: Create role_has_institution_access() function

This function checks if the current user can access data for a given institution_id, based on their role's institution_scope setting:

```sql
CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    -- NULL institution_id: always accessible (system-wide records)
    IF check_institution_id IS NULL THEN
        RETURN true;
    END IF;

    -- Super admin: always access all
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- Check if ANY of user's roles has institution_scope = 'all'
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
        AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role for scope
    IF EXISTS (
        SELECT 1
        FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Check own institution
    IF check_institution_id = get_current_user_institution_id() THEN
        RETURN true;
    END IF;

    -- Check user_institution_access table (cross-institution grants)
    IF EXISTS (
        SELECT 1
        FROM user_institution_access uia
        WHERE uia.user_id = auth.uid()
        AND uia.institution_id = check_institution_id
        AND uia.is_active = true
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;
```

### Task 3: Update all dynamic RLS policies to use role_has_institution_access()

Update every policy that currently uses `user_has_permission()` to also check institution scope.

**New standardized pattern:**
```sql
-- For tables WITH institution_id column:
is_super_admin() OR is_admin()
OR (user_has_permission('module.action') AND role_has_institution_access(institution_id))

-- For tables WITHOUT institution_id (system-wide):
is_super_admin() OR is_admin()
OR user_has_permission('module.action')
```

Tables to update (all tables we migrated to user_has_permission):

**Billing tables** (have institution_id):
- billing_student_bills, billing_receipts, billing_invoices

**Billing tables** (no institution_id - system-wide categories):
- billing_discounts, billing_refunds, billing_parent_categories, billing_sub_categories, billing_item_categories, billing_invoice_items, billing_receipt_items
- These stay as-is (no institution scoping needed for category data)

**Organization tables** (have institution_id):
- institutions (use `id` instead of `institution_id`), degrees, departments, programs, semesters, sections, courses

**Academic tables** (have institution_id):
- academic_years, staff_plans, timetables

**Admission tables** (have institution_id):
- admission_leads, admission_counselors, admission_lead_scores, admission_tasks, admission_call_logs, admission_ai_insights, admission_daily_briefings, admission_lead_stage_history, admission_campaign_logs, admission_campaign_queue, admission_sms_logs, admission_whatsapp_logs, admission_email_logs, admission_communication_templates, admission_assignment_rules, admission_scoring_rules, admission_drip_sequences, admission_workflow_configs, admission_workflows, admission_forms, admission_form_submissions, admission_integrations, admission_integration_logs

**Learners/Profiles/Staff** (have institution_id):
- learners_profiles, profiles

**Service Requests** (no institution_id on main tables — skip):
- Keep as-is

**Example migration for admission_leads:**
```sql
DROP POLICY IF EXISTS "adm_leads_select" ON admission_leads;
CREATE POLICY "adm_leads_select" ON admission_leads
FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.leads.view') AND role_has_institution_access(institution_id))
    OR (assigned_counselor_id = auth.uid())
);
```

---

## Phase 2: Frontend Changes

### Task 4: Add institution scope to create-role-dialog.tsx

**File:** `app/(routes)/users/role-management/_components/create-role-dialog.tsx`

Add a new field in the "Details" tab:

```tsx
<div className="space-y-2">
  <Label>Institution Access Scope</Label>
  <Select value={institutionScope} onValueChange={setInstitutionScope}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="own">Own Institution Only</SelectItem>
      <SelectItem value="all">All Institutions (Cross-institutional)</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    Controls whether users with this role can access data from all institutions or only their own.
  </p>
</div>
```

- Add `institutionScope` state (default 'own')
- Include `institution_scope` in the API call when creating the role
- Update RoleService.createRole() to accept institution_scope field

### Task 5: Add institution scope to edit-role-dialog.tsx

**File:** `app/(routes)/users/role-management/_components/edit-role-dialog.tsx`

Same field as Task 4, but:
- Pre-populate from existing role data
- Super admin role: locked to "All Institutions" (disabled select)
- Include `institution_scope` in the update API call
- Update RoleService.updateRole() to accept institution_scope field

### Task 5b: Update TypeScript types

**File:** `types/auth.ts`

Add `institution_scope` to the CustomRole interface:
```typescript
interface CustomRole {
  // ... existing fields
  institution_scope: 'all' | 'own';
}
```

---

## Phase 3: Set Default Scopes

### Task 6: Set institution_scope for all existing roles

Based on the current behavior:

```sql
-- Roles that should see ALL institutions
UPDATE custom_roles SET institution_scope = 'all' WHERE role_key IN (
  'super_admin',     -- System-wide admin
  'admission',       -- Cross-institutional admission
  'counselor'        -- Cross-institutional counseling (some counselors)
);

-- All other roles default to 'own' (already the column default)
-- administrator, faculty, hod, student, staff, accounts, digital_coordinator,
-- principal, event_coordinator, driver, guest, coe, coe_office,
-- health_*, admission_staff
```

---

## Verification Checklist

1. Super admin: always sees all institutions (hardcoded bypass)
2. Admission Officer (scope=all): sees all institutions' leads
3. Admission Staff (scope=own): sees only their institution's leads
4. HOD (scope=own): sees only their institution's data
5. Administrator (scope=own): sees only their institution's data
6. Changing scope in Role Management immediately affects data access
7. user_institution_access still works for individual cross-institution grants
8. Create/edit role dialogs show the scope selector
9. Super admin scope selector is locked/disabled
