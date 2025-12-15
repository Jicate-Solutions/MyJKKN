# Roles & Permissions - Complete Context

> Multi-role system with 240+ granular permissions

---

## Overview

MyJKKN implements a **multi-role RBAC system** where users can have multiple roles simultaneously. Permissions are merged using Union (OR) logic.

### Key Concepts
- **Custom Roles**: Organization-defined roles with permission sets
- **Multi-role Assignment**: Users can hold multiple roles
- **Primary Role**: One role marked as primary for display
- **Permission Union**: If ANY role grants permission, user has it
- **System Roles**: Protected roles (super_admin, administrator)

---

## Data Model

### Table: custom_roles

Stores role definitions with their permission sets.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `role_key` | TEXT | Yes | - | Unique role identifier (snake_case) |
| `role_name` | TEXT | Yes | - | Display name |
| `description` | TEXT | No | - | Role description |
| `is_system_role` | BOOLEAN | Yes | `false` | Protected system role |
| `permissions` | JSONB | Yes | `{}` | Permission key-value pairs |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Table: user_roles

Links users to their assigned roles.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | Yes | - | FK to profiles.id |
| `role_id` | UUID | Yes | - | FK to custom_roles.id |
| `is_primary` | BOOLEAN | Yes | `false` | Primary role flag |
| `assigned_at` | TIMESTAMPTZ | No | `now()` | Assignment timestamp |
| `assigned_by` | UUID | No | - | Who assigned the role |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |

---

## Permission Key Structure

### Format
```
[module].[submodule?].[action]
```

### Common Actions
| Action | Description |
|--------|-------------|
| `view` | Read access |
| `create` | Create new records |
| `edit` | Update existing records |
| `delete` | Remove records |
| `export` | Export data |
| `import` | Import data |

### Permission Categories

#### Users Module
```json
{
  "users.view": true,
  "users.create": true,
  "users.edit": true,
  "users.delete": true,
  "users.dashboard.view": true
}
```

#### Roles Module
```json
{
  "roles.view": true,
  "roles.create": true,
  "roles.edit": true,
  "roles.delete": true,
  "roles.assign": true
}
```

#### Organizations Module
```json
{
  "organizations.institutions.view": true,
  "organizations.institutions.create": true,
  "organizations.institutions.edit": true,
  "organizations.institutions.delete": true,
  "organizations.degrees.view": true,
  "organizations.degrees.create": true,
  "organizations.departments.view": true,
  "organizations.departments.create": true,
  "organizations.programs.view": true,
  "organizations.semesters.view": true,
  "organizations.sections.view": true,
  "organizations.courses.view": true,
  "organizations.course_mappings.view": true
}
```

#### Students Module
```json
{
  "students.view": true,
  "students.create": true,
  "students.edit": true,
  "students.delete": true,
  "students.bulk": true,
  "students.promotion": true,
  "students.dashboard.view": true
}
```

#### Academic Module
```json
{
  "academic.timetables.view": true,
  "academic.timetables.create": true,
  "academic.timetables.edit": true,
  "academic.attendance.view": true,
  "academic.attendance.create": true,
  "academic.attendance.edit": true,
  "academic.periods.view": true,
  "academic.staff_plans.view": true,
  "academic.years.view": true
}
```

#### Billing Module
```json
{
  "billing.dashboard.view": true,
  "billing.categories.view": true,
  "billing.categories.create": true,
  "billing.invoices.view": true,
  "billing.invoices.create": true,
  "billing.receipts.view": true,
  "billing.receipts.create": true,
  "billing.refunds.view": true,
  "billing.refunds.create": true,
  "billing.discounts.view": true,
  "billing.scholarships.manage": true
}
```

#### Staff Module
```json
{
  "staff.view": true,
  "staff.create": true,
  "staff.edit": true,
  "staff.delete": true,
  "staff.categories.view": true,
  "staff.categories.create": true
}
```

#### Resource Management Module
```json
{
  "physical_resources.dashboard.view": true,
  "physical_resources.view": true,
  "physical_resources.create": true,
  "physical_resources.edit": true,
  "physical_resources.categories.view": true,
  "physical_resources.reservations.view": true,
  "physical_resources.reservations.create": true,
  "physical_resources.policies.view": true,
  "physical_resources.reports.view": true
}
```

#### System Module
```json
{
  "system.api.view": true,
  "system.api.edit": true,
  "system.audit.view": true,
  "system.settings.view": true,
  "system.settings.edit": true
}
```

---

## System Roles

### super_admin
- **Protected**: Cannot be deleted or have permissions modified
- **All Permissions**: Automatically has ALL permissions set to true
- **Institution Access**: Access to all institutions

```json
{
  "role_key": "super_admin",
  "role_name": "Super Administrator",
  "description": "Full system access with all permissions",
  "is_system_role": true,
  "permissions": {
    // All permissions automatically set to true
  }
}
```

### administrator
- **Protected**: Cannot be deleted
- **Permissions Editable**: Can customize permissions
- **Default**: Full module access for assigned institution

---

## Multi-Role Permission Merge

### Union (OR) Logic

When user has multiple roles, permissions are merged using OR:

```typescript
// Example: User has two roles

// Role A (Faculty)
const roleAPermissions = {
  "academic.timetables.view": true,
  "academic.attendance.view": true,
  "academic.attendance.create": true,
  "students.view": false
};

// Role B (HOD)
const roleBPermissions = {
  "academic.timetables.view": true,
  "academic.timetables.edit": true,
  "students.view": true,
  "staff.view": true
};

// Merged Permissions (User gets):
const mergedPermissions = {
  "academic.timetables.view": true,   // Both have it
  "academic.timetables.edit": true,   // Role B grants it
  "academic.attendance.view": true,   // Role A grants it
  "academic.attendance.create": true, // Role A grants it
  "students.view": true,              // Role B grants it (overrides A's false)
  "staff.view": true                  // Role B grants it
};
```

### Permission Check Function

```typescript
// Check if user has permission
async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const mergedPermissions = await UserRolesService.getMergedPermissions(userId);
  return mergedPermissions[permission] === true;
}

// Check if user has any of permissions
async function hasAnyPermission(userId: string, permissions: string[]): Promise<boolean> {
  const mergedPermissions = await UserRolesService.getMergedPermissions(userId);
  return permissions.some(p => mergedPermissions[p] === true);
}

// Check if user has all permissions
async function hasAllPermissions(userId: string, permissions: string[]): Promise<boolean> {
  const mergedPermissions = await UserRolesService.getMergedPermissions(userId);
  return permissions.every(p => mergedPermissions[p] === true);
}
```

---

## TypeScript Types

```typescript
export interface CustomRole {
  id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface CustomRoleCreate {
  role_key: string;
  role_name: string;
  description?: string | null;
  permissions?: Record<string, boolean>;
  is_system_role?: boolean;
}

export interface CustomRoleUpdate {
  role_name?: string;
  description?: string | null;
  permissions?: Record<string, boolean>;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  is_primary: boolean;
  assigned_at: string;
  assigned_by: string | null;

  // Joined from custom_roles
  role_key?: string;
  role_name?: string;
  role_description?: string;
  permissions?: Record<string, boolean>;
}

export interface UserRoleAssignmentInsert {
  user_id: string;
  role_id: string;
  is_primary?: boolean;
  assigned_by?: string | null;
}

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMINISTRATOR: 'administrator'
} as const;
```

---

## API Reference

### Role Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/roles` | List all roles |
| GET | `/api/roles/:key` | Get role by key |
| POST | `/api/roles` | Create new role |
| PUT | `/api/roles/:key` | Update role |
| DELETE | `/api/roles/:key` | Delete role |

### User Role Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id/roles` | Get user's roles |
| POST | `/api/users/:id/roles` | Assign roles to user |
| PUT | `/api/users/:id/roles/primary` | Set primary role |
| DELETE | `/api/users/:id/roles/:roleId` | Remove role from user |

### Request/Response Examples

#### Create Role
```json
// POST /api/roles
{
  "role_key": "billing_manager",
  "role_name": "Billing Manager",
  "description": "Manages billing operations",
  "permissions": {
    "billing.dashboard.view": true,
    "billing.invoices.view": true,
    "billing.invoices.create": true,
    "billing.receipts.view": true,
    "billing.receipts.create": true,
    "billing.refunds.view": true
  }
}
```

#### Assign Roles to User
```json
// POST /api/users/:id/roles
{
  "role_ids": ["role-uuid-1", "role-uuid-2"],
  "primary_role_id": "role-uuid-1"
}
```

#### Role Response
```json
{
  "id": "role-uuid",
  "role_key": "faculty",
  "role_name": "Faculty",
  "description": "Teaching staff with course and attendance access",
  "is_system_role": false,
  "permissions": {
    "academic.timetables.view": true,
    "academic.attendance.view": true,
    "academic.attendance.create": true,
    "academic.attendance.edit": true,
    "students.view": true
  },
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-06-20T15:30:00Z"
}
```

---

## Business Rules

### Role Management
1. **Unique role_key**: Must be unique across all roles
2. **System roles protected**: Cannot delete super_admin or administrator
3. **Super admin permissions**: Always has all permissions (auto-enforced)
4. **No orphan assignments**: Deleting role removes all user assignments

### Role Assignment
1. **At least one role**: Users must have at least one role
2. **One primary role**: Exactly one role must be marked primary
3. **Primary auto-set**: If last role, automatically becomes primary
4. **Assignment audit**: Tracks who assigned roles and when

### Permission Validation
1. **Boolean values only**: Permissions must be true/false
2. **Unknown keys allowed**: System accepts any permission key
3. **Missing = false**: Absent permission key means no access

---

## Database Functions

### get_user_roles_with_details(p_user_id UUID)
Returns all roles for a user with full role details.

### get_user_merged_permissions(p_user_id UUID)
Returns merged permissions using Union logic.

---

## Sample Data

### Custom Role
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "role_key": "hod",
  "role_name": "Head of Department",
  "description": "Department head with staff and academic management access",
  "is_system_role": false,
  "permissions": {
    "students.view": true,
    "students.edit": true,
    "staff.view": true,
    "staff.edit": true,
    "academic.timetables.view": true,
    "academic.timetables.create": true,
    "academic.timetables.edit": true,
    "academic.attendance.view": true,
    "academic.staff_plans.view": true,
    "academic.staff_plans.create": true
  },
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-06-15T14:30:00Z"
}
```

### User Role Assignment
```json
{
  "id": "assignment-uuid",
  "user_id": "user-uuid",
  "role_id": "role-uuid",
  "is_primary": true,
  "assigned_at": "2024-06-15T10:00:00Z",
  "assigned_by": "admin-uuid",
  "role_key": "hod",
  "role_name": "Head of Department",
  "permissions": { ... }
}
```

---

## Service Locations

- **Role Service**: `lib/services/roles/role-service.ts`
- **User Roles Service**: `lib/services/users/user-roles-service.ts`
- **Hook**: `hooks/use-permissions.ts`
- **Constants**: `lib/constants/permissions.ts`
- **Types**: `types/auth.ts`

---

*Last Updated: December 2024*
