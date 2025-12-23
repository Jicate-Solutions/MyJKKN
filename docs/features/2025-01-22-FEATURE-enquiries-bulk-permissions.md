# Feature: Role-Based Permission Access for Bulk Operations

**Date:** 2025-01-22
**Module:** Learners > Enquiries
**Status:** ✅ Implemented

---

## 📋 Overview

Implemented role-based permission control for bulk operations in the Enquiries module. Only users with specific permissions (or Super Admin) can access bulk upload and bulk status update features.

---

## 🔐 Permission System

### Permission Keys Added

```typescript
// Added to lib/constants/permissions.ts
{ key: 'learners.enquiries.bulk_upload', label: 'Bulk Upload Enquiries' },
{ key: 'learners.enquiries.bulk_status_update', label: 'Bulk Status Update for Enquiries' }
```

### Permission Categories

**Location:** `lib/constants/permissions.ts` → Students Category

```
📁 Students (key: 'students')
  ├── learners.enquiries.bulk_upload
  └── learners.enquiries.bulk_status_update
```

---

## 👥 Access Control

### Super Admin
- ✅ **Full Access**: Can perform all bulk operations
- ✅ **Automatic**: No need to assign permissions
- ✅ **Override**: Bypasses all permission checks

### Custom Roles
- ⚠️ **Restricted Access**: Must be explicitly granted permissions
- ✅ **Granular Control**: Can grant only specific operations
- ✅ **Flexible**: Can combine with other learner permissions

---

## 🛠️ Implementation Details

### 1. Bulk Upload Permission

**File:** `app/(routes)/learners/enquiries/page.tsx`

**Before:**
```tsx
<CanView module="learners.create">
  <div className="flex gap-2">
    <BulkUploadEnquiries onSuccess={handleBulkUploadSuccess} />
    <Button asChild>
      <Link href="/learners/enquiries/new">New Enquiry</Link>
    </Button>
  </div>
</CanView>
```

**After:**
```tsx
<div className="flex gap-2">
  <PermissionGuard module="learners.enquiries" action="bulk_upload">
    <BulkUploadEnquiries onSuccess={handleBulkUploadSuccess} />
  </PermissionGuard>
  <CanView module="learners.create">
    <Button asChild>
      <Link href="/learners/enquiries/new">New Enquiry</Link>
    </Button>
  </CanView>
</div>
```

**Benefits:**
- ✅ Bulk upload button hidden if no permission
- ✅ Separate from "Create Learner" permission
- ✅ Can grant bulk upload without granting create

### 2. Bulk Status Update Permission

**File:** `app/(routes)/learners/enquiries/_components/enquiries-data-table.tsx`

**Before:**
```tsx
<Button onClick={() => handleBulkStatusUpdate(...)}>
  <RefreshCw className="mr-2 h-4 w-4" />
  Change Status ({props.selectedRows.length})
</Button>
```

**After:**
```tsx
<PermissionGuard module="learners.enquiries" action="bulk_status_update">
  <Button onClick={() => handleBulkStatusUpdate(...)}>
    <RefreshCw className="mr-2 h-4 w-4" />
    Change Status ({props.selectedRows.length})
  </Button>
</PermissionGuard>
```

**Benefits:**
- ✅ Button hidden if no permission
- ✅ Works even when rows are selected
- ✅ Separate from delete permission

---

## 🔑 How to Assign Permissions

### For Administrators

1. Navigate to **Users > Role Management**
2. Select or create a custom role
3. Scroll to **Students** permission category
4. Enable permissions:
   - ✅ **Bulk Upload Enquiries** - Allows uploading multiple enquiries via Excel
   - ✅ **Bulk Status Update for Enquiries** - Allows changing status for multiple enquiries

### Permission Combinations

| Use Case | Permissions Required |
|----------|---------------------|
| **Data Entry Staff** | `learners.enquiries.bulk_upload` |
| **Admissions Coordinator** | `learners.enquiries.bulk_upload` + `learners.enquiries.bulk_status_update` |
| **Admissions Manager** | Full access to all learner permissions |
| **Super Admin** | All permissions (automatic) |

---

## 🎭 Permission Behavior

### When User Has Permission
```
✅ Button/feature visible
✅ Can execute operation
✅ No error message
```

### When User Lacks Permission
```
❌ Button/feature hidden
❌ Cannot access feature
❌ No fallback message (clean UI)
```

### When User is Super Admin
```
✅ All features visible
✅ Bypasses all checks
✅ No need for specific permissions
```

---

## 🧪 Testing Scenarios

### Test 1: Super Admin Access
```
User Role: Super Admin
Expected: See all bulk operation buttons
Result: ✅ Pass
```

### Test 2: Custom Role with Bulk Upload Only
```
User Role: Data Entry (custom)
Permissions: learners.enquiries.bulk_upload
Expected:
  - ✅ See "Bulk Upload" button
  - ❌ Don't see "Change Status" button
Result: ✅ Pass
```

### Test 3: Custom Role with Bulk Status Update Only
```
User Role: Status Manager (custom)
Permissions: learners.enquiries.bulk_status_update
Expected:
  - ❌ Don't see "Bulk Upload" button
  - ✅ See "Change Status" button (when rows selected)
Result: ✅ Pass
```

### Test 4: Custom Role with No Bulk Permissions
```
User Role: Viewer (custom)
Permissions: students.view only
Expected:
  - ❌ Don't see "Bulk Upload" button
  - ❌ Don't see "Change Status" button
Result: ✅ Pass
```

---

## 📊 Permission Matrix

| Role | Bulk Upload | Bulk Status Update | Delete | Create Individual |
|------|-------------|-------------------|--------|-------------------|
| **Super Admin** | ✅ | ✅ | ✅ | ✅ |
| **Admissions Manager** | ✅ | ✅ | ✅ | ✅ |
| **Admissions Coordinator** | ✅ | ✅ | ❌ | ✅ |
| **Data Entry Staff** | ✅ | ❌ | ❌ | ❌ |
| **Status Manager** | ❌ | ✅ | ❌ | ❌ |
| **Viewer** | ❌ | ❌ | ❌ | ❌ |

---

## 🔧 Technical Details

### Permission Guard Component

**Component Used:** `PermissionGuard` from `@/components/auth/permission-guard`

**Props:**
- `module`: Module key (e.g., "learners.enquiries")
- `action`: Action key (e.g., "bulk_upload")
- `children`: Content to show when permission granted
- `fallback`: (Optional) Content to show when permission denied

**Example:**
```tsx
<PermissionGuard module="learners.enquiries" action="bulk_upload">
  <BulkUploadButton />
</PermissionGuard>
```

### Permission Check Logic

```typescript
// From @/components/auth/permission-guard.tsx

// 1. Check if user is Super Admin
if (isSuperAdmin) {
  return <>{children}</>; // Always show
}

// 2. Check specific permission
const hasPermission = canPerformAll(module, actions);

// 3. Render based on check
return hasPermission ? children : fallback;
```

---

## 📝 Database Schema

No database changes required. Permissions are stored in existing role management tables:

- `roles` table: Stores custom roles
- `role_permissions` table: Stores module-action permissions
- `user_roles` table: Assigns roles to users

---

## 🚀 Future Enhancements

Potential improvements:

1. **Audit Logging**: Log who performs bulk operations
2. **Approval Workflow**: Require approval for bulk status changes
3. **Permission Presets**: Pre-configured permission sets for common roles
4. **Bulk Operation Limits**: Limit number of records per operation by role
5. **Time-based Permissions**: Allow bulk operations only during specific hours

---

## 📚 Related Documentation

- **Permission System**: `docs/features/permission-system.md` (if exists)
- **Role Management**: `docs/features/role-management.md` (if exists)
- **Bulk Upload Feature**: `docs/features/2025-01-22-FEATURE-enquiries-bulk-operations.md`
- **Bulk Upload Fix**: `docs/fixes/2025-01/2025-01-22-FIX-bulk-upload-modal-responsiveness.md`

---

## ✅ Checklist

- [x] Added permission keys to permissions.ts
- [x] Wrapped bulk upload button with PermissionGuard
- [x] Wrapped bulk status button with PermissionGuard
- [x] Imported PermissionGuard in both files
- [x] Tested with Super Admin (all features visible)
- [x] Tested with restricted role (features hidden)
- [x] Created documentation

---

**Last Updated:** 2025-01-22
**Status:** Production Ready ✅
**Reviewed By:** System

## 🎯 Key Takeaway

> **Only users with explicit permissions (or Super Admin) can perform bulk operations. This ensures data security and proper access control in the admission management workflow.**
