# Student Entity - Complete Field Reference

> 80+ field documentation for student records

---

## Overview

The `students` table stores comprehensive student profile data including personal information, family details, educational background, enrollment data, and campus preferences.

### Table Name
`public.students`

---

## Data Model

### Section 1: Identity & Personal Information

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `admission_id` | UUID | No | - | Link to admission record |
| `application_id` | TEXT | No | - | Human-readable application ID (e.g., "APP2024001") |
| `first_name` | TEXT | Yes | - | Student's first name |
| `last_name` | TEXT | No | - | Student's last name |
| `date_of_birth` | TEXT | Yes | - | Date of birth (YYYY-MM-DD format) |
| `gender` | TEXT | Yes | - | Male/Female/Other |
| `student_photo_url` | TEXT | No | - | Profile photo URL |

### Section 2: Contact Information

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `student_mobile` | TEXT | Yes | - | Student's mobile number |
| `student_email` | TEXT | Yes | - | Personal email address |
| `college_email` | TEXT | No | - | Institutional email (@jkkn.ac.in) |

### Section 3: Family Information

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `father_name` | TEXT | Yes | - | Father's full name |
| `father_occupation` | TEXT | No | - | Father's occupation |
| `father_mobile` | TEXT | No | - | Father's mobile number |
| `mother_name` | TEXT | Yes | - | Mother's full name |
| `mother_occupation` | TEXT | No | - | Mother's occupation |
| `mother_mobile` | TEXT | Yes | - | Mother's mobile number |

### Section 4: Demographics

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `religion` | TEXT | Yes | - | Religion (Hindu, Muslim, Christian, etc.) |
| `community` | TEXT | Yes | - | Community (OC, BC, MBC, SC, ST) |
| `caste` | TEXT | No | - | Specific caste |
| `annual_income` | TEXT | No | - | Family annual income |
| `first_graduate` | BOOLEAN | No | `false` | First graduate in family |
| `category` | TEXT | No | - | Reservation category |
| `quota` | TEXT | No | - | Admission quota (Management, Government) |
| `aadhar_number` | TEXT | No | - | Aadhaar ID number |

### Section 5: Educational Background

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `last_school` | TEXT | Yes | - | Previous school/college name |
| `board_of_study` | TEXT | Yes | - | Board (State Board, CBSE, ICSE) |
| `tenth_marks` | JSONB | Yes | - | 10th standard marks |
| `twelfth_marks` | JSONB | Yes | - | 12th standard marks |
| `medical_cutoff_marks` | TEXT | No | - | Medical entrance cutoff |
| `engineering_cutoff_marks` | TEXT | No | - | Engineering entrance cutoff |
| `neet_roll_number` | TEXT | No | - | NEET roll number |
| `neet_score` | TEXT | No | - | NEET score |

### Section 6: Counseling Information

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `counseling_applied` | BOOLEAN | No | `false` | Applied for government counseling |
| `counseling_number` | TEXT | No | - | Government counseling number |

### Section 7: Academic Enrollment

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `institution_id` | UUID | No | - | Enrolled institution |
| `degree_id` | UUID | No | - | Degree level (UG/PG) |
| `department_id` | UUID | No | - | Academic department |
| `program_id` | UUID | No | - | Enrolled program |
| `semester_id` | UUID | No | - | Current semester |
| `section_id` | UUID | No | - | Assigned section |
| `academic_year_id` | UUID | No | - | Academic year |
| `register_number` | TEXT | No | - | University register number |
| `roll_number` | TEXT | No | - | Class roll number |
| `entry_type` | TEXT | Yes | - | FIRST YEAR / LATERAL ENTRY |
| `regulation_id` | UUID | No | - | Academic regulation |
| `batch_id` | UUID | No | - | Student batch/cohort |

### Section 8: Address Information

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `permanent_address_street` | TEXT | Yes | - | Street address |
| `permanent_address_taluk` | TEXT | No | - | Taluk/Township |
| `permanent_address_district` | TEXT | Yes | - | District |
| `permanent_address_pin_code` | TEXT | Yes | - | PIN/ZIP code |
| `permanent_address_state` | TEXT | Yes | - | State |

### Section 9: Campus Life

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `accommodation_type` | TEXT | Yes | - | Day Scholar / Hosteller |
| `hostel_type` | TEXT | No | - | Hostel block name |
| `food_type` | TEXT | No | - | Vegetarian / Non-Vegetarian |
| `bus_required` | BOOLEAN | No | `false` | Needs bus facility |
| `bus_route` | TEXT | No | - | Bus route name |
| `bus_pickup_location` | TEXT | No | - | Pickup point |

### Section 10: Reference Information

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `reference_type` | TEXT | No | - | Type of reference (Alumni, Staff, etc.) |
| `reference_name` | TEXT | No | - | Reference person name |
| `reference_contact` | TEXT | No | - | Reference contact number |

### Section 11: Status & Metadata

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `status` | student_status | Yes | - | active/inactive/pending/exited/graduated |
| `is_profile_complete` | BOOLEAN | Yes | `false` | Profile completion flag |
| `created_at` | TIMESTAMPTZ | No | `now()` | Record creation time |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update time |
| `created_by` | UUID | No | - | Creator user ID |
| `updated_by` | UUID | No | - | Last updater user ID |

---

## JSONB Field Structures

### tenth_marks

```json
{
  "max_marks": "500",
  "obtained_marks": "450",
  "percentage": "90.00"
}
```

### twelfth_marks

```json
{
  "group": "Computer Science",
  "max_marks": "600",
  "obtained_marks": "540",
  "percentage": "90.00",
  "subjects": {
    "Physics": "95",
    "Chemistry": "88",
    "Mathematics": "98",
    "Computer Science": "95",
    "English": "85",
    "Tamil": "79"
  }
}
```

---

## Enum Values

### student_status

| Value | Description | System Behavior |
|-------|-------------|-----------------|
| `pending` | Awaiting completion | Profile access only |
| `active` | Currently enrolled | Full module access |
| `inactive` | Temporarily inactive | No module access |
| `exited` | Left institution | Auto logout |
| `graduated` | Completed program | Limited access |

### entry_type

| Value | Description |
|-------|-------------|
| `FIRST YEAR` | Regular first-year admission |
| `LATERAL ENTRY` | Direct entry to higher semester |

### accommodation_type

| Value | Description |
|-------|-------------|
| `Day Scholar` | Non-resident student |
| `Hosteller` | Resident student |

### community

| Value | Description |
|-------|-------------|
| `OC` | Open Category |
| `BC` | Backward Class |
| `MBC` | Most Backward Class |
| `SC` | Scheduled Caste |
| `ST` | Scheduled Tribe |

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `admissions` | `admission_id` | Many-to-One |
| `institutions` | `institution_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |
| `programs` | `program_id` | Many-to-One |
| `semesters` | `semester_id` | Many-to-One |
| `sections` | `section_id` | Many-to-One |
| `academic_years` | `academic_year_id` | Many-to-One |
| `regulations` | `regulation_id` | Many-to-One |
| `batches` | `batch_id` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |
| `profiles` | `updated_by` | Many-to-One |

### Referenced By

| Table | Foreign Key | Description |
|-------|-------------|-------------|
| `student_attendance` | `attendance_data.students[].student_id` | Attendance records |
| `billing_student_bills` | `student_id` | Student bills |
| `billing_invoices` | `student_id` | Invoices |
| `billing_receipts` | `student_id` | Payment receipts |
| `billing_refunds` | linked via receipt | Refunds |

---

## TypeScript Interface

```typescript
export interface Student {
  id: string;
  admission_id: string;
  application_id?: string;

  // Personal
  first_name: string;
  last_name?: string;
  date_of_birth: string;
  gender: string;
  student_photo_url?: string;

  // Contact
  student_mobile: string;
  student_email: string;
  college_email?: string;

  // Family
  father_name: string;
  father_occupation: string;
  father_mobile: string;
  mother_name: string;
  mother_occupation: string;
  mother_mobile: string;

  // Demographics
  religion: string;
  community: string;
  caste: string;
  annual_income: string;
  first_graduate: boolean;
  category?: string;
  quota?: string;
  aadhar_number?: string;

  // Education
  last_school: string;
  board_of_study: string;
  tenth_marks: {
    max_marks: string;
    obtained_marks: string;
    percentage: string;
  };
  twelfth_marks: {
    group: string;
    max_marks: string;
    obtained_marks: string;
    percentage: string;
    subjects: Record<string, string>;
  };
  medical_cutoff_marks?: string;
  engineering_cutoff_marks?: string;
  neet_roll_number?: string;
  neet_score?: string;

  // Counseling
  counseling_applied: boolean;
  counseling_number?: string;

  // Academic
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  register_number?: string;
  roll_number?: string;
  entry_type: string;
  regulation_id?: string;
  batch_id?: string;

  // Address
  permanent_address_street: string;
  permanent_address_taluk?: string;
  permanent_address_district: string;
  permanent_address_pin_code: string;
  permanent_address_state: string;

  // Campus
  accommodation_type: string;
  hostel_type?: string;
  food_type?: string;
  bus_required?: boolean;
  bus_route?: string;
  bus_pickup_location?: string;

  // Reference
  reference_type?: string;
  reference_name?: string;
  reference_contact?: string;

  // Status
  status: 'active' | 'inactive' | 'pending' | 'exited' | 'graduated';
  is_profile_complete: boolean;

  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Joined data
  institution?: { id: string; name: string; };
  degree?: { id: string; degree_name: string; };
  department?: { id: string; department_name: string; };
  program?: { id: string; program_name: string; };
  semester?: { id: string; semester_name: string; semester_code: string; };
  section?: { id: string; section_name: string; };
  academic_year?: { id: string; academic_year_name: string; };
  regulation?: { id: string; regulation_code: string; };
  batch?: { id: string; batch_name: string; };
}
```

---

## API Query Parameters

### StudentFilters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name, roll number, register number |
| `institution` | UUID | Filter by institution |
| `degree` | UUID | Filter by degree |
| `department` | UUID | Filter by department |
| `program` | UUID | Filter by program |
| `semester` | UUID | Filter by semester |
| `section` | UUID | Filter by section |
| `academic_year` | UUID | Filter by academic year |
| `gender` | string | Filter by gender |
| `entry_type` | string | Filter by entry type |
| `accommodation_type` | string | Filter by accommodation |
| `status` | string | Filter by status |
| `is_profile_complete` | boolean | Filter by profile completion |
| `page` | number | Page number |
| `limit` | number | Items per page |
| `sortBy` | string | Sort field |
| `sortOrder` | asc/desc | Sort direction |

---

## Validation Rules

### Required Fields
- `first_name`: Min 2 characters
- `father_name`: Min 2 characters
- `mother_name`: Min 2 characters
- `date_of_birth`: Valid date in past
- `gender`: Required
- `religion`, `community`: Required
- `board_of_study`, `last_school`: Required
- `tenth_marks`, `twelfth_marks`: Required JSONB
- `entry_type`: Required

### Format Validations
- `college_email`: Must end with `@jkkn.ac.in`
- `student_email`: Valid email format
- `student_mobile`: Valid phone format
- Marks percentage: 0-100 range

---

## Service Location

- **Service**: `lib/services/student/student-service.ts`
- **Hook**: `hooks/students/use-students.ts`
- **Types**: `types/student.ts`

---

*Last Updated: December 2024*
