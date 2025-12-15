# Profile Entity - Complete Field Reference

> User profile management with 20+ fields

---

## Overview

The `profiles` table stores user profile data linked to Supabase Auth users. Every authenticated user has a profile record.

### Table Name
`public.profiles`

### Relationship with Auth
- Profile `id` matches `auth.users.id`
- Created automatically via database trigger on user signup
- Profile contains application-specific user data

---

## Data Model

### Section 1: Identity

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | - | Primary key (matches auth.users.id) |
| `email` | TEXT | Yes | - | User's email address |
| `full_name` | TEXT | No | - | User's display name |
| `phone_number` | TEXT | No | - | Contact phone number |
| `avatar_url` | TEXT | No | - | Profile picture URL |

### Section 2: Personal Information

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `gender` | gender | No | - | Male/Female/Other/Prefer not to say |
| `bio` | TEXT | No | - | User biography/description |
| `designation` | TEXT | No | - | Job title/designation |

### Section 3: Role & Access

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `role` | user_role | Yes | `'student'` | Legacy primary role field |
| `is_super_admin` | BOOLEAN | No | `false` | Super admin flag |
| `is_active` | BOOLEAN | Yes | `true` | Account active status |
| `profile_completed` | BOOLEAN | Yes | `false` | Profile completion flag |

### Section 4: Organization Assignment

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `institution_id` | UUID | No | - | Primary institution FK |
| `department_id` | UUID | No | - | Department FK |

### Section 5: Metadata

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `created_at` | TIMESTAMPTZ | No | `now()` | Record creation time |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update time |
| `last_login` | TIMESTAMPTZ | No | - | Last login timestamp |

---

## Enum Values

### user_role (Legacy)

| Value | Description |
|-------|-------------|
| `super_admin` | Full system access |
| `administrator` | Institution administrator |
| `principal` | College principal |
| `hod` | Head of Department |
| `faculty` | Teaching faculty |
| `staff` | Non-teaching staff |
| `student` | Student user |

### gender

| Value | Description |
|-------|-------------|
| `male` | Male |
| `female` | Female |
| `other` | Other |
| `prefer_not_to_say` | Prefer not to disclose |

---

## Extended Profile (with Relations)

When fetched with joins, profile includes:

```json
{
  "id": "user-uuid",
  "email": "user@jkkn.ac.in",
  "full_name": "John Doe",
  "phone_number": "+91 9876543210",
  "avatar_url": "https://storage.example.com/avatars/john.jpg",
  "gender": "male",
  "bio": "Professor of Computer Science",
  "designation": "Associate Professor",
  "role": "faculty",
  "is_super_admin": false,
  "is_active": true,
  "profile_completed": true,
  "institution_id": "inst-uuid",
  "department_id": "dept-uuid",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-06-20T15:30:00Z",
  "last_login": "2024-06-20T08:00:00Z",

  "institution": {
    "id": "inst-uuid",
    "name": "JKKN College of Engineering",
    "category": "engineering",
    "institution_type": "college",
    "city": "Erode",
    "state": "Tamil Nadu"
  },

  "user_roles": [
    {
      "id": "assignment-uuid",
      "role_id": "role-uuid",
      "is_primary": true,
      "role_key": "faculty",
      "role_name": "Faculty",
      "permissions": { "academic.timetables.view": true, ... }
    },
    {
      "id": "assignment-uuid-2",
      "role_id": "role-uuid-2",
      "is_primary": false,
      "role_key": "hod",
      "role_name": "Head of Department",
      "permissions": { "staff.view": true, ... }
    }
  ],

  "primary_role": {
    "role_key": "faculty",
    "role_name": "Faculty"
  },

  "merged_permissions": {
    "academic.timetables.view": true,
    "academic.attendance.view": true,
    "staff.view": true,
    ...
  }
}
```

---

## Student Profile Enhancement

When `profile.role === 'student'`, additional fields are populated:

| Field | Type | Description |
|-------|------|-------------|
| `student_id` | UUID | Linked student record ID |
| `student_status` | student_status | Student enrollment status |
| `student_profile_complete` | BOOLEAN | Student profile completion |

### Student Status Values

| Value | Impact on Profile |
|-------|-------------------|
| `pending` | Limited access, must complete profile |
| `active` | Full student access |
| `inactive` | Temporarily disabled access |
| `exited` | Auto logout, no access |
| `graduated` | Limited alumni access |

---

## TypeScript Interface

```typescript
export type UserRole =
  | 'super_admin'
  | 'administrator'
  | 'principal'
  | 'hod'
  | 'faculty'
  | 'staff'
  | 'student';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  gender: Gender | null;
  bio: string | null;
  designation: string | null;

  // Legacy role field (for backward compatibility)
  role: UserRole;

  // Access control
  is_super_admin?: boolean;
  is_active: boolean;
  profile_completed: boolean;

  // Organization
  institution_id: string | null;
  department_id: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  last_login?: string;

  // Joined data
  institution?: {
    id: string;
    name: string;
    category: string;
    institution_type: string;
    website?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
  };

  // Multi-role support
  user_roles?: UserRoleAssignment[];
  primary_role?: UserRoleAssignment;
  merged_permissions?: Record<string, boolean>;

  // Student-specific (populated if role === 'student')
  student_id?: string | null;
  student_status?: 'active' | 'inactive' | 'pending' | 'exited' | 'graduated';
  student_profile_complete?: boolean;
}
```

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `auth.users` | `id` | One-to-One |
| `institutions` | `institution_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |

### Referenced By

| Table | Foreign Key | Description |
|-------|-------------|-------------|
| `user_roles` | `user_id` | Role assignments |
| `user_institution_access` | `user_id` | Institution access |
| `students` | `college_email` (indirect) | Student record |
| `staff` | `profile_id` | Staff record |
| `audit_logs` | `user_id` | Audit trail |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List profiles |
| GET | `/api/users/:id` | Get profile by ID |
| PUT | `/api/users/:id` | Update profile |
| PATCH | `/api/users/:id/toggle-status` | Toggle is_active |

### Query Parameters (GET /api/users)

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name, email |
| `role` | string | Filter by legacy role |
| `institution` | UUID | Filter by institution |
| `isActive` | boolean | Filter by active status |
| `page` | number | Page number |
| `limit` | number | Items per page |

### Create/Update Request

```typescript
interface CreateUserRequest {
  email: string;
  full_name?: string;
  phone_number?: string;
  institution_id?: string | null;
  department_id?: string | null;

  // Legacy single role
  role?: string;

  // Multi-role support
  role_ids?: string[];       // Array of custom_role IDs
  primary_role_id?: string;  // Which role is primary
}

interface UpdateUserRequest {
  full_name?: string;
  phone_number?: string;
  designation?: string | null;
  bio?: string | null;
  gender?: Gender | null;
  is_active?: boolean;
  profile_complete?: boolean;
  institution_id?: string | null;
  department_id?: string | null;
  role_ids?: string[];
  primary_role_id?: string;
}
```

---

## Business Rules

### Profile Creation
1. **Auto-created**: Profile created via DB trigger on auth.users insert
2. **Default role**: New profiles get role `'student'` by default
3. **Institution required**: Some operations require institution_id

### Status Rules
1. **Deactivation**: Sets is_active to false, user cannot login
2. **Profile completion**: Required for certain module access
3. **Student sync**: Student profiles update when student record changes

### Validation Rules
1. **Email unique**: Must be unique across all profiles
2. **Institution exists**: institution_id must reference valid institution
3. **Department scope**: department_id must belong to the institution

---

## Sample Data

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "principal@jkknengg.ac.in",
  "full_name": "Dr. Rajesh Kumar",
  "phone_number": "+91 9876543210",
  "avatar_url": null,
  "gender": "male",
  "bio": "Principal with 25 years of experience in education administration",
  "designation": "Principal",
  "role": "principal",
  "is_super_admin": false,
  "is_active": true,
  "profile_completed": true,
  "institution_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "department_id": null,
  "created_at": "2023-01-15T10:00:00Z",
  "updated_at": "2024-06-15T14:30:00Z",
  "last_login": "2024-06-20T09:15:00Z"
}
```

---

## Service Location

- **Service**: `lib/services/users/user-service.ts`
- **Hook**: `hooks/use-profile.ts`
- **Types**: `types/auth.ts`

---

*Last Updated: December 2024*
