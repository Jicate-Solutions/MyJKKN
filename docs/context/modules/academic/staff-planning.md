# Staff Planning - Complete Context

> Staff-course assignment for timetable integration

---

## Overview

Staff Planning manages the assignment of teaching staff to courses for each semester/section. These assignments are used when creating timetables.

### Table Names
- `public.staff_plans` - Plan definitions
- `public.staff_plan_courses` - Staff-course assignments

---

## Data Model

### Entity: staff_plans

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `academic_year_id` | UUID | Yes | - | Academic year |
| `degree_id` | UUID | Yes | - | Degree level |
| `department_id` | UUID | Yes | - | Department |
| `program_id` | UUID | Yes | - | Program |
| `semester_id` | UUID | Yes | - | Semester |
| `section_id` | UUID | Yes | - | Section |
| `plan_name` | TEXT | No | - | Optional plan name |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Entity: staff_plan_courses

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `staff_plan_id` | UUID | Yes | - | FK to staff_plans |
| `course_id` | UUID | Yes | - | FK to courses |
| `staff_ids` | UUID[] | Yes | - | Array of staff IDs |
| `primary_staff_id` | UUID | No | - | Primary instructor |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## TypeScript Types

```typescript
export interface StaffPlan {
  id: string;
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  section_id: string;
  plan_name?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Relations
  institution?: { id: string; name: string; };
  academic_year?: { id: string; academic_year_name: string; };
  degree?: { id: string; degree_name: string; };
  department?: { id: string; department_name: string; };
  program?: { id: string; program_name: string; };
  semester?: { id: string; semester_name: string; };
  section?: { id: string; section_name: string; };
  courses?: StaffPlanCourse[];
}

export interface StaffPlanCourse {
  id: string;
  staff_plan_id: string;
  course_id: string;
  staff_ids: string[];
  primary_staff_id?: string;
  created_at: string;
  updated_at: string;

  // Relations
  course?: {
    id: string;
    course_code: string;
    course_name: string;
  };
  staff_members?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    staff_id: string;
    department_id?: string;
  }>;
  primary_staff?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface CreateStaffPlanDto {
  institution_id: string;
  academic_year_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  section_id: string;
  plan_name?: string;
  is_active?: boolean;
  courses: Array<{
    course_id: string;
    staff_ids: string[];
    primary_staff_id?: string;
  }>;
}

export interface UpdateStaffPlanDto {
  plan_name?: string;
  is_active?: boolean;
  courses?: Array<{
    course_id: string;
    staff_ids: string[];
    primary_staff_id?: string;
  }>;
}
```

---

## Relationships

### staff_plans Foreign Keys

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

### staff_plan_courses Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `staff_plans` | `staff_plan_id` | Many-to-One |
| `courses` | `course_id` | Many-to-One |
| `staff` | `staff_ids[]` | Many-to-Many |
| `staff` | `primary_staff_id` | Many-to-One |

---

## Business Rules

### Plan Rules
1. **One plan per section**: Only one active plan per section per academic year
2. **Academic hierarchy**: All hierarchy fields required
3. **Section required**: Must specify section

### Course Assignment Rules
1. **Mapped courses only**: course_id must be in course_mappings for semester
2. **Staff from institution**: staff must belong to same institution
3. **Primary staff optional**: primary_staff_id is optional
4. **Multiple staff**: Array allows multiple staff per course

---

## Staff Planning Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT CONTEXT                                               │
│     - Institution → Academic Year → Semester → Section          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. LOAD AVAILABLE COURSES                                       │
│     - From course_mappings for selected semester                │
│     - Display course_code and course_name                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. LOAD AVAILABLE STAFF                                         │
│     - From staff table for institution                          │
│     - Filter by department (optional)                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. ASSIGN STAFF TO COURSES                                      │
│     - For each course, select staff members                     │
│     - Optionally mark primary staff                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. SAVE STAFF PLAN                                              │
│     - Create/update staff_plans record                          │
│     - Create/update staff_plan_courses records                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. USE IN TIMETABLE                                             │
│     - When creating timetable slots                             │
│     - Staff dropdown populated from staff_plan_courses          │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/staff-plans` | List staff plans |
| GET | `/api/api-management/academic/staff-plans/:id` | Get staff plan |
| POST | `/api/academic/staff-plans` | Create staff plan |
| PUT | `/api/academic/staff-plans/:id` | Update staff plan |
| DELETE | `/api/academic/staff-plans/:id` | Delete staff plan |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `institution_id` | UUID | Filter by institution |
| `academic_year_id` | UUID | Filter by academic year |
| `semester_id` | UUID | Filter by semester |
| `section_id` | UUID | Filter by section |
| `is_active` | boolean | Filter by active status |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Sample Data

### Staff Plan

```json
{
  "id": "plan-uuid",
  "institution_id": "inst-uuid",
  "academic_year_id": "ay-uuid",
  "degree_id": "degree-uuid",
  "department_id": "dept-uuid",
  "program_id": "prog-uuid",
  "semester_id": "sem-uuid",
  "section_id": "sec-uuid",
  "plan_name": "CSE Sem 1 Section A - 2024",
  "is_active": true,
  "created_at": "2024-06-15T10:00:00Z"
}
```

### Staff Plan Course

```json
{
  "id": "spc-uuid",
  "staff_plan_id": "plan-uuid",
  "course_id": "cs101-uuid",
  "staff_ids": ["staff-uuid-1", "staff-uuid-2"],
  "primary_staff_id": "staff-uuid-1",
  "course": {
    "id": "cs101-uuid",
    "course_code": "CS101",
    "course_name": "Data Structures"
  },
  "staff_members": [
    {
      "id": "staff-uuid-1",
      "first_name": "Dr. Smith",
      "last_name": "Johnson",
      "email": "smith@jkkn.ac.in",
      "staff_id": "FAC001"
    },
    {
      "id": "staff-uuid-2",
      "first_name": "Prof. Kumar",
      "last_name": "Rajan",
      "email": "kumar@jkkn.ac.in",
      "staff_id": "FAC002"
    }
  ]
}
```

---

## Integration with Timetable

When creating timetable slots:

```typescript
// Fetch staff assignments for dropdown
const { data: staffPlan } = await StaffPlanService.getStaffPlan({
  institution_id: institutionId,
  academic_year_id: academicYearId,
  semester_id: semesterId,
  section_id: sectionId
});

// Get available staff for a course
const courseAssignment = staffPlan.courses.find(
  c => c.course_id === selectedCourseId
);
const availableStaff = courseAssignment?.staff_members || [];

// Populate timetable slot
const slot = {
  course_id: selectedCourseId,
  staff_ids: availableStaff.map(s => s.id),
  // ... other slot fields
};
```

---

## Service Location

- **Service**: `lib/services/academic/staff-plan-service.ts`
- **Hook**: `hooks/academic/use-staff-plans.ts`
- **Types**: `types/staff-plan.ts`

---

*Last Updated: December 2024*
