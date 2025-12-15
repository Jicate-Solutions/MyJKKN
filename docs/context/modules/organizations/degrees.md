# Degree Entity - Complete Context

> Undergraduate/Postgraduate degree classification

---

## Overview

The `degrees` table classifies educational programs as Undergraduate (UG) or Postgraduate (PG) within an institution.

### Purpose
- Define degree levels (UG/PG)
- Group departments under degrees
- Support degree-based filtering and reporting

### Table Name
`public.degrees`

---

## Data Model

### Primary Entity: degrees

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `uuid_generate_v4()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `degree_id` | VARCHAR(20) | Yes | - | Degree code (e.g., "B.Tech", "M.Sc") |
| `degree_name` | VARCHAR(100) | Yes | - | Full degree name |
| `degree_type` | VARCHAR(10) | Yes | - | Type: ug/pg |
| `display_name` | VARCHAR(100) | No | - | Alternative display name |
| `degree_order` | INTEGER | Yes | `0` | Sort order for display |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Enum Values

**Degree Type (`degree_type`):**
| Value | Description |
|-------|-------------|
| `ug` | Undergraduate |
| `pg` | Postgraduate |

---

## Relationships

### Parent Table
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |

### Child Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `departments` | `degree_id` | One-to-Many |
| `programs` | `degree_id` | One-to-Many |
| `semesters` | `degree_id` | One-to-Many |
| `sections` | `degree_id` | One-to-Many |
| `students` | `degree_id` | One-to-Many |

---

## Business Rules

1. **Unique Code**: `degree_id` must be unique within an institution
2. **Required Parent**: `institution_id` must reference a valid institution
3. **Order Display**: Degrees sorted by `degree_order` then `degree_name`
4. **Cascade Check**: Cannot delete if departments exist under it

---

## Permissions Required

| Operation | Permission Key |
|-----------|----------------|
| View | `organizations.degrees.view` |
| Create | `organizations.degrees.create` |
| Edit | `organizations.degrees.edit` |
| Delete | `organizations.degrees.delete` |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organizations/degrees` | List degrees |
| GET | `/api/api-management/organizations/degrees/:id` | Get degree |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `institution_id` | UUID | Filter by institution |
| `degree_type` | string | Filter by ug/pg |
| `isActive` | boolean | Filter by status |
| `page` | number | Page number |
| `limit` | number | Items per page |

### Response Example

```json
{
  "data": [
    {
      "id": "degree-uuid-1",
      "institution_id": "inst-uuid",
      "degree_id": "UG",
      "degree_name": "Undergraduate",
      "degree_type": "ug",
      "display_name": "UG Programs",
      "degree_order": 1,
      "is_active": true,
      "institution": {
        "id": "inst-uuid",
        "name": "JKKN College of Engineering",
        "counselling_code": "2713"
      }
    },
    {
      "id": "degree-uuid-2",
      "institution_id": "inst-uuid",
      "degree_id": "PG",
      "degree_name": "Postgraduate",
      "degree_type": "pg",
      "display_name": "PG Programs",
      "degree_order": 2,
      "is_active": true,
      "institution": {
        "id": "inst-uuid",
        "name": "JKKN College of Engineering",
        "counselling_code": "2713"
      }
    }
  ],
  "metadata": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

## TypeScript Types

```typescript
export type DegreeType = 'ug' | 'pg';

export interface Degree {
  id: string;
  institution_id: string;
  degree_id: string;
  degree_name: string;
  degree_type: DegreeType;
  display_name?: string;
  degree_order: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

export interface CreateDegreeDto {
  institution_id: string;
  degree_id: string;
  degree_name: string;
  degree_type: DegreeType;
  display_name?: string;
  degree_order?: number;
  is_active?: boolean;
}

export interface DegreeFilters {
  search?: string;
  institution_id?: string;
  degree_type?: DegreeType;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Sample Data

```json
[
  {
    "degree_id": "UG",
    "degree_name": "Undergraduate",
    "degree_type": "ug",
    "degree_order": 1
  },
  {
    "degree_id": "PG",
    "degree_name": "Postgraduate",
    "degree_type": "pg",
    "degree_order": 2
  },
  {
    "degree_id": "DIPLOMA",
    "degree_name": "Diploma",
    "degree_type": "ug",
    "degree_order": 3
  }
]
```

---

## Service Location

- **Service**: `lib/services/organization/degree-service.ts`
- **Hook**: `hooks/organization/use-degrees.ts`
- **Types**: `types/organizations.ts`

---

*Last Updated: December 2024*
