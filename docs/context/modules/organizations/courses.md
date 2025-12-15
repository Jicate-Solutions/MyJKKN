# Course Entity - Complete Context

> Course/subject definition and semester mapping

---

## Overview

The `courses` table stores course definitions, while `course_mappings` links courses to specific semesters.

### Purpose
- Define course catalog for institution
- Map courses to semesters for curriculum
- Support course-based timetable and attendance

### Table Names
- `public.courses` - Course definitions
- `public.course_mappings` - Course-semester links

---

## Data Model

### Primary Entity: courses

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `uuid_generate_v4()` | Primary key |
| `institution_id` | UUID | No | - | Parent institution |
| `course_code` | TEXT | Yes | - | Course code (e.g., "CS101") |
| `course_name` | TEXT | Yes | - | Course name (e.g., "Data Structures") |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Related Entity: course_mappings

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `uuid_generate_v4()` | Primary key |
| `institution_id` | UUID | Yes | - | Institution |
| `degree_id` | UUID | Yes | - | Degree |
| `department_id` | UUID | Yes | - | Department |
| `program_id` | UUID | Yes | - | Program |
| `semester_id` | UUID | Yes | - | Semester |
| `course_id` | UUID | Yes | - | Course reference |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## Relationships

### Courses Table
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |
| `course_mappings` | `course_id` | One-to-Many |

### Course Mappings Table
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |
| `programs` | `program_id` | Many-to-One |
| `semesters` | `semester_id` | Many-to-One |
| `courses` | `course_id` | Many-to-One |

---

## Business Rules

### Course Rules
1. **Unique Code**: `course_code` should be unique per institution
2. **Institution Scope**: Courses belong to institutions
3. **Reusable**: Same course can be mapped to multiple semesters

### Mapping Rules
1. **Full Chain**: Mapping requires all hierarchy levels
2. **Multiple Courses**: A semester can have many courses
3. **Bulk Create**: Can map multiple courses to semester at once

---

## Permissions Required

| Operation | Permission Key |
|-----------|----------------|
| View Courses | `organizations.courses.view` |
| Create Course | `organizations.courses.create` |
| Edit Course | `organizations.courses.edit` |
| Delete Course | `organizations.courses.delete` |
| View Mappings | `organizations.mappings.view` |
| Create Mapping | `organizations.mappings.create` |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organizations/courses` | List courses |
| GET | `/api/api-management/organizations/courses/:id` | Get course |
| GET | `/api/organizations/course-mappings` | List mappings |
| POST | `/api/organizations/course-mappings` | Create mappings |

### Course Response Example

```json
{
  "data": [
    {
      "id": "course-uuid",
      "institution_id": "inst-uuid",
      "course_code": "CS101",
      "course_name": "Introduction to Programming",
      "is_active": true,
      "institution": {
        "id": "inst-uuid",
        "name": "JKKN College of Engineering"
      }
    },
    {
      "id": "course-uuid-2",
      "institution_id": "inst-uuid",
      "course_code": "CS201",
      "course_name": "Data Structures and Algorithms",
      "is_active": true
    }
  ],
  "metadata": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

### Course Mapping Response Example

```json
{
  "data": [
    {
      "id": "mapping-uuid",
      "institution_id": "inst-uuid",
      "degree_id": "degree-uuid",
      "department_id": "dept-uuid",
      "program_id": "prog-uuid",
      "semester_id": "sem-uuid",
      "course_id": "course-uuid",
      "is_active": true,
      "course": {
        "id": "course-uuid",
        "course_code": "CS101",
        "course_name": "Introduction to Programming"
      },
      "semester": {
        "id": "sem-uuid",
        "semester_name": "Semester 1"
      }
    }
  ]
}
```

---

## TypeScript Types

```typescript
// Course
export interface Course {
  id: string;
  institution_id: string;
  course_code: string;
  course_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: { id: string; name: string; };
}

export interface CreateCourseDto {
  institution_id: string;
  course_code: string;
  course_name: string;
  is_active?: boolean;
}

export interface CourseFilters {
  search?: string;
  institution_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

// Course Mapping
export interface CourseMapping {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  course_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: { id: string; name: string; };
  degree?: { id: string; degree_name: string; };
  department?: { id: string; department_name: string; };
  program?: { id: string; program_name: string; };
  semester?: { id: string; semester_name: string; };
  course?: { id: string; course_code: string; course_name: string; };
}

export interface CreateCourseMappingDto {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  course_ids: string[];  // Can map multiple courses at once
  is_active?: boolean;
}

export interface CourseMappingFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  course_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Sample Data

### Sample Courses

```json
[
  { "course_code": "CS101", "course_name": "Introduction to Programming" },
  { "course_code": "CS201", "course_name": "Data Structures and Algorithms" },
  { "course_code": "CS301", "course_name": "Database Management Systems" },
  { "course_code": "CS401", "course_name": "Operating Systems" },
  { "course_code": "CS501", "course_name": "Computer Networks" },
  { "course_code": "MA101", "course_name": "Engineering Mathematics I" },
  { "course_code": "PH101", "course_name": "Engineering Physics" },
  { "course_code": "CH101", "course_name": "Engineering Chemistry" },
  { "course_code": "EE101", "course_name": "Basic Electrical Engineering" },
  { "course_code": "ME101", "course_name": "Engineering Graphics" }
]
```

---

## Integration Notes

### For Timetable Creation
- Available courses for timetable slots come from course_mappings
- Filter: `course_mappings.semester_id = timetable.semester_id`

### For Staff Planning
- Staff assigned to courses via staff_plan_courses
- Course must be mapped to the semester for assignment

### Code Example: Get Available Courses for Semester

```typescript
const { data: courses } = await supabase
  .from('course_mappings')
  .select(`
    id,
    course:courses(id, course_code, course_name)
  `)
  .eq('semester_id', selectedSemesterId)
  .eq('is_active', true);
```

---

## Service Location

- **Course Service**: `lib/services/organization/course-service.ts`
- **Mapping Service**: `lib/services/organization/course-mapping-service.ts`
- **Course Hook**: `hooks/organization/use-courses.ts`
- **Mapping Hook**: `hooks/organization/use-course-mappings.ts`

---

*Last Updated: December 2024*
