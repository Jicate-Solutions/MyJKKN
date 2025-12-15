# Employment Categories - Complete Context

> Staff type classification for employment management

---

## Overview

Employment categories classify staff members by their role type (Teaching Faculty, Administrative, Technical, etc.).

### Table Name
`public.employment_categories`

---

## Data Model

### Primary Entity: employment_categories

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `category_name` | TEXT | Yes | - | Category display name |
| `description` | TEXT | No | - | Category description |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `updated_by` | UUID | No | - | Last modifier |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## TypeScript Types

```typescript
export interface EmploymentCategory {
  id: string;
  category_name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface CreateEmploymentCategoryDto {
  category_name: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateEmploymentCategoryDto
  extends Partial<CreateEmploymentCategoryDto> {}

export interface CategoryFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CategoryListResponse {
  data: EmploymentCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

---

## Common Categories

| Category Name | Description | Examples |
|---------------|-------------|----------|
| Teaching Faculty | Academic teaching staff | Professors, Lecturers, Lab Instructors |
| Administrative Staff | Office and admin roles | Clerks, Coordinators, HR |
| Technical Staff | Technical support roles | Lab Technicians, IT Support |
| Support Staff | General support | Librarians, Drivers, Security |
| Research Staff | Research positions | Research Associates, Fellows |
| Management | Leadership roles | Deans, HODs, Directors |

---

## Sample Data

```json
[
  {
    "id": "cat-1",
    "category_name": "Teaching Faculty",
    "description": "Academic teaching and research staff including Professors, Associate Professors, and Assistant Professors",
    "is_active": true
  },
  {
    "id": "cat-2",
    "category_name": "Administrative Staff",
    "description": "Office administration, accounts, and HR personnel",
    "is_active": true
  },
  {
    "id": "cat-3",
    "category_name": "Technical Staff",
    "description": "Lab technicians, IT support, and technical assistants",
    "is_active": true
  },
  {
    "id": "cat-4",
    "category_name": "Support Staff",
    "description": "Library staff, security, drivers, and maintenance",
    "is_active": true
  },
  {
    "id": "cat-5",
    "category_name": "Research Staff",
    "description": "Research associates and project staff",
    "is_active": true
  }
]
```

---

## Relationships

### Referenced By

| Table | Foreign Key | Description |
|-------|-------------|-------------|
| `staff` | `category_id` | Staff member's employment type |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/staff/categories` | List categories |
| GET | `/api/api-management/staff/categories/:id` | Get category by ID |
| POST | `/api/staff/categories` | Create category |
| PUT | `/api/staff/categories/:id` | Update category |
| DELETE | `/api/staff/categories/:id` | Delete category |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name |
| `isActive` | boolean | Filter by active status |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Dashboard Statistics

### Category Stats Interface

```typescript
interface StaffCategoryStats {
  id: string;
  name: string;
  staffCount: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
  averageTenure: number;  // Average years of service
}
```

### Example Category Distribution

```json
[
  {
    "id": "cat-1",
    "name": "Teaching Faculty",
    "staffCount": 150,
    "percentage": 60,
    "activeCount": 145,
    "inactiveCount": 5,
    "averageTenure": 8.5
  },
  {
    "id": "cat-2",
    "name": "Administrative Staff",
    "staffCount": 50,
    "percentage": 20,
    "activeCount": 48,
    "inactiveCount": 2,
    "averageTenure": 6.2
  },
  {
    "id": "cat-3",
    "name": "Technical Staff",
    "staffCount": 30,
    "percentage": 12,
    "activeCount": 30,
    "inactiveCount": 0,
    "averageTenure": 4.8
  },
  {
    "id": "cat-4",
    "name": "Support Staff",
    "staffCount": 20,
    "percentage": 8,
    "activeCount": 18,
    "inactiveCount": 2,
    "averageTenure": 10.3
  }
]
```

---

## Business Rules

1. **Unique Name**: Category name must be unique
2. **Cascade Protection**: Cannot delete category with active staff
3. **System Categories**: Some categories may be system-defined (non-deletable)
4. **Institution-Independent**: Categories are global, not per-institution

---

## Service Location

- **Service**: `lib/services/staff/category-service.ts`
- **Hook**: `hooks/staff/use-categories.ts`
- **Types**: `types/staff.ts`

---

*Last Updated: December 2024*
