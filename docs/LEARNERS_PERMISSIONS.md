# Learners Module - Granular Permissions Guide

**Created**: 2025-12-29
**Purpose**: Document the granular permission structure for the Learners Management module

---

## 🎯 Overview

The Learners module now uses **granular permissions** instead of a single `learners.view` permission. This allows administrators to grant access to specific pages within the Learners module.

---

## 📋 Permission Structure

### Page-Specific Permissions

| Menu Item | Route | Permission Required | Description |
|-----------|-------|---------------------|-------------|
| **Analytics Dashboard** | `/learners/analytics` | `learners.dashboard.view` | View learner analytics and statistics |
| **Admission Management** | `/learners/enquiries` | `learners.admissions.view` | View admission enquiries and applications |
| **Learner Profiles** | `/learners/profiles` | `learners.profiles.view` | View all learner profiles |
| **My Attendance** | `/learners/attendance` | `learners.attendance.view` + **role='student'** | View own attendance (**STUDENTS ONLY - hidden from all other roles**) |
| **Alumni & Graduates** | `/learners/alumni` | `learners.alumni.view` | View alumni and graduated learners |

### Action-Based Permissions

| Action | Permission | Applies To |
|--------|-----------|------------|
| Create admission | `learners.admissions.create` | Enquiries, Applications |
| Edit admission | `learners.admissions.edit` | Enquiries, Applications |
| Delete admission | `learners.admissions.delete` | Enquiries, Applications |
| Edit learner profile | `learners.edit` | Individual profiles |
| Bulk edit learners | `learners.bulk_edit` | Profile bulk operations |
| Promote students | `learners.promotion.view` | Student promotion page |

---

## 👥 Role-Based Permission Examples

### Student Role
```json
{
  "learners.attendance.view": true
}
```
**Sees**: Only "My Attendance" menu
**Hidden**: Analytics, Admissions, Profiles, Alumni

### HOD Role
```json
{
  "learners.dashboard.view": true,
  "learners.profiles.view": true,
  "learners.alumni.view": true
}
```
**Sees**: Analytics Dashboard, Learner Profiles, Alumni
**Hidden**: Admission Management, My Attendance

### Admissions Officer Role
```json
{
  "learners.admissions.view": true,
  "learners.admissions.create": true,
  "learners.admissions.edit": true
}
```
**Sees**: Only Admission Management
**Can**: View, create, and edit enquiries/applications
**Hidden**: All other learners pages

### Administrator Role
```json
{
  "learners.dashboard.view": true,
  "learners.admissions.view": true,
  "learners.admissions.create": true,
  "learners.admissions.edit": true,
  "learners.profiles.view": true,
  "learners.edit": true,
  "learners.bulk_edit": true,
  "learners.alumni.view": true
}
```
**Sees**: All learners pages (except student-specific attendance)
**Can**: Full CRUD operations on most resources

---

## ⚠️ Special Case: Student-Only "My Attendance"

The **"My Attendance"** menu has **role-based visibility** in addition to permission checks:

- ✅ **Students**: Menu is visible (if they have `learners.attendance.view` permission)
- ❌ **All Other Roles**: Menu is **HIDDEN** (including Super Admin!)

### Implementation
```typescript
// Sidebar filtering for SUPER ADMIN (lib/sidebarMenuLink.ts)
if (userRole?.role_key === 'super_admin') {
  // Filter out student-only pages even from super admin
  return allMenus.map((group) => ({
    ...group,
    menus: group.menus.filter((menu) => menu.href !== '/learners/attendance')
  }));
}

// Sidebar filtering for ALL OTHER ROLES (lib/sidebarMenuLink.ts)
if (menu.href === '/learners/attendance') {
  return userRole.role === 'student' || userRole.role_key === 'student';
}

// Page access validation (app/(routes)/learners/attendance/page.tsx)
if (profile?.role !== 'student' || !profile.learner_id) {
  redirect('/');  // Non-students are redirected
}
```

### Why This Approach?
- **"My Attendance"** is student self-service only
- Faculty/Admin should NOT see their "own attendance" (doesn't make sense)
- Even **Super Admin** should not see student-specific features
- Keeps the Learners menu clean for admin users
- Prevents confusion about what "attendance" means for different roles

### Key Point: Super Admin Exception
Unlike other pages, "My Attendance" is **explicitly filtered out** even for Super Admin users. This is intentional because:
- Super admins don't have "attendance" to view (they're not students)
- It's a student self-service feature, not an admin tool
- Showing it would be confusing and serve no purpose

---

## 🔧 How It Works

### Sidebar Filtering
The sidebar uses the `MENU_PERMISSIONS` mapping to check if a user has access:

```typescript
// lib/sidebarMenuLink.ts
const MENU_PERMISSIONS = {
  '/learners/analytics': 'learners.dashboard.view',
  '/learners/enquiries': 'learners.admissions.view',
  '/learners/profiles': 'learners.profiles.view',
  '/learners/attendance': 'learners.attendance.view',
  '/learners/alumni': 'learners.alumni.view'
};
```

### Permission Checking Logic
```typescript
// Only show menu if user has the required permission
if (userRole.permissions['learners.dashboard.view'] === true) {
  // Show Analytics Dashboard
}
```

---

## 🚀 Granting Permissions

### Via Role Management UI
1. Navigate to **Users** → **Role Management**
2. Select the role to edit
3. In the **Learners** section, check the specific permissions needed:
   - ☑️ View Learner Analytics Dashboard
   - ☑️ View Learner Profiles
   - ☑️ View Alumni & Graduates
   - ☑️ View Own Attendance (Students)

### Via Database (Custom Roles)
```sql
-- Grant specific learners permissions to a role
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'learners.dashboard.view', true,
  'learners.profiles.view', true
)
WHERE role_key = 'hod';
```

---

## 📊 Migration from Legacy `learners.view`

### Old Behavior (Before 2025-12-29)
- Permission: `learners.view: true`
- Result: User sees **ALL** learners pages

### New Behavior (After 2025-12-29)
- Permission: Specific permissions for each page
- Result: User sees **ONLY** pages they have permission for

### Legacy Permission Status
The `learners.view` permission still exists but is **deprecated**:
- Label: "View Learners (Legacy - use specific permissions below)"
- Recommendation: Use granular permissions instead

---

## ✅ Best Practices

1. **Use Granular Permissions**: Don't grant `learners.view` to new roles
2. **Principle of Least Privilege**: Only grant permissions users actually need
3. **Student Role**: Should only have `learners.attendance.view`
4. **Combine with RLS**: Database RLS policies ensure data access is restricted even if UI permissions are misconfigured

---

## 🔒 Security Notes

- UI permissions control **menu visibility** only
- Database RLS policies control **data access**
- Always implement RLS policies for sensitive data
- Students should never have admin-level learners permissions

---

## 📝 Summary

| Permission | Purpose | Typical Roles |
|-----------|---------|---------------|
| `learners.dashboard.view` | Analytics access | Admin, HOD, Principal |
| `learners.admissions.view` | Admission management | Admin, Admissions Officer |
| `learners.profiles.view` | Profile management | Admin, HOD, Faculty |
| `learners.attendance.view` | Student self-service | **Student ONLY** (role-enforced) |
| `learners.alumni.view` | Alumni tracking | Admin, HOD |

---

**For questions or permission requests, contact the system administrator.**
