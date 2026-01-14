# Student Timetable Permission Update

**Date:** 2026-01-14
**Feature:** Mobile-First Student Timetable Page (`/learners/my-timetable`)

## Overview

Updated student role permissions to use the new `learners.timetable.view` permission instead of the old `academic.timetables.view` permission. This change aligns with the student-facing timetable feature and separates student permissions from admin/faculty timetable management.

## Changes Made

### 1. ✅ Permission Definition Added

**File:** `lib/constants/permissions.ts`
**Line:** 246

```typescript
{ key: 'learners.timetable.view', label: 'View Own Timetable (Students)' }
```

**Purpose:** Defines the new permission in the permission constants for UI display.

---

### 2. ✅ Menu Permission Mapping Added

**File:** `lib/sidebarMenuLink.ts`
**Lines:** 129, 652-657

```typescript
// Permission mapping
'/learners/my-timetable': 'learners.timetable.view',

// Menu item
{
  href: '/learners/my-timetable',
  label: 'My Timetable',
  active: pathname.startsWith('/learners/my-timetable'),
  icon: CalendarClock,
  submenus: []
}
```

**Purpose:** Maps the new route to the permission and adds the menu item to Learners Management group.

---

### 3. ✅ Database Migration Created

**File:** `supabase/migrations/20260114_student_timetable_permission.sql`

**What it does:**
- Removes `academic.timetables.view` from student role
- Adds `learners.timetable.view` to student role
- Verifies the update was successful
- Checks that `learners.attendance.view` also exists

**Migration SQL:**
```sql
UPDATE custom_roles
SET
  permissions = permissions - 'academic.timetables.view'
    || jsonb_build_object('learners.timetable.view', true),
  updated_at = now()
WHERE role_key = 'student'
  AND (permissions->>'academic.timetables.view' = 'true');
```

---

### 4. ✅ Student Role Function Updated

**File:** `supabase/setup/02_functions.sql`
**Function:** `ensure_student_role()`
**Lines:** 3513-3514

**Before:**
```sql
'learners.attendance.view', true,
'academic.timetables.view', true,
'academic.attendance.view', true,
```

**After:**
```sql
'learners.attendance.view', true,
'learners.timetable.view', true,
'academic.view', true,
```

**Purpose:** Updates the default permissions for newly created student roles.

---

## Permission Comparison

### Old Permission: `academic.timetables.view`
- ❌ Grants access to admin timetable management pages
- ❌ Shows all timetables for all sections/semesters
- ❌ Allows viewing timetable management interface
- ❌ Desktop-focused UI
- **Route:** `/academic/timetables`

### New Permission: `learners.timetable.view`
- ✅ Grants access to student's own timetable only
- ✅ Shows only current semester timetable for student's section
- ✅ Mobile-first, student-friendly interface
- ✅ Includes swipe navigation, countdown timer, course details
- **Route:** `/learners/my-timetable`

---

## Required Actions

### 1. Apply Database Migration

Run the migration to update existing student roles:

```bash
# If using Supabase CLI
npx supabase db push

# Or apply manually in Supabase SQL Editor
# Copy contents of: supabase/migrations/20260114_student_timetable_permission.sql
```

### 2. Verify Permission Update

After running migration, verify the student role has correct permissions:

```sql
-- Check student role permissions
SELECT
  role_key,
  role_name,
  permissions->>'academic.timetables.view' as old_permission,
  permissions->>'learners.timetable.view' as new_permission,
  permissions->>'learners.attendance.view' as attendance_permission
FROM custom_roles
WHERE role_key = 'student';
```

**Expected Result:**
- `old_permission`: `null` (should be removed)
- `new_permission`: `true` (should be added)
- `attendance_permission`: `true` (should already exist)

### 3. Test Student Access

1. **Login as Student:** Use a student account
2. **Check Menu:** Verify "My Timetable" appears in sidebar/bottom navbar
3. **Access Page:** Navigate to `/learners/my-timetable`
4. **Verify Data:** Ensure student sees their section's timetable
5. **Test Features:**
   - Swipe between days (Mon-Sat)
   - Check current period indicator
   - Tap class card to see details
   - Export to PDF

### 4. Verify Non-Student Access

1. **Login as Faculty/Admin:** Use a non-student account
2. **Check Menu:** "My Timetable" should NOT appear
3. **Direct Access:** Navigate to `/learners/my-timetable`
4. **Expected:** Should redirect to home page (/)

---

## Related Files

### Feature Implementation (17 new files)
- `types/student-portal.ts`
- `lib/services/learners/student-timetable-service.ts`
- `app/(routes)/learners/my-timetable/page.tsx`
- `app/(routes)/learners/my-timetable/_components/*.tsx` (8 components)

### Modified Files
- `lib/constants/permissions.ts` - Added permission definition
- `lib/sidebarMenuLink.ts` - Added menu item + permission mapping
- `supabase/setup/02_functions.sql` - Updated student role function
- `supabase/migrations/20260114_student_timetable_permission.sql` - New migration

---

## Rollback Instructions

If you need to rollback this change:

```sql
-- Revert to old permission
UPDATE custom_roles
SET
  permissions = permissions - 'learners.timetable.view'
    || jsonb_build_object('academic.timetables.view', true),
  updated_at = now()
WHERE role_key = 'student';
```

**Note:** Rollback will restore access to admin timetable management pages for students, which is NOT recommended.

---

## Benefits of This Change

1. **Better Security:** Students no longer have access to admin timetable management
2. **Mobile-First:** New page optimized for mobile devices (most students use phones)
3. **Better UX:** Timeline view, swipe navigation, current class indicator
4. **Clearer Permissions:** Separate student permissions from admin permissions
5. **Consistent Pattern:** Follows same pattern as `learners.attendance.view`

---

## Migration Status

- [x] Permission constant added
- [x] Menu item added
- [x] Migration file created
- [x] Function updated
- [x] **✅ Migration applied to database** (2026-01-14 via Supabase MCP)
- [ ] **TODO: Test student access**
- [ ] **TODO: Test non-student access**

---

## Support

If you encounter any issues:
1. Check that migration was applied successfully
2. Verify student role has `learners.timetable.view: true`
3. Ensure student has section and semester assigned
4. Check that active timetable exists for student's section
5. Review browser console for errors

For questions, refer to the implementation plan: `C:\Users\Admin\.claude\plans\temporal-meandering-reef.md`
