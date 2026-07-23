# BOS Role Permissions Configuration

## Overview
Board of Studies (BOS) module permissions assigned to institutional roles: HOD, Faculty, Principal, Administrator.

## Permission Modules
All BOS modules follow the pattern: `academic.bos-{module}`

### Modules
- `academic.bos-syllabi` — Course syllabi management
- `academic.bos-taxonomy` — Learning outcome frameworks (K-values, POs, PSOs)
- `academic.bos-experts` — External expert management
- `academic.bos-compositions` — Board composition management
- `academic.bos-meetings` — Meeting scheduling and management
- `academic.bos-ta-da` — TA/DA claims processing
- `academic.bos-reports` — BOS reports and analytics

## Actions Per Module
- `view` — View list and details
- `create` — Create new items
- `edit` — Edit existing items
- `delete` — Delete items (soft delete)
- Module-specific actions (e.g., `revise` for syllabi, `duplicate` for experts)

## Role Permissions Matrix

### Super Admin / Administrator
**All modules:** view, create, edit, delete, all special actions
- Can access any institution's BOS data (institution filter shows all)
- Can assign taxonomy, approve compositions, schedule meetings
- Full audit trail access

### Principal
**Syllabi:** view, export
**Taxonomy:** view
**Experts:** view
**Compositions:** view
**Meetings:** view
**TA/DA:** view
**Reports:** view

- Read-only access to all BOS modules
- Cannot edit or create any BOS items
- Can view reports and analytics

### HOD (Head of Department)
**Syllabi:** view, create, edit, revise, duplicate, export
**Taxonomy:** view, edit (for own regulation)
**Experts:** view, create, edit, delete
**Compositions:** view, create, edit (only own composition)
**Meetings:** view, create, edit (own meetings)
**TA/DA:** view, submit
**Reports:** view

- Can manage syllabi for their courses/regulations
- Can configure taxonomy for their regulation
- Can manage external experts and composition members
- Can schedule and manage meetings
- Can view TA/DA claims and submit new ones

### Faculty
**Syllabi:** view, export
**Taxonomy:** view
**Experts:** view
**Compositions:** view
**Meetings:** view
**TA/DA:** view, submit
**Reports:** view

- View-only access to syllabi and learning outcomes
- Can view meeting invitations and attend meetings
- Can view TA/DA status and submit new claims
- Can export syllabus PDFs

## Implementation

### Option 1: Database Seeding (Recommended for Production)
```sql
-- Insert role permissions for HOD
INSERT INTO role_permissions (role_id, module, action, created_at) VALUES
('hod', 'academic.bos-syllabi', 'view', now()),
('hod', 'academic.bos-syllabi', 'create', now()),
('hod', 'academic.bos-syllabi', 'edit', now()),
('hod', 'academic.bos-syllabi', 'revise', now()),
-- ... add all HOD permissions

-- Insert role permissions for Faculty
INSERT INTO role_permissions (role_id, module, action, created_at) VALUES
('faculty', 'academic.bos-syllabi', 'view', now()),
('faculty', 'academic.bos-syllabi', 'export', now()),
-- ... add all Faculty permissions
```

### Option 2: Custom Roles Table
Uses `custom_roles` table with role-specific permission bundles:
```json
{
  "role": "hod",
  "modules": {
    "academic.bos-syllabi": ["view", "create", "edit", "revise", "duplicate", "export"],
    "academic.bos-taxonomy": ["view", "edit"],
    "academic.bos-experts": ["view", "create", "edit", "delete"],
    "academic.bos-compositions": ["view", "create", "edit"],
    "academic.bos-meetings": ["view", "create", "edit"],
    "academic.bos-ta-da": ["view", "submit"],
    "academic.bos-reports": ["view"]
  }
}
```

### Option 3: API-Driven Assignment
Use permission management endpoint to assign roles:
```bash
POST /api/permissions/assign-role
{
  "role": "hod",
  "modules": [
    { "module": "academic.bos-syllabi", "actions": ["view", "create", "edit", "revise"] },
    { "module": "academic.bos-taxonomy", "actions": ["view", "edit"] }
  ]
}
```

## Verification

Check that permissions are assigned correctly:
```sql
SELECT role_id, module, array_agg(action) as actions
FROM role_permissions
WHERE role_id IN ('hod', 'faculty')
GROUP BY role_id, module
ORDER BY role_id, module;
```

For a specific user:
```sql
SELECT module, array_agg(action) as actions
FROM role_permissions
WHERE role_id = (SELECT role FROM profiles WHERE id = '${user_id}')
GROUP BY module
ORDER BY module;
```

## Migration Notes
- Existing HOD/Faculty users should already have institutional_id in profiles
- Super admins have implicit access to all modules (isSuperAdmin flag overrides permission checks)
- Permission checks happen in `usePermissions()` hook and `PermissionGuard` components
- If a user lacks view permission, UI shows PermissionGuard alert; they cannot access the page

## Testing
1. Log in as HOD → verify can access Syllabi (create/edit), Experts (create), cannot delete
2. Log in as Faculty → verify view-only for most modules, can submit TA/DA claims
3. Log in as Principal → verify view-only for all modules
4. Log in as Super Admin → verify full access across all institutions
