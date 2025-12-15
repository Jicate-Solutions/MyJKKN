# Academic Hierarchy - Entity Relationships

> Complete relationship chain from Institution to Section

---

## Overview

MyJKKN uses a **6-level academic hierarchy** that structures all academic data. Understanding this hierarchy is essential for building any application that works with student enrollment, timetables, attendance, or academic operations.

---

## Hierarchy Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        INSTITUTION                               │
│  (JKKN College of Engineering)                                   │
│  Table: institutions                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          DEGREE                                  │
│  (UG - Undergraduate, PG - Postgraduate)                        │
│  Table: degrees                                                  │
│  FK: institution_id                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DEPARTMENT                                │
│  (Computer Science, Mechanical, Civil, etc.)                    │
│  Table: departments                                              │
│  FK: institution_id, degree_id                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         PROGRAM                                  │
│  (B.Tech CSE, M.Tech CSE, BDS, B.Pharm, etc.)                  │
│  Table: programs                                                 │
│  FK: institution_id, degree_id, department_id                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SEMESTER                                  │
│  (Semester 1, Semester 2, ... Semester 8)                       │
│  Table: semesters                                                │
│  FK: institution_id, degree_id, department_id, program_id        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SECTION                                  │
│  (A, B, C, D)                                                    │
│  Table: sections                                                 │
│  FK: institution_id, degree_id, department_id, program_id,       │
│      semester_id                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Real-World Example

```
JKKN College of Engineering (Institution)
├── UG (Degree - Undergraduate)
│   ├── Computer Science & Engineering (Department)
│   │   └── B.Tech CSE (Program)
│   │       ├── Semester 1 (Semester)
│   │       │   ├── Section A (60 students)
│   │       │   └── Section B (60 students)
│   │       ├── Semester 2
│   │       │   ├── Section A
│   │       │   └── Section B
│   │       └── ... (up to Semester 8)
│   │
│   ├── Mechanical Engineering (Department)
│   │   └── B.Tech MECH (Program)
│   │       └── ... (Semesters & Sections)
│   │
│   └── Electronics & Communication (Department)
│       └── B.Tech ECE (Program)
│           └── ... (Semesters & Sections)
│
└── PG (Degree - Postgraduate)
    └── Computer Science & Engineering (Department)
        └── M.Tech CSE (Program)
            └── ... (4 Semesters)
```

---

## Foreign Key Relationships

### Complete Chain

```sql
-- Each level references all parent levels for data integrity
sections.institution_id → institutions.id
sections.degree_id → degrees.id
sections.department_id → departments.id
sections.program_id → programs.id
sections.semester_id → semesters.id

-- Same pattern for students
students.institution_id → institutions.id
students.degree_id → degrees.id
students.department_id → departments.id
students.program_id → programs.id
students.semester_id → semesters.id
students.section_id → sections.id
```

### Query Pattern

```typescript
// Get complete hierarchy for a student
const { data: student } = await supabase
  .from('students')
  .select(`
    id,
    first_name,
    institution:institutions(id, name),
    degree:degrees(id, degree_name),
    department:departments(id, department_name),
    program:programs(id, program_name),
    semester:semesters(id, semester_name),
    section:sections(id, section_name)
  `)
  .eq('id', studentId)
  .single();
```

---

## Cascading Filters Pattern

When building filters in UI, use cascading selections:

```typescript
// Step 1: Load Institutions (top level)
const institutions = await supabase.from('institutions').select('id, name');

// Step 2: User selects institution, load Degrees
const degrees = await supabase
  .from('degrees')
  .select('id, degree_name')
  .eq('institution_id', selectedInstitutionId);

// Step 3: User selects degree, load Departments
const departments = await supabase
  .from('departments')
  .select('id, department_name')
  .eq('degree_id', selectedDegreeId);

// Step 4: User selects department, load Programs
const programs = await supabase
  .from('programs')
  .select('id, program_name')
  .eq('department_id', selectedDepartmentId);

// Step 5: User selects program, load Semesters
const semesters = await supabase
  .from('semesters')
  .select('id, semester_name')
  .eq('program_id', selectedProgramId);

// Step 6: User selects semester, load Sections
const sections = await supabase
  .from('sections')
  .select('id, section_name')
  .eq('semester_id', selectedSemesterId);
```

---

## Related Entities

### Courses (Independent with Mapping)

Courses are NOT part of the direct hierarchy. They are:
1. Defined at **institution level** (`courses` table)
2. **Mapped to semesters** via `course_mappings` table

```
Institution
├── Course (CS101 - Data Structures)
├── Course (CS102 - DBMS)
└── Course Mapping → Semester 3
    └── Links CS101, CS102 to B.Tech CSE Semester 3
```

### Academic Year (Parallel Structure)

Academic years run parallel to the hierarchy:

```
Academic Year 2024-25
├── Applies to: All semesters in the institution
└── Used for: Student enrollment, timetables, attendance
```

### Regulations and Batches

```
Regulation (REG2024)
├── Institution-level academic rules
└── Linked to students for curriculum tracking

Batch (2024-2028)
├── Student cohort grouping
└── Linked to students for batch-wise operations
```

---

## Usage Across Modules

| Module | Uses Hierarchy For |
|--------|-------------------|
| **Students** | Enrollment (all levels) |
| **Staff** | Department assignment |
| **Academic/Timetables** | Section-level scheduling |
| **Academic/Attendance** | Section-level marking |
| **Billing** | Student billing by program/section |
| **Admissions** | Application routing |
| **Users** | Access control by institution/department |

---

## Data Integrity Rules

1. **Cannot delete parent** if child records exist
2. **All foreign keys required** for proper hierarchy placement
3. **Institution ID propagates** to all child tables for multi-tenancy
4. **RLS policies** enforce institution-level data isolation

---

## API Response Structure

When fetching entities with hierarchy:

```json
{
  "id": "section-uuid",
  "section_name": "A",
  "institution": {
    "id": "inst-uuid",
    "name": "JKKN College of Engineering"
  },
  "degree": {
    "id": "degree-uuid",
    "degree_name": "Undergraduate"
  },
  "department": {
    "id": "dept-uuid",
    "department_name": "Computer Science and Engineering"
  },
  "program": {
    "id": "prog-uuid",
    "program_name": "B.Tech CSE"
  },
  "semester": {
    "id": "sem-uuid",
    "semester_name": "Semester 1",
    "semester_code": "S1"
  }
}
```

---

## Quick Reference

| Level | Table | Key Fields | Parent FK |
|-------|-------|-----------|-----------|
| 1 | institutions | name, category | - |
| 2 | degrees | degree_id, degree_type | institution_id |
| 3 | departments | department_code | degree_id |
| 4 | programs | program_id | department_id |
| 5 | semesters | semester_code, semester_type | program_id |
| 6 | sections | section_name | semester_id |

---

*Last Updated: December 2024*
