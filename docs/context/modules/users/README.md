# Users Module - Complete Context

> User management, authentication, roles, and multi-tenant access control

---

## Overview

The Users module manages **authentication, profiles, role-based access control (RBAC), and multi-institution access** for all MyJKKN users.

### Purpose
- User authentication via Supabase Auth
- Profile management with 20+ fields
- Multi-role assignment system (Union/OR permissions)
- Institution-level access control for multi-tenancy
- Custom role creation with 240+ granular permissions

### User Types
| Role | Description | Access Level |
|------|-------------|--------------|
| `super_admin` | Full system access | All modules, all institutions |
| `administrator` | Institution admin | Full CRUD on assigned institutions |
| `principal` | College principal | View all, limited management |
| `hod` | Head of Department | Department-level access |
| `faculty` | Teaching staff | Assigned sections/courses |
| `staff` | Non-teaching staff | Limited module access |
| `student` | Enrolled student | Own data, student portal |

### Key Capabilities
- **Multi-role support**: Users can have multiple roles with merged permissions
- **Permission Union (OR)**: If ANY role grants permission, user has it
- **Multi-institution access**: Users can access multiple institutions
- **Custom roles**: Create organization-specific roles
- **Profile sync**: Student profiles sync with student records

---

## Module Features

| Feature | Route | Description |
|---------|-------|-------------|
| User List | `/users` | View all users with filters |
| User Detail | `/users/[id]` | Individual user profile |
| Role Management | `/users/roles` | Custom role CRUD |
| Dashboard | `/users/dashboard` | User analytics |

---

## Entity Summary

| Entity | Table | Fields | Description |
|--------|-------|--------|-------------|
| [Profile](./profiles.md) | `profiles` | 20+ | User profile data |
| [Custom Role](./roles-permissions.md) | `custom_roles` | 7 | Role definitions |
| [User Role](./roles-permissions.md) | `user_roles` | 7 | User-role assignments |
| [Institution Access](./institution-access.md) | `user_institution_access` | 8 | Multi-tenant access |

---

## Quick Reference

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users with filters |
| GET | `/api/users/:id` | Get user by ID |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| PATCH | `/api/users/:id/role` | Update single role (legacy) |
| PATCH | `/api/users/bulk-role-update` | Bulk role update |
| PATCH | `/api/users/:id/toggle-status` | Toggle active status |
| POST | `/api/users/:id/deactivate` | Deactivate user |

### Permission Keys

| Operation | Permission Key |
|-----------|----------------|
| View Users | `users.view` |
| Create User | `users.create` |
| Edit User | `users.edit` |
| Delete User | `users.delete` |
| View Roles | `roles.view` |
| Create Role | `roles.create` |
| Edit Role | `roles.edit` |
| Delete Role | `roles.delete` |
| Assign Roles | `roles.assign` |
| View Dashboard | `users.dashboard.view` |

---

## Authentication Flow

```
┌────────────────────────────────────────────────────────────────┐
│                     USER AUTHENTICATION                         │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Supabase Auth Login                                         │
│     - Email/Password authentication                             │
│     - Returns auth.users record + JWT token                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Profile Fetch (profiles table)                              │
│     - Linked via auth.users.id = profiles.id                    │
│     - Contains role, institution_id, personal info              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Multi-Role Fetch (user_roles + custom_roles)                │
│     - All assigned roles for user                               │
│     - Primary role identification                               │
│     - Permission objects from each role                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Permission Merge (Union/OR Logic)                           │
│     - Combine all role permissions                              │
│     - If ANY role grants permission → user has it               │
│     - Returns merged_permissions object                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Institution Access Check                                    │
│     - Check user_institution_access table                       │
│     - Determine accessible institutions                         │
│     - Apply access_type (full/read_only/billing_only)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Student Check (if role === 'student')                       │
│     - Find matching student record by college_email             │
│     - Sync student_status and profile_complete                  │
│     - Block access if student status is 'exited'                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Permission System Overview

### Permission Key Format
```
[module].[submodule].[action]

Examples:
- students.view           → View students list
- students.edit           → Edit student records
- academic.timetables.edit → Edit timetables
- billing.invoices.create  → Create invoices
```

### Permission Merge Logic

When a user has multiple roles:

```typescript
// Role A permissions: { students.view: true, students.edit: false }
// Role B permissions: { students.view: true, students.edit: true }

// Merged permissions (Union/OR):
// { students.view: true, students.edit: true }
// → If ANY role grants it, user has it
```

### System Roles (Protected)

| Role Key | Can Delete | Can Edit Permissions |
|----------|------------|---------------------|
| `super_admin` | No | No (always all permissions) |
| `administrator` | No | Yes |
| Other roles | Yes | Yes |

---

## Dashboard Analytics

### Available Metrics

| Metric | Description |
|--------|-------------|
| Total Users | All registered users |
| Active Users | Users with is_active = true |
| New Users (Monthly) | Registrations this month |
| Growth Rate | Month-over-month change |
| Profile Completion | % of complete profiles |
| Role Distribution | Users per role |
| Institution Distribution | Users per institution |
| Login Activity | DAU, WAU, MAU metrics |
| Geographic Distribution | Users by state/district |

---

## Files in This Module

| File | Description |
|------|-------------|
| [profiles.md](./profiles.md) | Profile entity documentation |
| [roles-permissions.md](./roles-permissions.md) | Roles and permissions system |
| [institution-access.md](./institution-access.md) | Multi-tenant access control |

---

## Related Documentation

- **[Organizations Module](../organizations/README.md)** - Institution hierarchy
- **[Students Module](../students/README.md)** - Student-profile relationship
- **[Academic Module](../academic/README.md)** - Faculty/staff assignments

---

## Service Locations

| Service | Path |
|---------|------|
| User Service | `lib/services/users/user-service.ts` |
| User Roles Service | `lib/services/users/user-roles-service.ts` |
| Institution Access Service | `lib/services/users/user-institution-access-service.ts` |
| Role Service | `lib/services/roles/role-service.ts` |
| Dashboard Service | `lib/services/users/user-dashboard-service.ts` |

---

*Last Updated: December 2024*
