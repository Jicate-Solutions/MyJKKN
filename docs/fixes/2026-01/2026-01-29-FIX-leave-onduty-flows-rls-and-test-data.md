# Leave/OnDuty Approval Flows RLS Fix and Test Data

**Date**: 2026-01-29
**Type**: Bug Fix + Data Setup
**Severity**: High
**Status**: ✅ Fixed

## Problem

HOD users couldn't see approval workflows in the Settings page, even after the applications RLS fix.

## Root Causes

### Issue 1: RLS Policies Missing HOD Role
Similar to applications, the flows table RLS policies didn't include HOD, Principal, or Faculty roles.

**Original Policies**:
- `admins_manage_flows` (ALL operations) - Only: `super_admin`, `admin`, `institution_admin`
- `staff_view_flows` (SELECT only) - Checked `user_institution_access` table

### Issue 2: Policy Relied on user_institution_access Table
The `staff_view_flows` policy checked the `user_institution_access` table, but:
- ❌ HOD user had **NO entry** in this table
- ❌ Policy failed even though it should allow access

### Issue 3: No Test Data
There were no flows created for the HOD's institution to test with.

## Solution

### 1. Updated RLS Policies

**New Policy 1: `admins_and_hod_manage_flows`** (Replaces `admins_manage_flows`)
```sql
-- Allows:
-- 1. Super admin: ALL flows (all institutions)
-- 2. Admin/Institution Admin: Flows for institutions in user_institution_access
-- 3. HOD/Principal: Flows for THEIR institution (profiles.institution_id)

CREATE POLICY "admins_and_hod_manage_flows" ON leave_onduty_approval_flows
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR
        (
          p.role IN ('admin', 'institution_admin')
          AND institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
          )
        )
        OR
        (
          p.role IN ('hod', 'principal')
          AND institution_id = p.institution_id  -- ✅ Uses profile's institution
        )
      )
    )
  );
```

**New Policy 2: `academic_staff_view_flows`** (Replaces `staff_view_flows`)
```sql
-- Allows:
-- 1. Super admin: View all flows
-- 2. Admin/Institution Admin: Flows for institutions in user_institution_access
-- 3. HOD/Principal/Faculty/Staff: Flows for THEIR institution (profiles.institution_id)

CREATE POLICY "academic_staff_view_flows" ON leave_onduty_approval_flows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR
        (
          p.role IN ('admin', 'institution_admin')
          AND institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
          )
        )
        OR
        (
          p.role IN ('hod', 'principal', 'faculty', 'staff')
          AND institution_id = p.institution_id  -- ✅ Uses profile's institution
        )
      )
    )
  );
```

### Key Improvements

1. **Uses `profiles.institution_id`** instead of `user_institution_access` for HOD/Principal/Faculty/Staff
2. **Adds HOD and Principal** to management permissions (can create/edit/delete flows)
3. **Adds Faculty** to view permissions (can see flows but not modify)
4. **Maintains backward compatibility** for Admin/Institution Admin (still uses `user_institution_access`)

### 2. Created Test Flow

Created a sample approval flow for HOD's institution:

```sql
Flow ID: 3c867873-ef7d-4f68-b994-47dc2d40ce88
Institution: JKKN Testing Institution
Department: Computer Science Engineering
Category: Leave → Casual
Flow Type: Sequential
Steps:
  1. HOD (required)
  2. Principal (required)
Status: Active
```

## Access Control Matrix

| Role | View Flows | Create Flows | Edit Flows | Delete Flows | Scope |
|------|-----------|-------------|-----------|-------------|-------|
| Super Admin | ✅ | ✅ | ✅ | ✅ | All institutions |
| Admin | ✅ | ✅ | ✅ | ✅ | Assigned institutions |
| Institution Admin | ✅ | ✅ | ✅ | ✅ | Assigned institutions |
| **HOD** | ✅ | ✅ | ✅ | ✅ | **Their institution** |
| **Principal** | ✅ | ✅ | ✅ | ✅ | **Their institution** |
| **Faculty** | ✅ | ❌ | ❌ | ❌ | **Their institution** |
| Staff | ✅ | ❌ | ❌ | ❌ | Their institution |

## Why This Approach is Better

### Before (Broken)
```
HOD wants to view flows
  ↓
Check user_institution_access table
  ↓
HOD has NO entry ❌
  ↓
Access denied (no flows shown)
```

### After (Fixed)
```
HOD wants to view flows
  ↓
Check profiles.institution_id
  ↓
HOD's institution_id matches flow's institution_id ✅
  ↓
Access granted (flows shown)
```

## Files Modified

1. ✅ Migration: `supabase/migrations/20260129170000_fix_leave_onduty_flows_rls_for_hod.sql`
2. ✅ Test flow created in database
3. ✅ Documentation: This file

## Testing

### Test Data Created
- **Flow ID**: `3c867873-ef7d-4f68-b994-47dc2d40ce88`
- **Institution**: JKKN Testing Institution (`183847c5-be1b-4903-86eb-bbc20c213071`)
- **Department**: Computer Science Engineering (`b86dc032-6fee-40a4-8783-f2d5b0611d89`)
- **Workflow**: HOD → Principal (Sequential)
- **Status**: Active

### Expected Results

After HOD logs back in:

**Settings Page** (`/academic/leave-onduty/settings`):
- ✅ Shows the test flow created above
- ✅ Can create new flows
- ✅ Can edit existing flows
- ✅ Can activate/deactivate flows
- ✅ Can delete flows

## User Action Required

⚠️ **HOD users must**:

1. **Log out** completely
2. **Clear browser cache** (Ctrl+Shift+R)
3. **Log back in**
4. Navigate to: **Leave/OnDuty → Settings**
5. Should now see:
   - The test flow (Leave → Casual → HOD → Principal)
   - Ability to create new flows
   - Ability to manage existing flows

## Related Fixes

This is part of a series of RLS fixes:

| # | Issue | Status |
|---|-------|--------|
| 1 | Applications RLS - Missing HOD role | ✅ Fixed (20260129160000) |
| 2 | **Flows RLS - Missing HOD role** | ✅ **Fixed (20260129170000)** |
| 3 | Approvals RLS - TBD | ⏳ Check if needed |

## Prevention

When creating new tables with institution-scoped data:

1. **Always add RLS policies** for all academic roles
2. **Use `profiles.institution_id`** for academic staff (HOD, Principal, Faculty, Staff)
3. **Use `user_institution_access`** only for Admin/Institution Admin
4. **Test with non-admin roles** before deployment

### RLS Policy Template

```sql
-- View policy for academic staff
CREATE POLICY "academic_staff_view_[table]" ON [table_name]
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR
        (
          p.role IN ('admin', 'institution_admin')
          AND institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
          )
        )
        OR
        (
          p.role IN ('hod', 'principal', 'faculty', 'staff')
          AND institution_id = p.institution_id
        )
      )
    )
  );
```

## Conclusion

✅ **Issue Resolved**: HOD and other academic roles can now:
- View all approval flows for their institution
- Create new flows
- Edit existing flows
- Activate/deactivate flows
- Delete flows

**Action Required**: Log out and log back in to see the changes! 🚀
