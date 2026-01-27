# Academic Years RLS Policy Fix for HOD Role

**Date:** 2025-01-27
**Issue:** HOD role users unable to create academic years despite having permission
**Error Code:** 42501 (RLS policy violation)
**Status:** ✅ FIXED

---

## Problem Summary

HOD role users received RLS policy violation when attempting to create academic years:

```
Error: new row violates row-level security policy for table "academic_years"
Code: 42501
```

Despite having `academic.years.create: true` permission in their custom role.

---

## Root Cause Analysis

### 1. Policy Mismatch

**Expected Policy** (in `supabase/setup/03_policies.sql` lines 174-186):
```sql
CREATE POLICY "academic_years_insert_by_role" ON academic_years
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR (cr.permissions->>'academic.years.create')::boolean = true
            )
        )
        AND institution_id = get_current_user_institution_id()
    );
```

**Deployed Policy** (actual database):
```sql
CREATE POLICY "Users can create academic years with permission"
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = ANY (ARRAY['super_admin', 'admin', 'faculty'])
        )
    )
```

### 2. Key Differences

| Aspect | Expected | Deployed |
|--------|----------|----------|
| **Policy Name** | `academic_years_insert_by_role` | `Users can create academic years with permission` |
| **Custom Role Check** | ✅ Checks `custom_roles.permissions` | ❌ NOT checked |
| **Hardcoded Roles** | `super_admin`, `admin` | `super_admin`, `admin`, `faculty` |
| **Institution Check** | ✅ Validates institution | ❌ NOT checked |

### 3. HOD Role Permissions

```json
{
  "academic.years.create": true,   // ✅ Has permission
  "academic.years.view": true,     // ✅ Has permission
  "academic.years.edit": false,    // ❌ No permission
  "academic.years.delete": false   // ❌ No permission
}
```

The HOD role **HAS** the required permission, but the deployed policy **IGNORED** it.

---

## Investigation Steps

### Phase 1: Evidence Gathering

1. **Read Error Logs**
   ```
   [ERROR] [academic/academic-years] Error creating academic year
   {"code":"42501","message":"new row violates row-level security policy"}
   ```

2. **Check HOD Permissions**
   ```sql
   SELECT role_name, permissions->>'academic.years.create'
   FROM custom_roles
   WHERE LOWER(role_name) = 'hod';
   ```
   Result: `true` ✅

3. **Inspect Deployed Policy**
   ```sql
   SELECT policyname, with_check
   FROM pg_policies
   WHERE tablename = 'academic_years' AND cmd = 'INSERT';
   ```
   Found hardcoded role check only ❌

4. **Compare with Source File**
   - Checked `supabase/setup/03_policies.sql`
   - Found correct policy definition
   - **Conclusion:** Deployed policy outdated

---

## Solution

### Migration Applied

**File:** `supabase/migrations/[timestamp]_fix_academic_years_insert_policy_for_hod.sql`

```sql
-- Drop old incorrect policy
DROP POLICY IF EXISTS "Users can create academic years with permission" ON academic_years;
DROP POLICY IF EXISTS "academic_years_insert_by_role" ON academic_years;

-- Create correct policy with custom_roles check
CREATE POLICY "academic_years_insert_by_role" ON academic_years
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            LEFT JOIN custom_roles cr ON LOWER(cr.role_name) = LOWER(p.role)
            WHERE p.id = auth.uid()
            AND (
                p.role IN ('super_admin', 'admin')
                OR (cr.permissions->>'academic.years.create')::boolean = true
            )
        )
        AND institution_id IN (
            SELECT institution_id FROM profiles WHERE id = auth.uid()
        )
    );
```

### What Changed

1. **Custom Role Permission Check**: Now checks `custom_roles.permissions->>'academic.years.create'`
2. **Institution Validation**: Ensures user can only create years in their institution
3. **Policy Name**: Standardized to match source file
4. **Removed Hardcoded Faculty**: No longer grants blanket access to all faculty

---

## Verification

### After Fix
```sql
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE tablename = 'academic_years' AND cmd = 'INSERT';
```

**Result:**
- Policy name: `academic_years_insert_by_role` ✅
- Checks custom_roles: ✅
- Validates institution: ✅
- HOD can now create academic years: ✅

---

## Impact

### Who Benefits
- **HOD role users**: Can now create academic years as intended
- **Custom role users**: Any custom role with `academic.years.create: true`

### Who Is NOT Affected
- **super_admin**: Still has full access
- **admin**: Still has full access
- **Other roles**: Access unchanged (must have explicit permission)

### Breaking Changes
- **faculty role**: No longer has blanket INSERT access (intentional security improvement)
  - Faculty users need explicit `academic.years.create` permission in custom_roles

---

## Prevention

### Why This Happened
1. **Manual Policy Creation**: Someone created policy directly in database
2. **Migration Drift**: Database state diverged from source files
3. **No Validation**: No automated check for policy consistency

### Recommendations
1. **Always Use Migrations**: Never create policies manually in Supabase dashboard
2. **Version Control**: Keep all policies in `supabase/setup/03_policies.sql`
3. **Regular Audits**: Compare deployed policies with source files
4. **Testing**: Test custom role permissions after migrations

---

## Related Files

- **Policy Definition**: `supabase/setup/03_policies.sql` (lines 162-214)
- **Custom Roles**: `supabase/setup/01_tables.sql` (lines 1299-1309)
- **Migration**: `supabase/migrations/[timestamp]_fix_academic_years_insert_policy_for_hod.sql`
- **Service**: `lib/services/academic/academic-year-service.ts`

---

## Testing Checklist

- [x] HOD role can create academic years
- [x] HOD role can view academic years
- [x] HOD role cannot edit academic years (no permission)
- [x] HOD role cannot delete academic years (no permission)
- [x] super_admin can create academic years
- [x] admin can create academic years
- [x] Custom role with `academic.years.create: true` can create
- [x] Custom role without permission CANNOT create
- [x] Users can only create in their institution

---

## Lessons Learned

1. **RLS Policy Errors Are Permission Issues**: Always check both role AND custom_roles permissions
2. **Source of Truth**: Migration files = source of truth, not database state
3. **Custom Roles Are Powerful**: Ensure policies check custom_roles.permissions
4. **Institution Isolation**: Always validate institution_id in multi-tenant policies

---

## Summary

**Fixed RLS policy for academic_years table to properly check custom_roles permissions**, allowing HOD role users (and any custom role with `academic.years.create: true`) to successfully create academic years in their institution.

**Migration Status:** ✅ Applied
**Verification:** ✅ Passed
**Production Impact:** 🟢 Positive (fixes broken functionality)
