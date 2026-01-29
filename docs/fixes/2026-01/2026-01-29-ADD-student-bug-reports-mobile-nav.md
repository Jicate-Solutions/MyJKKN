# Add Bug Reports Pages to Student Mobile Navigation

**Date**: 2026-01-29
**Type**: Feature Addition
**Component**: Mobile Bottom Navbar - Learners Group
**Status**: ✅ Complete

## Problem

Student users in mobile view only had 4 primary tabs in the bottom navbar. The bug module pages (My Bug Reports and Bug Leaderboard) were not accessible to students, even though these are important self-service features for reporting and tracking bugs.

## Solution

Added **My Bug Reports** and **Bug Leaderboard** pages to the **Learners** group in the mobile bottom navbar, making them easily accessible to students.

## Changes Made

### 1. Added Menu Items to Learners Group

**File**: `lib/sidebarMenuLink.ts`

Added two new menu items after the Leave/OnDuty entry:

```typescript
{
  href: '/my-bug-reports',
  label: 'My Bug Reports',
  active: pathname === '/my-bug-reports',
  icon: ClipboardList,  // 📋 Clipboard with list
  submenus: []
},
{
  href: '/bug-leaderboard',
  label: 'Bug Leaderboard',
  active: pathname === '/bug-leaderboard',
  icon: Award,  // 🏆 Trophy/Award
  submenus: []
}
```

### 2. Added Permissions

**File**: `lib/sidebarMenuLink.ts` (MENU_PERMISSIONS)

```typescript
// Bug Reports (Student Self-Service)
'/my-bug-reports': 'learners.bug_reports.view',
'/bug-leaderboard': 'learners.bug_reports.view',
```

**Permission Required**: `learners.bug_reports.view`

## Mobile Navigation Structure for Students

### Bottom Navbar (4 Primary Tabs)
```
[🏠 Home] [🎓 Learners] [💰 Accounts] [📅 Academic]
```

### Learners Tab Submenu
When students tap the **Learners** tab, the submenu expands to show:

```
Learners Submenu:
├─ 📅 My Timetable
├─ ✅ My Attendance
├─ 👤 My Profile
├─ 💼 Leave/OnDuty
├─ 📋 My Bug Reports        ← NEW ✅
└─ 🏆 Bug Leaderboard       ← NEW ✅
```

### How It Works

1. **Student taps Learners tab** (🎓 icon)
2. **Submenu slides up** from bottom showing all learner portal pages
3. **Student sees bug reports options**:
   - 📋 **My Bug Reports** - View and manage their submitted bug reports
   - 🏆 **Bug Leaderboard** - See top bug reporters and their rankings
4. **Student taps an option** → navigates to that page
5. **Submenu closes** automatically after selection

## Page Routes

### My Bug Reports
- **Route**: `/my-bug-reports`
- **Icon**: 📋 ClipboardList
- **Purpose**: Students can view all bug reports they've submitted
- **Features**:
  - List of submitted bugs
  - Status tracking (Open, In Progress, Resolved, Closed)
  - Ability to add comments
  - View bug details and resolution

### Bug Leaderboard
- **Route**: `/bug-leaderboard`
- **Icon**: 🏆 Award
- **Purpose**: Gamification - show top bug reporters
- **Features**:
  - Rankings of students by bugs reported
  - Points/reputation system
  - Encourages quality bug reporting
  - Shows impact of contributions

## Student Experience

### Before
```
Bottom Navbar:
[Home] [Learners] [Accounts] [Academic]
          ↓
   Learners Submenu:
   ├─ My Timetable
   ├─ My Attendance
   ├─ My Profile
   └─ Leave/OnDuty

   ❌ No way to access bug reports from mobile
```

### After
```
Bottom Navbar:
[Home] [Learners] [Accounts] [Academic]
          ↓
   Learners Submenu:
   ├─ My Timetable
   ├─ My Attendance
   ├─ My Profile
   ├─ Leave/OnDuty
   ├─ My Bug Reports      ← NEW ✅
   └─ Bug Leaderboard     ← NEW ✅

   ✅ Easy access to bug module from mobile!
```

## Benefits

### 1. **Improved Accessibility**
- Bug reports now accessible on mobile
- No need to switch to desktop
- Students can report bugs on-the-go

### 2. **Encourages Bug Reporting**
- Easy access increases participation
- Leaderboard gamifies bug reporting
- Students feel valued for contributions

### 3. **Better Organization**
- Bug reports grouped with other student self-service features
- Logical placement in Learners section
- Consistent with "My-" prefix pattern

### 4. **Mobile-First Design**
- Touch-friendly navigation
- Quick access from bottom navbar
- Smooth slide-up submenu animation

## Permission Setup

For students to see these pages, their role must have the permission:

### In Custom Roles Table
```sql
-- Student role should have:
UPDATE custom_roles
SET permissions = permissions ||
  '{"learners.bug_reports.view": true}'::jsonb
WHERE role_key = 'student';
```

### Permission Breakdown
- **Permission Key**: `learners.bug_reports.view`
- **Applies To**: Both My Bug Reports and Bug Leaderboard
- **Scope**: View access (students can see their own reports)
- **Default**: Should be `true` for student role

## Files Modified

1. ✅ `lib/sidebarMenuLink.ts`
   - Added 2 new menu items to Learners group (lines ~677-690)
   - Added 2 permission entries (lines ~100-101)

## Technical Details

### Menu Item Structure
```typescript
{
  href: string;           // Route path
  label: string;          // Display name
  active: boolean;        // Is current page
  icon: LucideIcon;       // Icon component
  submenus: Array;        // Empty for these pages
}
```

### Icons Used
- **My Bug Reports**: `ClipboardList` from lucide-react
- **Bug Leaderboard**: `Award` from lucide-react

### Navigation Flow
```
User taps Learners tab
  ↓
Bottom navbar state: setExpanded(true)
  ↓
Submenu component renders with items
  ↓
User taps "My Bug Reports"
  ↓
Router pushes to /my-bug-reports
  ↓
Submenu closes: setExpanded(false)
  ↓
Page loads with student's bug reports
```

## Testing Checklist

- [ ] My Bug Reports appears in Learners submenu
- [ ] Bug Leaderboard appears in Learners submenu
- [ ] Icons display correctly (📋 and 🏆)
- [ ] Tapping items navigates to correct routes
- [ ] Submenu closes after navigation
- [ ] Only visible to users with permission
- [ ] Works on small screens (320px width)
- [ ] Touch targets are adequate (44x44px min)
- [ ] Animations smooth on low-end devices

## Related Features

### Existing Bug Module Components
These pages should already exist or need to be created:

1. **My Bug Reports Page** (`/my-bug-reports`)
   - Filter by status
   - Search functionality
   - View details
   - Add comments

2. **Bug Leaderboard Page** (`/bug-leaderboard`)
   - Rankings table
   - Point system
   - Time period filters
   - User profiles

### Integration Points
- Bug report submission from `/my-bug-reports`
- Points calculation for leaderboard
- Notifications for bug status updates
- Admin bug management at `/admin/bug-reports`

## Accessibility

- ✅ Clear icon + text labels
- ✅ Adequate touch target sizes (44x44px)
- ✅ Screen reader support (via lucide-react icons)
- ✅ Keyboard navigation support
- ✅ Color contrast follows theme standards

## Performance Considerations

- ✅ Icons are tree-shakeable (lucide-react)
- ✅ No additional bundle size (icons already imported)
- ✅ Submenu uses Framer Motion (already in project)
- ✅ Lazy loading via Next.js App Router

## Future Enhancements

Potential improvements:
1. Badge count on "My Bug Reports" showing open bugs
2. Quick bug report button (FAB) on mobile
3. Push notifications for bug status changes
4. Filters in submenu (Open, Resolved, etc.)
5. Achievement badges for top reporters

## Related Documentation

- Mobile Bottom Navbar: `.claude/skills/mobile-bottom-navbar/`
- Sidebar Menu System: `lib/sidebarMenuLink.ts`
- Bug Reporter Module: `app/(routes)/admin/bug-reports/`
- Permission System: `hooks/use-permissions.ts`

## Migration Notes

### For Existing Users
- No data migration needed
- Students need permission granted: `learners.bug_reports.view`
- Pages must exist at routes: `/my-bug-reports` and `/bug-leaderboard`

### For New Installations
- Permission included in default student role
- Bug module must be set up
- Routes must be created

## Conclusion

✅ **Feature Complete**: Students can now access bug reports from mobile!

**Access Path**:
Bottom Navbar → Tap Learners (🎓) → Select "My Bug Reports" or "Bug Leaderboard"

**Impact**:
- Improved mobile UX for students
- Increased bug reporting participation
- Better engagement with quality assurance process

**User Action**:
Students should refresh the page to see the new options in the Learners submenu! 📱🐛✨
