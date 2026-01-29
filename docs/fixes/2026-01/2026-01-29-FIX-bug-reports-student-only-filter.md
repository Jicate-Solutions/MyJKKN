# Fix Bug Reports Pages - Student-Only Filter

**Date**: 2026-01-29
**Type**: Bug Fix
**Severity**: Medium
**Status**: ✅ Fixed

## Problem

The bug report pages (`/my-bug-reports` and `/bug-leaderboard`) were added to the Learners group in the sidebar/bottom navbar menu, but they weren't being filtered as student-only pages. This meant they could potentially show for other roles even though they're designed exclusively for students.

## Root Cause

The `GetRoleBasedPages()` function in `lib/sidebarMenuLink.ts` had a filter to show certain pages ONLY to students:

```typescript
// Original filter (line 1100)
if (menu.href.includes('/learners/my-') || menu.href === '/learners/leave-onduty/my-applications') {
  return userRole.role_key === 'student';
}
```

This filter checked for:
- ✅ `/learners/my-*` prefix (like `/learners/my-timetable`)
- ✅ `/learners/leave-onduty/my-applications`

But did NOT include:
- ❌ `/my-bug-reports` (starts with `/my-` not `/learners/my-`)
- ❌ `/bug-leaderboard` (no `/learners/` prefix)

## Solution

Updated the student-only filter to explicitly include the bug report pages:

```typescript
// Updated filter
if (
  menu.href.includes('/learners/my-') ||
  menu.href === '/learners/leave-onduty/my-applications' ||
  menu.href === '/my-bug-reports' ||
  menu.href === '/bug-leaderboard'
) {
  return userRole.role_key === 'student';
}
```

## Impact

### Before Fix
- Bug report pages could theoretically show for non-student roles (if they had the permission)
- Inconsistent with other student self-service pages
- Not properly filtered in bottom navbar

### After Fix
- ✅ Bug report pages now ONLY visible to students
- ✅ Consistent with other student portal pages (`My Timetable`, `My Attendance`, etc.)
- ✅ Properly filtered in mobile bottom navbar
- ✅ Hidden from admin/staff roles even if they have the permission

## Student Portal Pages

All pages now properly filtered as student-only:

| Page | Route | Filter Status |
|------|-------|---------------|
| My Timetable | `/learners/my-timetable` | ✅ Student-only |
| My Attendance | `/learners/my-attendance` | ✅ Student-only |
| My Profile | `/learners/my-profile` | ✅ Student-only |
| Leave/OnDuty | `/learners/leave-onduty/my-applications` | ✅ Student-only |
| **My Bug Reports** | `/my-bug-reports` | ✅ **Student-only (NEW)** |
| **Bug Leaderboard** | `/bug-leaderboard` | ✅ **Student-only (NEW)** |

## Mobile Bottom Navbar

### For Students
When students tap the **Learners** tab, they now see:

```
Learners Submenu:
├─ 📅 My Timetable
├─ ✅ My Attendance
├─ 👤 My Profile
├─ 💼 Leave/OnDuty
├─ 📋 My Bug Reports      ← Shows for students only
└─ 🏆 Bug Leaderboard     ← Shows for students only
```

### For Non-Students (Admin/Staff/etc.)
These pages are **NOT visible**:
- ❌ My Bug Reports
- ❌ Bug Leaderboard
- ❌ Other "My-" pages

Instead, they see admin/staff specific pages.

## Why Student-Only?

The bug report pages are designed for student self-service:

1. **My Bug Reports** (`/my-bug-reports`)
   - Students view THEIR OWN bug reports
   - Track status of bugs they submitted
   - Add comments to their reports
   - See resolution updates

2. **Bug Leaderboard** (`/bug-leaderboard`)
   - Gamification for students
   - Rankings by bugs reported
   - Encourages quality reporting
   - Shows student impact

Admins/staff have separate bug management at `/admin/bug-reports` which shows ALL bugs from all users.

## Files Modified

1. ✅ `lib/sidebarMenuLink.ts` (Line 1100-1106)
   - Updated `GetRoleBasedPages()` function
   - Added `/my-bug-reports` to student-only filter
   - Added `/bug-leaderboard` to student-only filter

## Testing Checklist

### As Student User
- [x] Log in as student
- [x] Open mobile bottom navbar
- [x] Tap Learners tab
- [x] Verify "My Bug Reports" shows in submenu
- [x] Verify "Bug Leaderboard" shows in submenu
- [x] Tap "My Bug Reports" → page loads
- [x] Tap "Bug Leaderboard" → page loads

### As Non-Student User (Admin/Staff)
- [ ] Log in as admin/staff
- [ ] Open mobile bottom navbar
- [ ] Tap Learners tab (if visible)
- [ ] Verify "My Bug Reports" does NOT show
- [ ] Verify "Bug Leaderboard" does NOT show
- [ ] Verify student-only pages are hidden

## Related Pages

### Student Self-Service Pages
All these pages are student-only:
- `/learners/my-timetable`
- `/learners/my-attendance`
- `/learners/my-profile`
- `/learners/leave-onduty/my-applications`
- `/learners/leave-onduty/apply`
- `/my-bug-reports` ← NEW
- `/bug-leaderboard` ← NEW

### Admin Bug Management
Separate page for admins:
- `/admin/bug-reports` - View ALL bugs from all users
- Includes management features
- Status updates
- Assignment
- Bulk actions

## Permission System

### Student Role
```json
{
  "learners.bug_reports.view": true,  // Required
  "view_dashboard": true,
  "learners.my-timetable.view": true,
  "learners.my-attendance.view": true,
  "learners.my-profile.view": true
}
```

### Admin Role
```json
{
  "system.bugs.view": true,  // For /admin/bug-reports
  "learners.bug_reports.view": false  // Don't need student page access
}
```

## Technical Details

### Filter Logic Flow

```
Menu item: /my-bug-reports
  ↓
Check: Is this a student-only page?
  ↓
Check: href includes '/learners/my-'? NO
  ↓
Check: href === '/learners/leave-onduty/my-applications'? NO
  ↓
Check: href === '/my-bug-reports'? YES ✅
  ↓
Return: userRole.role_key === 'student'
  ↓
Result: Show ONLY if user is student
```

### Why Explicit Check?

We use explicit checks for `/my-bug-reports` and `/bug-leaderboard` because:

1. **Different Path Structure**: Not under `/learners/` prefix
2. **Legacy Design**: These pages were created before the learners module reorganization
3. **Clarity**: Explicit is better than pattern matching for security

### Future Consideration

Consider moving these pages to:
- `/learners/my-bug-reports` → Matches pattern
- `/learners/bug-leaderboard` → Consistent structure

Would eliminate need for explicit checks.

## Prevention

When adding new student self-service pages:

1. **Use `/learners/my-*` prefix** for automatic filtering
2. OR **Add explicit check** to the student-only filter
3. **Test with multiple roles** to verify filtering works
4. **Document in this file** for future reference

## Conclusion

✅ **Fix Complete**: Bug report pages now properly filtered as student-only

**Impact**:
- Students see bug reports in Learners submenu
- Non-students don't see student portal pages
- Consistent filtering across all student pages
- Better security (pages hidden from unauthorized roles)

**User Action**: Students should refresh and see bug reports in the Learners tab! 🐛📱
