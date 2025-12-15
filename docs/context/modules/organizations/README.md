# Organizations Module - Complete Context

> Institutional hierarchy and structure management for MyJKKN

---

## Overview

The Organizations module manages the complete institutional hierarchy of JKKN educational institutions. This is the **foundational module** - all other modules depend on the organizational structure defined here.

### Purpose
- Define and manage educational institutions
- Create academic hierarchy (Degree → Department → Program → Semester → Section)
- Manage course catalog and course mappings
- Support multi-tenant data isolation

### User Roles
| Role | Access Level |
|------|--------------|
| Super Admin | Full CRUD on all institutions |
| Admin | CRUD on assigned institution(s) |
| HOD | View + limited edit on department |
| Faculty | View only |
| Student | View only (own institution) |

### Dependencies
This module is **required by** all other modules for:
- Institution-based data filtering
- Academic hierarchy for students, staff, timetables
- Course assignments and mappings

---

## Module Hierarchy

```
Institution
├── Degree (UG/PG)
│   └── Department
│       └── Program
│           └── Semester
│               └── Section
└── Course (independent, mapped via course_mappings)
```

**Example:**
```
JKKN College of Engineering
├── UG (Undergraduate)
│   └── Computer Science & Engineering
│       └── B.Tech CSE
│           └── Semester 1
│               ├── Section A
│               └── Section B
└── Courses: Data Structures, DBMS, OS, etc.
    └── Mapped to: B.Tech CSE → Semester 1
```

---

## Entity Summary

| Entity | Table | Fields | Key Purpose |
|--------|-------|--------|-------------|
| [Institution](./institutions.md) | `institutions` | 25+ | Educational organization |
| [Degree](./degrees.md) | `degrees` | 12 | UG/PG classification |
| [Department](./departments.md) | `departments` | 12 | Academic department |
| [Program](./programs.md) | `programs` | 10 | Degree program |
| [Semester](./semesters.md) | `semesters` | 12 | Academic semester |
| [Section](./sections.md) | `sections` | 10 | Class section |
| [Course](./courses.md) | `courses` | 8 | Course definition |
| Course Mapping | `course_mappings` | 10 | Links courses to semesters |

---

## Quick Reference

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organizations/institutions` | List institutions |
| GET | `/api/api-management/organizations/institutions/:id` | Get institution |
| GET | `/api/api-management/organizations/degrees` | List degrees |
| GET | `/api/api-management/organizations/departments` | List departments |
| GET | `/api/api-management/organizations/programs` | List programs |
| GET | `/api/api-management/organizations/courses` | List courses |

### Permission Keys

| Operation | Permission Key |
|-----------|----------------|
| View Institutions | `organizations.institutions.view` |
| Create Institution | `organizations.institutions.create` |
| Edit Institution | `organizations.institutions.edit` |
| Delete Institution | `organizations.institutions.delete` |
| View Degrees | `organizations.degrees.view` |
| View Departments | `organizations.departments.view` |
| View Programs | `organizations.programs.view` |
| View Courses | `organizations.courses.view` |
| View Mappings | `organizations.mappings.view` |

---

## Business Rules

### Institution Rules
1. **Unique Counselling Code**: Each institution must have a unique `counselling_code`
2. **Active Status**: Deactivating an institution restricts access but preserves data
3. **Multi-tenant Isolation**: All data queries filter by `institution_id`

### Hierarchy Rules
1. **Cascading Dependency**: Cannot delete a degree if departments exist under it
2. **Required Chain**: Section requires → Semester → Program → Department → Degree → Institution
3. **Course Mapping**: Courses are mapped to specific semesters, not directly to programs

### Data Validation
1. Institution name: Required, max 255 characters
2. Degree code: Required, unique per institution
3. Department code: Required, unique per institution+degree
4. Program name: Required
5. Semester type: Must be 'even' or 'odd'
6. Section name: Required, typically A/B/C etc.

---

## User Flows

### Flow 1: Create New Academic Structure

```
1. Create Institution (if not exists)
   └── Required: name, counselling_code, category, institution_type

2. Create Degree under Institution
   └── Required: degree_id, degree_name, degree_type (ug/pg)

3. Create Department under Degree
   └── Required: department_code, department_name

4. Create Program under Department
   └── Required: program_id, program_name

5. Create Semesters under Program
   └── Required: semester_code, semester_name, semester_type

6. Create Sections under each Semester
   └── Required: section_name

7. Create Courses (independent)
   └── Required: course_code, course_name

8. Map Courses to Semesters
   └── Creates course_mappings records
```

### Flow 2: Fetch Academic Hierarchy for Filters

```
1. User selects Institution
   └── API: GET /degrees?institution_id=xxx

2. User selects Degree
   └── API: GET /departments?degree_id=xxx

3. User selects Department
   └── API: GET /programs?department_id=xxx

4. User selects Program
   └── API: GET /semesters?program_id=xxx

5. User selects Semester
   └── API: GET /sections?semester_id=xxx
   └── API: GET /course-mappings?semester_id=xxx (for courses)
```

---

## Standard Response Format

```json
{
  "data": [
    {
      "id": "uuid",
      "field1": "value1",
      "institution": {
        "id": "uuid",
        "name": "JKKN College of Engineering"
      }
    }
  ],
  "metadata": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

---

## Integration Points

### For Child Applications

1. **Read Institution List**
   - Use to populate institution dropdowns
   - Filter by user's access

2. **Cascading Filters**
   - Institution → Degree → Department → Program → Semester → Section
   - Each level depends on parent selection

3. **Course Discovery**
   - Get available courses via course_mappings
   - Filter by semester for relevant courses

### Available Events
- Institution created/updated/deleted
- Hierarchy changes (new degree, department, etc.)

---

## Files in This Module

| File | Description |
|------|-------------|
| [institutions.md](./institutions.md) | Institution entity documentation |
| [degrees.md](./degrees.md) | Degree entity documentation |
| [departments.md](./departments.md) | Department entity documentation |
| [programs.md](./programs.md) | Program entity documentation |
| [semesters.md](./semesters.md) | Semester entity documentation |
| [sections.md](./sections.md) | Section entity documentation |
| [courses.md](./courses.md) | Course entity documentation |

---

## Related Documentation

- **[Academic Hierarchy](../../entities/academic-hierarchy.md)** - Visual hierarchy diagram
- **[Students Module](../students/README.md)** - Uses organization hierarchy for enrollment
- **[Academic Module](../academic/README.md)** - Uses for timetables and attendance

---

*Last Updated: December 2024*
