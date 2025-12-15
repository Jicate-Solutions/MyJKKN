# Period Entity - Complete Context

> Period timing definitions for timetables

---

## Overview

The `periods` table defines period timings that are used in timetables. Each institution can have its own set of periods.

### Table Name
`public.periods`

---

## Data Model

### Primary Entity: periods

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `period_name` | TEXT | Yes | - | Display name (e.g., "Period 1") |
| `start_time` | TIME | Yes | - | Start time (HH:MM:SS) |
| `end_time` | TIME | Yes | - | End time (HH:MM:SS) |
| `is_break` | BOOLEAN | Yes | `false` | Break period flag |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## TypeScript Types

```typescript
export interface Period {
  id: string;
  period_name: string;
  start_time: string;  // Format: HH:MM:SS
  end_time: string;    // Format: HH:MM:SS
  is_break: boolean;
  institution_id: string;
  created_at: string;
  updated_at: string;

  // Relations
  institution?: {
    id: string;
    name: string;
  };
}

export interface CreatePeriodDto {
  period_name: string;
  start_time: string;
  end_time: string;
  is_break?: boolean;
  institution_id: string;
}

export interface UpdatePeriodDto extends Partial<CreatePeriodDto> {}

export interface PeriodFilters {
  search?: string;
  institution_id?: string;
  isBreak?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}
```

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |

### Usage

Periods are referenced in:
- `timetables.periods` JSONB array
- `attendance_data.[slot].period_id`

---

## Business Rules

### Period Rules
1. **Institution scope**: Periods belong to one institution
2. **Time order**: end_time must be after start_time
3. **No overlap**: Periods should not overlap within same institution
4. **Break periods**: is_break = true for lunch/tea breaks

### Naming Convention
- Regular: "Period 1", "Period 2", etc.
- Breaks: "Tea Break", "Lunch Break", etc.

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/periods` | List periods |
| GET | `/api/api-management/academic/periods/:id` | Get period |
| POST | `/api/academic/periods` | Create period |
| PUT | `/api/academic/periods/:id` | Update period |
| DELETE | `/api/academic/periods/:id` | Delete period |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name |
| `institution_id` | UUID | Filter by institution |
| `isBreak` | boolean | Filter breaks only |
| `page` | number | Page number |
| `limit` | number | Items per page |
| `sortBy` | string | Sort field |
| `sortDirection` | string | 'asc' or 'desc' |

---

## Sample Data

### Standard Engineering College Schedule

```json
[
  {
    "id": "p1-uuid",
    "period_name": "Period 1",
    "start_time": "09:00:00",
    "end_time": "09:50:00",
    "is_break": false
  },
  {
    "id": "p2-uuid",
    "period_name": "Period 2",
    "start_time": "09:50:00",
    "end_time": "10:40:00",
    "is_break": false
  },
  {
    "id": "tb-uuid",
    "period_name": "Tea Break",
    "start_time": "10:40:00",
    "end_time": "11:00:00",
    "is_break": true
  },
  {
    "id": "p3-uuid",
    "period_name": "Period 3",
    "start_time": "11:00:00",
    "end_time": "11:50:00",
    "is_break": false
  },
  {
    "id": "p4-uuid",
    "period_name": "Period 4",
    "start_time": "11:50:00",
    "end_time": "12:40:00",
    "is_break": false
  },
  {
    "id": "lb-uuid",
    "period_name": "Lunch Break",
    "start_time": "12:40:00",
    "end_time": "13:30:00",
    "is_break": true
  },
  {
    "id": "p5-uuid",
    "period_name": "Period 5",
    "start_time": "13:30:00",
    "end_time": "14:20:00",
    "is_break": false
  },
  {
    "id": "p6-uuid",
    "period_name": "Period 6",
    "start_time": "14:20:00",
    "end_time": "15:10:00",
    "is_break": false
  },
  {
    "id": "p7-uuid",
    "period_name": "Period 7",
    "start_time": "15:10:00",
    "end_time": "16:00:00",
    "is_break": false
  }
]
```

---

## Service Location

- **Service**: `lib/services/academic/period-service.ts`
- **Hook**: `hooks/academic/use-periods.ts`
- **Types**: `types/academics.ts`

---

*Last Updated: December 2024*
