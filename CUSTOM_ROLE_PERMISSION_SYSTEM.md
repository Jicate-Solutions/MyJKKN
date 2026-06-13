# Custom Role Permission System - BOS Access Control

## System Design

The BOS module (and all other modules) use a **custom role permission override system** where:

1. **Default permissions** are defined in TypeScript constants
2. **Custom role permissions** stored in `custom_roles.permissions` JSONB **override** the defaults
3. **Super Admin** bypasses everything and gets all permissions automatically

---

## Permission Resolution Flow

### Client-Side: `usePermissions()` Hook

```typescript
// hooks/use-permissions.ts

// STEP 1: Check if super admin
if (profile.role === 'super_admin' || profile.is_super_admin === true) {
  return { isSuperAdmin: true, permissions: {} };
}

// STEP 2: Fetch custom_roles via user_roles junction
const roles = await UserRolesService.getUserRoles(userId);
// Returns: [{ role_key, permissions: { 'academic.bos-syllabus.view': true, ... } }, ...]

// STEP 3: Merge permissions from ALL assigned custom_roles (union logic)
const mergedPermissions = {};
for (const role of roles) {
  for (const [key, value] of Object.entries(role.permissions || {})) {
    // OR logic: if ANY role grants a permission, user has it
    if (value === true) {
      mergedPermissions[key] = true;
    }
  }
}

// STEP 4: Apply BOS fallback if role has ZERO academic.bos-* keys
applyBOSFallback(mergedPermissions, [
  ...roles.map(r => r.role_key),
  profile.role  // fallback to profile role key
]);

// STEP 5: Check permission at usage time
canAccess('academic.bos-syllabus', 'view')
// → checks: mergedPermissions['academic.bos-syllabus.view'] === true
```

### Server-Side: RPC Call

```typescript
// lib/utils/bos/bos-access.ts: canAccessBos()

// Calls the same Supabase RPC that reads custom_roles.permissions
const { data: hasPerm } = await supabase.rpc('user_has_permission', {
  permission_name: 'academic.bos-syllabus.view'
});
// Returns true/false from the exact same DB column as the client
```

---

## Role Assignment Model

### How Permissions Get Assigned to a User

**Path 1: Default Role (rarely used in BOS)**
```sql
-- If a user has NO entries in user_roles table
-- They fall back to their profile.role
profiles.role = 'hod'
  → getRolePermissions('hod')
  → [academic.bos-syllabus: ['view', 'create', 'edit', ...], ...]
  → Loaded via applyBOSFallback()
```

**Path 2: Custom Role Assignment (preferred for BOS)**
```sql
-- Insert entry linking user to a custom_role
INSERT INTO user_roles (user_id, role_id)
SELECT p.id, cr.id
FROM profiles p
JOIN custom_roles cr ON cr.role_key = 'teaching_faculty'
WHERE p.id = '<student_or_other_user>';

-- That custom_role has explicit permissions in its JSONB:
custom_roles.permissions = {
  "academic.bos-syllabus.view": true,
  "academic.bos-syllabus.create": true,
  "academic.bos-compositions.view": true,
  ...
}
-- User now gets those permissions regardless of their profile.role
```

### Why Path 2 is Better for BOS

✅ **Advantages:**
- No need to change `profile.role`
- User can have multiple roles via union merge
- Explicit, auditable permission grants
- Works for ANY profile role (student, staff, parent, custom, etc.)
- Permissions live in one place (custom_roles.permissions JSONB)

❌ **Path 1 disadvantages:**
- Changing `profile.role` to 'faculty' affects entire app access
- Can't have student who also teaches one course
- Must maintain separate role definitions

---

## Current Default Permissions by System Role

### System Roles (TypeScript constants - rarely override)
| Role | BOS Access | Reason |
|------|-----------|--------|
| super_admin | ✅ All | Built-in bypass |
| administrator | ✅ All | Full management |
| principal | ✅ Read + Approve | Governance role |
| hod | ✅ Create/Edit/Revise | Department chair |
| faculty | ✅ Create/Edit/Revise | Board member |
| coordinator | ✅ Create/Edit | Operational support |
| **student** | ❌ None (view only) | **NOT a BOS actor** |
| staff | ❌ None | **NOT a BOS actor** |
| parent | ❌ None | **NOT a BOS actor** |
| guest | ❌ None | **NOT a BOS actor** |
| driver | ❌ None | **NOT a BOS actor** |

### Default Role Permissions (lib/services/bos/bos-role-permissions.ts)

```typescript
const DEFAULT_ROLE_PERMISSIONS = {
  // ... skipping non-BOS roles ...
  
  // These are ONLY used as fallback when:
  // 1. User has NO entries in user_roles table, AND
  // 2. Their profiles.role matches one of these keys
  
  faculty: {
    'academic.bos-syllabus': ['view', 'create', 'edit', 'revise', 'duplicate', 'export'],
    'academic.bos-compositions': ['view', 'edit'],
    'academic.bos-meetings': ['view', 'edit'],
    'academic.bos-courses': ['view', 'create', 'edit'],
    // ... more modules ...
  },
  
  hod: {
    'academic.bos-syllabus': ['view', 'create', 'edit', 'revise', 'duplicate', 'export'],
    'academic.bos-compositions': ['view', 'create', 'edit'],
    'academic.bos-meetings': ['view', 'create', 'edit'],
    'academic.bos-courses': ['view', 'create', 'edit', 'import'],
    // ... more modules ...
  },
  
  principal: {
    'academic.bos-syllabus': ['view', 'export'],
    'academic.bos-compositions': ['view', 'create', 'edit'],
    'academic.bos-meetings': ['view', 'create', 'edit'],
    // ... read-only on most modules ...
  },
  
  // students, staff, parent, etc. NOT IN THIS TABLE
  // Falls back to 'default' which only has ['view'] for each module
  
  default: {
    'academic.bos-syllabus': ['view'],
    'academic.bos-compositions': ['view'],
    'academic.bos-meetings': ['view'],
    // ... view-only for all modules ...
  }
};
```

---

## How to Grant BOS Access to a Student or Custom Role

### Scenario 1: Student who Teaches

**Requirement:** A student (profile.role = 'student') needs to create and edit syllabi.

**Solution:**

```sql
-- 1. Create or find the custom role for teaching students
INSERT INTO custom_roles (role_key, display_name, permissions)
VALUES (
  'teaching_student',
  'Teaching Student',
  '{
    "academic.bos-syllabus": ["view", "create", "edit", "revise"],
    "academic.bos-compositions": ["view", "edit"],
    "academic.bos-meetings": ["view", "edit"]
  }'::jsonb
)
ON CONFLICT (role_key) DO UPDATE SET permissions = EXCLUDED.permissions;

-- 2. Assign that role to the student
INSERT INTO user_roles (user_id, role_id)
SELECT p.id, cr.id
FROM profiles p
JOIN custom_roles cr ON cr.role_key = 'teaching_student'
WHERE p.id = '<student_uuid>' AND p.role = 'student';

-- Result: Student now has BOS permissions even with profile.role = 'student'
```

### Scenario 2: Staff Member in Specific Module

**Requirement:** Staff member (profile.role = 'staff') needs view-only access to syllabi.

**Solution:**

```sql
INSERT INTO custom_roles (role_key, display_name, permissions)
VALUES (
  'syllabus_viewer',
  'Syllabus Viewer',
  '{
    "academic.bos-syllabus": ["view"]
  }'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT p.id, cr.id
FROM profiles p
JOIN custom_roles cr ON cr.role_key = 'syllabus_viewer'
WHERE p.id = '<staff_uuid>';
```

### Scenario 3: Parent Who Reviews Documents

**Requirement:** Parent needs to view (but not edit) course documents.

**Solution:**

```sql
INSERT INTO custom_roles (role_key, display_name, permissions)
VALUES (
  'document_viewer',
  'Document Viewer',
  '{
    "academic.bos-syllabus": ["view", "export"],
    "academic.bos-courses": ["view"]
  }'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT p.id, cr.id
FROM profiles p
JOIN custom_roles cr ON cr.role_key = 'document_viewer'
WHERE p.id = '<parent_uuid>';
```

---

## Permission Check at Runtime

### Client-Side Check

```typescript
// In a component
const { canAccess } = usePermissions();

if (canAccess('academic.bos-syllabus', 'create')) {
  // Show "New Syllabus" button
}

// What happens internally:
// 1. usePermissions hook fetches user_roles
// 2. Merges permissions from all assigned custom_roles
// 3. Checks merged['academic.bos-syllabus.create'] === true
```

### Server-Side Check

```typescript
// In API route
const hasPermission = await canAccessBos(userId, 'academic.bos-syllabus', 'create');
if (!hasPermission) {
  return 403; // Forbidden
}

// What happens internally:
// 1. Calls RPC: user_has_permission('academic.bos-syllabus.create')
// 2. RPC queries custom_roles.permissions from all user_roles entries
// 3. Returns true if ANY assigned custom_role has that permission = true
```

---

## Best Practices

### ✅ DO

1. **Use custom roles for BOS access**, not profile.role changes
   ```sql
   -- ✅ Good: Student gets BOS perms without changing role
   INSERT INTO user_roles (user_id, role_id) ... WHERE role_key = 'teaching_student';
   
   -- ❌ Avoid: Changing profile.role affects entire app
   UPDATE profiles SET role = 'faculty' WHERE id = '<student_id>';
   ```

2. **Use canonical permission key format**: `academic.bos-<module>.<action>`
   ```json
   // ✅ Good
   { "academic.bos-syllabus.view": true }
   
   // ❌ Bad (legacy/wrong)
   { "bos.syllabus.view": true }
   { "bos_syllabus_view": true }
   ```

3. **Grant minimal necessary permissions**
   ```json
   // ✅ Good: Only what they need
   { "academic.bos-syllabus.view": true }
   
   // ❌ Avoid: Over-broad
   { "academic.bos-syllabus": true }  // not a real format
   ```

4. **Use multi-role assignment for users with multiple responsibilities**
   ```sql
   -- ✅ Good: User has both roles
   INSERT INTO user_roles (user_id, role_id) VALUES ('<id>', <faculty_role_id>);
   INSERT INTO user_roles (user_id, role_id) VALUES ('<id>', <syllabus_reviewer_id>);
   -- Permissions merge (union), so user has faculties + reviewer perms
   ```

### ❌ DON'T

1. **Don't rely on default role permissions for custom actors**
   ```sql
   -- ❌ Bad: Student has no default BOS access
   UPDATE profiles SET role = 'student' WHERE role = 'teaching_faculty';
   -- Result: User loses all BOS access even though they're still teaching
   ```

2. **Don't mix permission key formats**
   ```json
   // ❌ Bad: Inconsistent
   {
     "academic.bos-syllabus.view": true,    // dot-format
     "bos_syllabus_create": true,           // underscore-format
     "academic.bos.courses.view": true      // extra dot
   }
   ```

3. **Don't grant permissions on the fly without auditing**
   ```typescript
   // ❌ Bad: No audit trail
   const hasAccess = user.roles.includes('faculty');
   
   // ✅ Good: Explicit DB-stored permissions
   const hasAccess = mergedPermissions['academic.bos-syllabus.view'] === true;
   ```

---

## Debugging Custom Role Access

### Check a User's Assigned Roles

```sql
SELECT ur.*, cr.role_key, cr.permissions
FROM user_roles ur
JOIN custom_roles cr ON ur.role_id = cr.id
WHERE ur.user_id = '<user_uuid>';
```

### Check What Permissions a Role Has

```sql
SELECT role_key, permissions
FROM custom_roles
WHERE role_key LIKE 'academic.bos%' OR role_key LIKE '%teaching%'
ORDER BY role_key;
```

### Check if Permissions Match Format

```sql
-- Find permissions with wrong format (should all be "academic.bos-*")
SELECT role_key, jsonb_object_keys(permissions) as perm_key
FROM custom_roles
WHERE jsonb_object_keys(permissions) NOT LIKE 'academic.bos-%'
  AND role_key LIKE '%bos%';
```

### Test Permission Resolution

```typescript
// In browser console (NextJS dev mode)
import { usePermissions } from '@/hooks/use-permissions';

const { canAccess, userRoles } = usePermissions();
console.log('Assigned roles:', userRoles);
console.log('Can create syllabus?', canAccess('academic.bos-syllabus', 'create'));
console.log('Can view compositions?', canAccess('academic.bos-compositions', 'view'));
```

---

## Summary

**BOS Access Model:**
1. Super Admin → Auto all permissions
2. System Roles (HOD, Faculty, Principal) → Default permissions applied via fallback
3. **Custom Roles (recommended for non-default access) → Explicit permissions in custom_roles.permissions JSONB**
4. Manual Assignment → Link users to custom_roles via user_roles junction

**For Students, Staff, Parents, or Custom Actors:**
- Don't change profile.role
- Instead: Create a custom_role with required permissions + assign via user_roles
- Permissions stored as JSONB: `{ "academic.bos-<module>.<action>": true }`
- System merges all assigned roles using union (OR) logic
