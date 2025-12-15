# Students Module - Complete Context

> Comprehensive student management for JKKN institutions

---

## Overview

The Students module is the **primary entity module** in MyJKKN, managing the complete student lifecycle from enrollment to graduation.

### Purpose
- Manage student profiles and enrollment data
- Track academic progress and status
- Support bulk operations (upload, edit, promote)
- Provide student dashboard analytics

### User Roles
| Role | Access Level |
|------|--------------|
| Super Admin | Full CRUD on all students |
| Admin | CRUD on institution's students |
| HOD | View department students, limited edit |
| Faculty | View assigned section students |
| Student | View/edit own profile only |

### Key Capabilities
- **80+ fields** per student record
- **Bulk upload** from Excel templates
- **Bulk edit** for field updates
- **Photo management** with bulk upload
- **Promotion** between semesters/sections
- **Dashboard analytics** with demographic insights

---

## Module Features

| Feature | Route | Description |
|---------|-------|-------------|
| Student List | `/students` | View all students with filters |
| Student Detail | `/students/[id]` | Individual student profile |
| Dashboard | `/students/dashboard` | Analytics and statistics |
| Graduated | `/students/graduated` | Alumni management |
| Promotion | `/students/promotion` | Bulk promotion workflow |

---

## Entity Summary

| Entity | Table | Fields | Description |
|--------|-------|--------|-------------|
| [Student](./student-entity.md) | `students` | 80+ | Complete student record |
| Admission | `admissions` | 70+ | Pre-enrollment records |

---

## Quick Reference

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/students` | List students |
| GET | `/api/api-management/students/:id` | Get student by ID |
| POST | `/api/students` | Create student |
| PUT | `/api/students/:id` | Update student |
| DELETE | `/api/students/:id` | Delete student |
| POST | `/api/students/bulk-upload` | Bulk create from Excel |
| PUT | `/api/students/bulk-edit` | Bulk update students |
| POST | `/api/students/promote` | Bulk promotion |

### Permission Keys

| Operation | Permission Key |
|-----------|----------------|
| View Students | `students.view` |
| Create Student | `students.create` |
| Edit Student | `students.edit` |
| Delete Student | `students.delete` |
| Bulk Operations | `students.bulk` |
| Promotion | `students.promotion` |
| View Dashboard | `students.dashboard.view` |

---

## Student Status Lifecycle

```
┌─────────┐     ┌────────┐     ┌────────┐
│ pending │ ──► │ active │ ──► │graduated│
└─────────┘     └────────┘     └────────┘
                    │
                    ▼
              ┌──────────┐
              │ inactive │
              └──────────┘
                    │
                    ▼
              ┌────────┐
              │ exited │
              └────────┘
```

### Status Descriptions

| Status | Description | System Access |
|--------|-------------|---------------|
| `pending` | Awaiting profile completion | Limited - profile only |
| `active` | Currently enrolled student | Full access per role |
| `inactive` | Temporarily inactive | No module access |
| `exited` | Left institution | Logged out by system |
| `graduated` | Completed program | Limited access |

---

## Data Categories

### Personal Information
- Name, date of birth, gender
- Contact details (mobile, email)
- Profile photo

### Family Information
- Father's details (name, occupation, mobile)
- Mother's details (name, occupation, mobile)
- Annual income

### Educational Background
- 10th marks (JSONB: max, obtained, percentage)
- 12th marks (JSONB: group, subjects, percentage)
- Board of study, last school
- Entrance scores (NEET, Engineering cutoff)

### Demographics
- Religion, community, caste
- Category, quota
- First graduate status

### Academic Enrollment
- Institution, degree, department, program
- Semester, section
- Academic year
- Register number, roll number
- Regulation, batch

### Campus Life
- Accommodation type (Day Scholar/Hosteller)
- Hostel type, food preference
- Bus requirement and route

### Address
- Street, taluk, district
- State, PIN code

---

## Business Rules

### Enrollment Rules
1. **Required Fields**: first_name, father_name, mother_name, date_of_birth, gender, religion, community, board_of_study, last_school, tenth_marks, twelfth_marks, entry_type
2. **Academic Assignment**: institution_id, degree_id, department_id, program_id required for active students
3. **Section Assignment**: semester_id and section_id required for timetable/attendance

### Status Rules
1. **Pending → Active**: Requires profile completion
2. **Active → Inactive**: Manual status change by admin
3. **Active → Graduated**: Completion of program
4. **Active → Exited**: Withdrawal from institution
5. **Status Restrictions**: Graduated/inactive students have limited module access

### Validation Rules
1. **College Email**: Must end with `@jkkn.ac.in`
2. **Phone Numbers**: Valid mobile format
3. **Marks**: Percentage between 0-100
4. **Date of Birth**: Must be in the past

---

## User Flows

### Flow 1: Create New Student (Manual)

```
1. Navigate to Students → Create New
2. Fill required fields:
   - Personal info (name, DOB, gender)
   - Family info (parents)
   - Educational background (10th, 12th marks)
   - Entry type (First Year/Lateral Entry)
3. Assign to academic structure:
   - Institution → Degree → Department → Program
   - Semester → Section
4. Set initial status: 'pending' or 'active'
5. Save student record
```

### Flow 2: Bulk Upload Students

```
1. Navigate to Students → Bulk Upload
2. Download Excel template
3. Fill template with student data
4. Upload Excel file
5. System validates and previews data
6. Confirm upload
7. View upload results (success/failed)
```

### Flow 3: Bulk Edit Students

```
1. Navigate to Students → Bulk Edit
2. Download current students Excel
3. Modify required fields in Excel
4. Upload modified Excel
5. System shows preview of changes
6. Review field-level changes
7. Confirm changes
8. View edit results
```

### Flow 4: Student Promotion

```
1. Navigate to Students → Promotion
2. Select source: Institution → Semester → Section
3. Select target: Semester → Section
4. View eligible students
5. Select students to promote
6. Confirm promotion
7. Students moved to new semester/section
```

---

## Sample Data Structure

### Complete Student Record

```json
{
  "id": "student-uuid",
  "admission_id": "admission-uuid",
  "application_id": "APP2024001",

  "first_name": "Rahul",
  "last_name": "Kumar",
  "date_of_birth": "2005-03-15",
  "gender": "Male",

  "father_name": "Suresh Kumar",
  "father_occupation": "Business",
  "father_mobile": "+91 9876543210",
  "mother_name": "Lakshmi Kumar",
  "mother_occupation": "Homemaker",
  "mother_mobile": "+91 9876543211",

  "religion": "Hindu",
  "community": "OBC",
  "caste": "Gounder",
  "annual_income": "500000",
  "first_graduate": false,
  "category": "OBC",
  "quota": "Management",

  "last_school": "ABC Higher Secondary School",
  "board_of_study": "State Board",
  "tenth_marks": {
    "max_marks": "500",
    "obtained_marks": "450",
    "percentage": "90"
  },
  "twelfth_marks": {
    "group": "Computer Science",
    "max_marks": "600",
    "obtained_marks": "540",
    "percentage": "90",
    "subjects": {
      "Physics": "95",
      "Chemistry": "88",
      "Maths": "98",
      "Computer Science": "95"
    }
  },
  "engineering_cutoff_marks": "195.5",

  "institution_id": "inst-uuid",
  "degree_id": "degree-uuid",
  "department_id": "dept-uuid",
  "program_id": "prog-uuid",
  "semester_id": "sem-uuid",
  "section_id": "sec-uuid",
  "academic_year_id": "ay-uuid",
  "register_number": "2024CSE001",
  "roll_number": "101",
  "entry_type": "FIRST YEAR",

  "permanent_address_street": "123, Main Street",
  "permanent_address_taluk": "Namakkal",
  "permanent_address_district": "Namakkal",
  "permanent_address_pin_code": "637001",
  "permanent_address_state": "Tamil Nadu",

  "student_mobile": "+91 9876543212",
  "student_email": "rahul.kumar@gmail.com",
  "college_email": "rahul.kumar@jkkn.ac.in",
  "student_photo_url": "https://storage.example.com/photos/rahul.jpg",

  "accommodation_type": "Hosteller",
  "hostel_type": "Boys Hostel A",
  "food_type": "Vegetarian",
  "bus_required": false,

  "status": "active",
  "is_profile_complete": true,

  "created_at": "2024-06-15T10:00:00Z",
  "updated_at": "2024-06-15T10:00:00Z",

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
  },
  "section": {
    "id": "sec-uuid",
    "section_name": "A"
  }
}
```

---

## Dashboard Analytics

### Available Metrics

| Metric | Description |
|--------|-------------|
| Total Students | Count of all student records |
| Active Students | Students with active status |
| Profile Completion | Percentage of complete profiles |
| Institution Distribution | Students per institution |
| Department Distribution | Students per department |
| Gender Distribution | Male/Female/Other ratio |
| Entry Type | First Year vs Lateral Entry |
| Accommodation | Day Scholar vs Hosteller |
| Geographic Distribution | Students by state/district |

---

## Files in This Module

| File | Description |
|------|-------------|
| [student-entity.md](./student-entity.md) | Complete student entity documentation |
| [student-flows.md](./student-flows.md) | User flow documentation |
| [promotion.md](./promotion.md) | Promotion feature documentation |

---

## Related Documentation

- **[Organizations Module](../organizations/README.md)** - Academic hierarchy
- **[Academic Module](../academic/README.md)** - Attendance and timetables
- **[Admissions Module](../admissions/README.md)** - Pre-enrollment workflow

---

## Service Location

- **Service**: `lib/services/student/student-service.ts` (2,800+ lines)
- **Hook**: `hooks/students/use-students.ts`
- **Types**: `types/student.ts`

---

*Last Updated: December 2024*
