# Academic Years, Regulations & Batches - Complete Context

> Academic calendar and student grouping management

---

## Overview

These entities manage academic cycles and student groupings:
- **Academic Years**: Define academic calendar periods
- **Regulations**: Academic rule sets for curriculum
- **Batches**: Student cohort/year groupings

---

## Academic Years

### Table: academic_years

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `academic_year_name` | TEXT | Yes | - | Display name (e.g., "2024-2025") |
| `start_date` | DATE | Yes | - | Year start date |
| `end_date` | DATE | Yes | - | Year end date |
| `is_active` | BOOLEAN | Yes | `true` | Current active year |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### TypeScript Types

```typescript
export interface AcademicYear {
  id: string;
  institution_id: string;
  academic_year_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
}

export interface CreateAcademicYearDto {
  institution_id: string;
  academic_year_name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
}

export interface AcademicYearFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

### Business Rules
1. **One active per institution**: Only one academic year active at a time
2. **Date validation**: end_date must be after start_date
3. **Naming convention**: Typically "YYYY-YYYY" format

### Sample Data

```json
{
  "id": "ay-uuid",
  "institution_id": "inst-uuid",
  "academic_year_name": "2024-2025",
  "start_date": "2024-06-01",
  "end_date": "2025-05-31",
  "is_active": true,
  "institution": {
    "id": "inst-uuid",
    "name": "JKKN College of Engineering",
    "counselling_code": "3839"
  }
}
```

---

## Regulations

### Table: regulations

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `regulation_year` | TEXT | Yes | - | Regulation year (e.g., "2024") |
| `regulation_code` | TEXT | Yes | - | Code (e.g., "REG2024") |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### TypeScript Types

```typescript
export interface Regulation {
  id: string;
  institution_id: string;
  regulation_year: string;
  regulation_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  institution?: {
    id: string;
    name: string;
    counselling_code?: string;
  };
}

export interface CreateRegulationDto {
  institution_id: string;
  regulation_year: string;
  regulation_code: string;
  is_active?: boolean;
}

export interface RegulationFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  regulation_year?: string;
  page?: number;
  limit?: number;
}
```

### Purpose
- Track curriculum versions
- Link students to their admission regulation
- Manage syllabus changes across years

### Sample Data

```json
{
  "id": "reg-uuid",
  "institution_id": "inst-uuid",
  "regulation_year": "2024",
  "regulation_code": "REG2024",
  "is_active": true
}
```

---

## Batches

### Table: batches

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `batch_year` | TEXT | Yes | - | Batch year (e.g., "2024") |
| `batch_code` | TEXT | Yes | - | Code (e.g., "BATCH2024") |
| `batch_name` | TEXT | Yes | - | Display name (e.g., "2024-2028") |
| `start_date` | DATE | Yes | - | Batch start date |
| `end_date` | DATE | Yes | - | Expected completion date |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### TypeScript Types

```typescript
export interface Batch {
  id: string;
  institution_id: string;
  batch_year: string;
  batch_code: string;
  batch_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  institution?: {
    id: string;
    name: string;
    counselling_code?: string;
  };
}

export interface CreateBatchDto {
  institution_id: string;
  batch_year: string;
  batch_code: string;
  batch_name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
}

export interface BatchFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  batch_year?: string;
  page?: number;
  limit?: number;
}
```

### Purpose
- Group students by admission year
- Track student cohorts through their program
- Enable batch-wise operations and reports

### Sample Data

```json
{
  "id": "batch-uuid",
  "institution_id": "inst-uuid",
  "batch_year": "2024",
  "batch_code": "BATCH2024",
  "batch_name": "2024-2028",
  "start_date": "2024-08-01",
  "end_date": "2028-05-31",
  "is_active": true
}
```

---

## Relationships

### Academic Year Usage

| Entity | Field | Purpose |
|--------|-------|---------|
| `timetables` | `academic_year_id` | Timetable validity |
| `staff_plans` | `academic_year_id` | Staff assignment period |
| `student_attendance` | `academic_year_id` | Attendance grouping |
| `billing_invoices` | `academic_year_id` | Fee cycle |

### Regulation Usage

| Entity | Field | Purpose |
|--------|-------|---------|
| `students` | `regulation_id` | Student curriculum version |

### Batch Usage

| Entity | Field | Purpose |
|--------|-------|---------|
| `students` | `batch_id` | Student cohort grouping |

---

## API Reference

### Academic Years

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/academic-years` | List years |
| GET | `/api/api-management/academic/academic-years/:id` | Get year |
| POST | `/api/academic/academic-years` | Create year |
| PUT | `/api/academic/academic-years/:id` | Update year |
| DELETE | `/api/academic/academic-years/:id` | Delete year |

### Regulations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/regulations` | List regulations |
| GET | `/api/api-management/academic/regulations/:id` | Get regulation |
| POST | `/api/academic/regulations` | Create regulation |
| PUT | `/api/academic/regulations/:id` | Update regulation |
| DELETE | `/api/academic/regulations/:id` | Delete regulation |

### Batches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/batches` | List batches |
| GET | `/api/api-management/academic/batches/:id` | Get batch |
| POST | `/api/academic/batches` | Create batch |
| PUT | `/api/academic/batches/:id` | Update batch |
| DELETE | `/api/academic/batches/:id` | Delete batch |

---

## Service Locations

| Service | Path |
|---------|------|
| Academic Year Service | `lib/services/academic/academic-year-service.ts` |
| Regulation Service | `lib/services/academic/regulation-service.ts` |
| Batch Service | `lib/services/academic/batch-service.ts` |

---

*Last Updated: December 2024*
