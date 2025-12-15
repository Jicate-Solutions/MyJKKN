# Institution Entity - Complete Context

> Educational institution management for JKKN group

---

## Overview

The `institutions` table is the **root entity** of the entire MyJKKN system. Every other entity references an institution through `institution_id`.

### Purpose
- Store educational institution information
- Define institution type and category
- Store contact details and department contacts
- Enable multi-tenant data isolation

### Table Name
`public.institutions`

---

## Data Model

### Primary Entity: institutions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `uuid_generate_v4()` | Primary key |
| `name` | VARCHAR(255) | Yes | - | Institution name |
| `counselling_code` | VARCHAR(50) | No | - | Counselling code (unique identifier) |
| `institution_type` | VARCHAR(20) | No | - | Type: self/autonomous/aided |
| `category` | VARCHAR(20) | No | - | Category: ug/pg/ug_pg |
| `accredited_by` | VARCHAR(255) | No | - | Accreditation body |
| `address_line1` | VARCHAR(255) | No | - | Address line 1 |
| `address_line2` | VARCHAR(255) | No | - | Address line 2 |
| `address_line3` | VARCHAR(255) | No | - | Address line 3 |
| `city` | VARCHAR(100) | No | - | City |
| `state` | VARCHAR(100) | No | - | State |
| `country` | VARCHAR(100) | No | - | Country |
| `pin_code` | VARCHAR(20) | No | - | PIN/ZIP code |
| `email` | VARCHAR(255) | No | - | Primary email |
| `phone` | VARCHAR(20) | No | - | Primary phone |
| `website` | VARCHAR(255) | No | - | Website URL |
| `logo_url` | TEXT | No | - | Logo image URL |
| `transportation_dept` | JSONB | No | - | Transportation department contact |
| `administration_dept` | JSONB | No | - | Administration department contact |
| `accounts_dept` | JSONB | No | - | Accounts department contact |
| `admission_dept` | JSONB | No | - | Admission department contact |
| `placement_dept` | JSONB | No | - | Placement department contact |
| `anti_ragging_dept` | JSONB | No | - | Anti-ragging cell contact |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### JSONB Field Structure: Department Contacts

Each department contact field (`transportation_dept`, `administration_dept`, etc.) follows this structure:

```json
{
  "contact_name": "Dr. John Smith",
  "designation": "Head of Department",
  "email": "john.smith@jkkn.edu.in",
  "mobile": "+91 9876543210"
}
```

### Enum Values

**Institution Type (`institution_type`):**
| Value | Description |
|-------|-------------|
| `self` | Self-financing institution |
| `autonomous` | Autonomous institution |
| `aided` | Government-aided institution |

**Institution Category (`category`):**
| Value | Description |
|-------|-------------|
| `ug` | Undergraduate only |
| `pg` | Postgraduate only |
| `ug_pg` | Both UG and PG programs |

---

## Relationships

### Referenced By (Child Tables)
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `degrees` | `institution_id` | One-to-Many |
| `departments` | `institution_id` | One-to-Many |
| `programs` | `institution_id` | One-to-Many |
| `semesters` | `institution_id` | One-to-Many |
| `sections` | `institution_id` | One-to-Many |
| `courses` | `institution_id` | One-to-Many |
| `students` | `institution_id` | One-to-Many |
| `staff` | `institution_id` | One-to-Many |
| `profiles` | `institution_id` | One-to-Many |
| `user_institution_access` | `institution_id` | One-to-Many |
| `timetables` | `institution_id` | One-to-Many |
| `academic_years` | `institution_id` | One-to-Many |
| ... and 40+ more tables | ... | ... |

---

## Business Rules

### Validation Rules
1. **Name**: Required, 1-255 characters
2. **Counselling Code**: Should be unique across all institutions
3. **Email**: Must be valid email format if provided
4. **Phone**: Should be valid phone format if provided
5. **Website**: Should be valid URL format if provided

### Status Rules
1. **Deactivation**: Setting `is_active = false` restricts new operations but preserves existing data
2. **No Delete**: Institutions with related data (students, staff, etc.) cannot be deleted
3. **Cascade Effect**: Institution status affects visibility in filters across all modules

### Access Rules
1. **Super Admin**: Can view and manage all institutions
2. **Admin**: Can only view institutions they have access to via `user_institution_access`
3. **Other Roles**: Institution access determined by their profile's `institution_id`

---

## Permissions Required

| Operation | Permission Key | Description |
|-----------|----------------|-------------|
| View List | `organizations.institutions.view` | View institution list |
| View Detail | `organizations.institutions.view` | View single institution |
| Create | `organizations.institutions.create` | Create new institution |
| Edit | `organizations.institutions.edit` | Update institution |
| Delete | `organizations.institutions.delete` | Delete institution |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organizations/institutions` | List all institutions |
| GET | `/api/api-management/organizations/institutions/:id` | Get institution by ID |
| POST | `/api/organizations/institutions` | Create institution |
| PUT | `/api/organizations/institutions/:id` | Update institution |
| DELETE | `/api/organizations/institutions/:id` | Delete institution |

### Query Parameters (GET List)

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name or counselling_code |
| `isActive` | boolean | Filter by active status |
| `page` | number | Page number (1-based) |
| `limit` | number | Items per page (default: 10) |

### Request Example (Create)

```json
{
  "name": "JKKN College of Engineering",
  "counselling_code": "2713",
  "institution_type": "self",
  "category": "ug_pg",
  "accredited_by": "NAAC",
  "address_line1": "JKKN Educational Institutions",
  "address_line2": "NH-544 (Salem to Kochi Highway)",
  "city": "Komarapalayam",
  "state": "Tamil Nadu",
  "country": "India",
  "pin_code": "638183",
  "email": "info@jkkn.ac.in",
  "phone": "+91 4288 234567",
  "website": "https://jkkn.ac.in",
  "transportation_dept": {
    "contact_name": "Mr. Transport Head",
    "designation": "Transport Coordinator",
    "email": "transport@jkkn.ac.in",
    "mobile": "+91 9876543210"
  }
}
```

### Response Example

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "JKKN College of Engineering",
    "counselling_code": "2713",
    "institution_type": "self",
    "category": "ug_pg",
    "accredited_by": "NAAC",
    "address_line1": "JKKN Educational Institutions",
    "address_line2": "NH-544 (Salem to Kochi Highway)",
    "address_line3": null,
    "city": "Komarapalayam",
    "state": "Tamil Nadu",
    "country": "India",
    "pin_code": "638183",
    "email": "info@jkkn.ac.in",
    "phone": "+91 4288 234567",
    "website": "https://jkkn.ac.in",
    "logo_url": null,
    "transportation_dept": {
      "contact_name": "Mr. Transport Head",
      "designation": "Transport Coordinator",
      "email": "transport@jkkn.ac.in",
      "mobile": "+91 9876543210"
    },
    "administration_dept": null,
    "accounts_dept": null,
    "admission_dept": null,
    "placement_dept": null,
    "anti_ragging_dept": null,
    "is_active": true,
    "created_by": "user-uuid",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

### List Response Example

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "JKKN College of Engineering",
      "counselling_code": "2713",
      "category": "ug_pg",
      "is_active": true
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "JKKN Dental College",
      "counselling_code": "2714",
      "category": "ug_pg",
      "is_active": true
    }
  ],
  "metadata": {
    "total": 9,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

## Sample Data

### JKKN Institutions

```json
[
  {
    "name": "JKKN College of Engineering",
    "counselling_code": "2713",
    "institution_type": "self",
    "category": "ug_pg"
  },
  {
    "name": "JKKN Dental College",
    "counselling_code": "2714",
    "institution_type": "self",
    "category": "ug_pg"
  },
  {
    "name": "JKKN College of Pharmacy",
    "counselling_code": "2715",
    "institution_type": "self",
    "category": "ug_pg"
  },
  {
    "name": "JKKN College of Arts and Science",
    "counselling_code": "2716",
    "institution_type": "self",
    "category": "ug_pg"
  },
  {
    "name": "JKKN College of Nursing",
    "counselling_code": "2717",
    "institution_type": "self",
    "category": "ug_pg"
  },
  {
    "name": "JKKN College of Education",
    "counselling_code": "2718",
    "institution_type": "self",
    "category": "ug_pg"
  },
  {
    "name": "JKKN Allied Health Sciences",
    "counselling_code": "2719",
    "institution_type": "self",
    "category": "ug_pg"
  },
  {
    "name": "JKKN Matriculation School",
    "counselling_code": "2720",
    "institution_type": "self",
    "category": "ug"
  },
  {
    "name": "JKKN Naturopathy & Yoga College",
    "counselling_code": "2721",
    "institution_type": "self",
    "category": "ug_pg"
  }
]
```

---

## TypeScript Types

```typescript
// types/organizations.ts

export type InstitutionType = 'self' | 'autonomous' | 'aided';
export type InstitutionCategory = 'ug' | 'pg' | 'ug_pg';

export interface DepartmentContact {
  contact_name?: string;
  designation?: string;
  email?: string;
  mobile?: string;
}

export interface Institution {
  id: string;
  name: string;
  counselling_code: string;
  institution_type: InstitutionType;
  category: InstitutionCategory;
  accredited_by: string;
  address_line1: string;
  address_line2?: string;
  address_line3?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  email: string;
  phone: string;
  website?: string;
  logo_url?: string;
  transportation_dept?: DepartmentContact;
  administration_dept?: DepartmentContact;
  accounts_dept?: DepartmentContact;
  admission_dept?: DepartmentContact;
  placement_dept?: DepartmentContact;
  anti_ragging_dept?: DepartmentContact;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInstitutionDto
  extends Omit<Institution, 'id' | 'created_at' | 'updated_at'> {}

export interface UpdateInstitutionDto
  extends Partial<CreateInstitutionDto> {}

export interface InstitutionFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Integration Points

### For Child Applications

1. **Institution Selection**
   - First step in any hierarchical filter
   - Required for multi-tenant data access

2. **User Assignment**
   - Users are assigned to institutions via `user_institution_access`
   - Or directly via `profiles.institution_id`

3. **Data Filtering**
   - All queries should include `institution_id` filter
   - RLS policies enforce institution-level data isolation

### Code Example

```typescript
// Fetch institutions user has access to
const { data: institutions } = await supabase
  .from('institutions')
  .select('id, name, counselling_code')
  .eq('is_active', true)
  .in('id', userInstitutionIds);

// Use institution in subsequent queries
const { data: students } = await supabase
  .from('students')
  .select('*')
  .eq('institution_id', selectedInstitutionId);
```

---

## Service Location

- **Service File**: `lib/services/organization/institution-service.ts`
- **Hook File**: `hooks/organization/use-institutions.ts`
- **Types File**: `types/organizations.ts`

---

*Last Updated: December 2024*
