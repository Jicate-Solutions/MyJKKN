# Timetable Entity - Complete Context

> Comprehensive timetable management with JSONB slot data

---

## Overview

The `timetables` table stores timetable definitions with flexible JSONB structure for period slots, supporting both regular (day-based) and batch (date-based) formats.

### Table Name
`public.timetables`

### Key Features
- Regular and batch timetable formats
- Section-level and semester-level types
- Template support for quick creation
- JSONB-based slot storage
- Multi-staff per slot
- Section subdivision for practicals

---

## Data Model

### Primary Entity: timetables

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `academic_year_id` | UUID | Yes | - | Academic year |
| `degree_id` | UUID | Yes | - | Degree level |
| `department_id` | UUID | Yes | - | Department |
| `program_id` | UUID | Yes | - | Program |
| `semester_id` | UUID | Yes | - | Semester |
| `section_id` | UUID | No | - | Section (null for semester-level) |
| `timetable_type` | TEXT | Yes | - | `'section'` or `'semester'` |
| `timetable_format` | TEXT | Yes | `'regular'` | `'regular'` or `'batch'` |
| `timetable_name` | TEXT | Yes | - | Display name |
| `version` | INTEGER | Yes | `1` | Version number |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `is_template` | BOOLEAN | Yes | `false` | Template flag |
| `template_name` | TEXT | No | - | Template name (if template) |
| `template_description` | TEXT | No | - | Template description |
| `template_category` | TEXT | No | - | Template category |
| `template_tags` | TEXT[] | No | - | Template tags array |
| `usage_count` | INTEGER | No | `0` | Template usage count |
| `created_from_template_id` | UUID | No | - | Source template FK |
| `start_date` | DATE | No | - | Effective start date |
| `end_date` | DATE | No | - | Effective end date |
| `selected_days` | TEXT[] | No | - | Selected days (regular format) |
| `selected_dates` | JSONB | No | - | Selected dates (batch format) |
| `periods` | JSONB | No | - | Period definitions |
| `timetable_data` | JSONB | No | - | Slot data structure |
| `created_by` | UUID | Yes | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## JSONB Structures

### periods (Period Definitions)

```json
[
  {
    "period_id": "period-uuid-1",
    "period_name": "Period 1",
    "start_time": "09:00:00",
    "end_time": "09:50:00",
    "is_break": false,
    "order": 1
  },
  {
    "period_id": "break-uuid",
    "period_name": "Tea Break",
    "start_time": "09:50:00",
    "end_time": "10:00:00",
    "is_break": true,
    "order": 2
  },
  {
    "period_id": "period-uuid-2",
    "period_name": "Period 2",
    "start_time": "10:00:00",
    "end_time": "10:50:00",
    "is_break": false,
    "order": 3
  }
]
```

### timetable_data (Regular Format)

For day-based timetables (repeating weekly):

```json
{
  "MONDAY": {
    "[period_id]": {
      "slot_id": "slot-uuid",
      "course_id": "course-uuid",
      "slot_date": "MONDAY",
      "staff_ids": ["staff-uuid-1", "staff-uuid-2"],
      "section_ids": ["section-uuid"],
      "is_break_slot": false,
      "is_combined": false,
      "sub_slots": [],
      "is_subdivided": false,
      "created_at": "2024-12-15T10:00:00Z",
      "updated_at": "2024-12-15T10:00:00Z"
    }
  },
  "TUESDAY": {
    // Similar structure
  }
}
```

### timetable_data (Batch Format)

For date-specific timetables:

```json
{
  "2024-12-15": {
    "[period_id]": {
      "slot_id": "slot-uuid",
      "course_id": "course-uuid",
      "slot_date": "2024-12-15",
      "staff_ids": ["staff-uuid-1"],
      "section_ids": ["section-uuid"],
      "is_break_slot": false,
      "is_combined": false,
      "sub_slots": [],
      "period_mode": "practical",
      "practical_config": {
        "batches": [
          {
            "batch_id": "batch-1",
            "batch_name": "Batch A",
            "assignment_type": "section",
            "section_ids": ["section-uuid"],
            "estimated_count": 30
          }
        ],
        "available_courses": [
          {
            "course_id": "course-uuid",
            "course_name": "Chemistry Lab",
            "course_code": "CH101L"
          }
        ],
        "rotation_type": "manual"
      }
    }
  }
}
```

### Sub-Slot Structure (Combined Classes)

When `is_combined: true`:

```json
{
  "slot_id": "slot-uuid",
  "is_combined": true,
  "sub_slots": [
    {
      "sub_slot_order": 1,
      "course_id": "course-uuid-1",
      "staff_ids": ["staff-uuid-1"],
      "section_ids": ["section-uuid-a"],
      "is_break_slot": false
    },
    {
      "sub_slot_order": 2,
      "course_id": "course-uuid-2",
      "staff_ids": ["staff-uuid-2"],
      "section_ids": ["section-uuid-b"],
      "is_break_slot": false
    }
  ]
}
```

### Section Subdivision Structure

When `is_subdivided: true`:

```json
{
  "slot_id": "slot-uuid",
  "is_subdivided": true,
  "subdivision_type": "practical",
  "subdivision_mode": "manual",
  "sub_slots": [
    {
      "sub_slot_order": 1,
      "course_id": "course-uuid",
      "staff_ids": ["staff-uuid-1"],
      "section_ids": ["section-uuid"],
      "group_name": "Group A - Lab 1",
      "student_ids": ["student-uuid-1", "student-uuid-2"],
      "lab_room": "Lab Room 1",
      "max_capacity": 30
    },
    {
      "sub_slot_order": 2,
      "course_id": "course-uuid",
      "staff_ids": ["staff-uuid-2"],
      "section_ids": ["section-uuid"],
      "group_name": "Group B - Lab 2",
      "student_ids": ["student-uuid-3", "student-uuid-4"],
      "lab_room": "Lab Room 2",
      "max_capacity": 30
    }
  ]
}
```

---

## TypeScript Types

```typescript
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface Timetable {
  id: string;
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  section_id?: string;
  timetable_type: 'section' | 'semester';
  timetable_format: 'regular' | 'batch';
  timetable_name: string;
  version: number;
  is_active: boolean;
  is_template: boolean;
  template_name?: string;
  template_description?: string;
  template_category?: string;
  template_tags?: string[];
  usage_count?: number;
  created_from_template_id?: string;
  start_date?: string;
  end_date?: string;
  selected_days?: DayOfWeek[];
  selected_dates?: string[] | any;
  periods?: any;
  timetable_data?: any;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Joined relations
  institution?: { id: string; name: string; };
  academic_year?: { id: string; academic_year_name: string; };
  degree?: { id: string; degree_name: string; };
  program?: { id: string; program_name: string; };
  department?: { id: string; department_name: string; };
  semesters?: { id: string; semester_name: string; };
  sections?: { id: string; section_name: string; };
  available_sections?: Array<{ id: string; section_name: string; }>;
  slots?: TimetableSlot[];
}

export interface TimetableSlot {
  slot_id: string;
  course_id: string;
  slot_date: string | DayOfWeek;
  staff_ids: string[];
  section_ids: string[];
  is_break_slot: boolean;
  break_description?: string;
  is_combined: boolean;
  sub_slots: SubSlot[];
  is_subdivided?: boolean;
  subdivision_type?: 'practical' | 'lab' | 'tutorial' | 'workshop';
  subdivision_mode?: 'manual' | 'auto';
  period_mode?: 'standard' | 'practical';
  practical_config?: PracticalConfig;
  created_at: string;
  updated_at: string;

  // Populated relations
  course?: { id: string; course_name: string; course_code: string; };
  staff_members?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    staff_id: string;
  }>;
  sections?: Array<{ id: string; section_name: string; }>;
}
```

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |
| `academic_years` | `academic_year_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |
| `programs` | `program_id` | Many-to-One |
| `semesters` | `semester_id` | Many-to-One |
| `sections` | `section_id` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |
| `timetables` | `created_from_template_id` | Self-reference |

### Referenced By

| Table | Via | Description |
|-------|-----|-------------|
| `student_attendance` | `timetable_id` | Attendance records |

---

## Business Rules

### Creation Rules
1. **Academic hierarchy required**: All hierarchy fields must be valid
2. **Section for section-type**: section_id required if timetable_type = 'section'
3. **No section for semester-type**: section_id should be null for semester-level
4. **Active limit**: Only one active timetable per section/semester

### Slot Rules
1. **Course from mappings**: course_id must be from course_mappings for that semester
2. **Staff from staff_plans**: staff_ids should be from staff_plan_courses
3. **Unique slot per period**: One slot per period per day/date
4. **Break slots**: is_break_slot = true has no course/staff

### Template Rules
1. **Template flag**: is_template = true for templates
2. **Template name required**: template_name required for templates
3. **Usage tracking**: usage_count increments when template used

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/timetables` | List timetables |
| GET | `/api/api-management/academic/timetables/:id` | Get timetable |
| POST | `/api/academic/timetables` | Create timetable |
| PUT | `/api/academic/timetables/:id` | Update timetable |
| DELETE | `/api/academic/timetables/:id` | Delete timetable |
| GET | `/api/academic/timetables/templates` | List templates |
| POST | `/api/academic/timetables/from-template` | Create from template |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name |
| `institution_id` | UUID | Filter by institution |
| `academic_year_id` | UUID | Filter by academic year |
| `degree_id` | UUID | Filter by degree |
| `program_id` | UUID | Filter by program |
| `department_id` | UUID | Filter by department |
| `semester` | UUID | Filter by semester |
| `section` | string | Filter by section name |
| `is_active` | boolean | Filter by active status |
| `is_template` | boolean | Filter templates only |
| `timetable_type` | string | Filter by type |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Sample Data

### Complete Timetable Record

```json
{
  "id": "timetable-uuid",
  "institution_id": "inst-uuid",
  "academic_year_id": "ay-uuid",
  "degree_id": "degree-uuid",
  "department_id": "dept-uuid",
  "program_id": "prog-uuid",
  "semester_id": "sem-uuid",
  "section_id": "sec-uuid",
  "timetable_type": "section",
  "timetable_format": "regular",
  "timetable_name": "CSE Sem 1 Section A - 2024",
  "version": 1,
  "is_active": true,
  "is_template": false,
  "selected_days": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  "periods": [
    {
      "period_id": "p1",
      "period_name": "Period 1",
      "start_time": "09:00:00",
      "end_time": "09:50:00",
      "is_break": false,
      "order": 1
    }
  ],
  "timetable_data": {
    "MONDAY": {
      "p1": {
        "slot_id": "slot-1",
        "course_id": "cs101-uuid",
        "staff_ids": ["staff-uuid"],
        "section_ids": ["sec-uuid"],
        "is_break_slot": false,
        "is_combined": false,
        "sub_slots": []
      }
    }
  },
  "created_by": "user-uuid",
  "created_at": "2024-06-15T10:00:00Z",
  "updated_at": "2024-06-15T10:00:00Z"
}
```

---

## Service Location

- **Service**: `lib/services/academic/timetable-service.ts` (2,580+ lines)
- **Hook**: `hooks/academic/use-timetables.ts`
- **Types**: `types/academics.ts`

---

*Last Updated: December 2024*
