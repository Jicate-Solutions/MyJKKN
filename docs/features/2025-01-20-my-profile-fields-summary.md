# My Profile Page - Fields Summary

**Created:** 2025-01-20
**Purpose:** Complete list of all fields visible in the student My Profile page

---

## 📋 Field Categories Overview

The My Profile page displays student information organized into **7 main sections**:

1. **Profile Header** - Avatar and key identifiers
2. **Personal Information** - Basic demographic details
3. **Academic Information** - Educational and enrollment details
4. **Contact Details** - Student and family contact information
5. **Address Information** - Permanent residential address
6. **Counseling & Quota** - Admission and scholarship information
7. **Accommodation Details** - Hostel and transport preferences
8. **Previous Academic Qualifications** - 10th, 12th, and competitive exam details

---

## 1️⃣ Profile Header

### Avatar Section
| Field | Database Column | Editable | Display Location |
|-------|----------------|----------|------------------|
| Student Photo | `student_photo_url` | ❌ No | Circular avatar (80x80px) |
| Default Avatar | N/A | ❌ No | User icon if no photo |

### Header Information
| Field | Database Column | Editable | Display Type |
|-------|----------------|----------|--------------|
| Full Name | `first_name` + `last_name` | ❌ No | H2 heading (2xl/3xl) |
| Application ID | `application_id` | ❌ No | Outline badge |
| Roll Number | `roll_number` | ❌ No | Secondary badge |
| Register Number | `register_number` | ❌ No | Secondary badge |
| Status | `lifecycle_status` | ❌ No | Status badge (color-coded) |
| Department • Program | `department_name` • `program_name` | ❌ No | Subtitle text |

---

## 2️⃣ Personal Information (Blue Card)

### Basic Details
| Field Label | Database Column | Editable | Icon | Validation |
|------------|----------------|----------|------|------------|
| First Name | `first_name` | ✅ Yes | User | Required, text |
| Last Name | `last_name` | ✅ Yes | User | Optional, text |
| Date of Birth | `date_of_birth` | ❌ No | Calendar | Date format |
| Gender | `gender` | ❌ No | User | Male/Female/Other |
| Blood Group | `blood_group` | ✅ Yes | Shield | A+, B+, O+, AB+, etc. |

### Demographics
| Field Label | Database Column | Editable | Icon | Notes |
|------------|----------------|----------|------|-------|
| Religion | `religion` | ✅ Yes | BookOpen | Text field |
| Community | `community` | ✅ Yes | Users | Text field |
| Caste | `caste` | ✅ Yes | Users | Optional |
| Aadhar Number | `aadhar_number` | ❌ No | Shield | Masked (XXXX-XXXX-1234) |

**Total Fields:** 9 (4 editable)

---

## 3️⃣ Academic Information (Purple Card)

### Institution Details
| Field Label | Database Column | Editable | Icon | Source |
|------------|----------------|----------|------|--------|
| Institution | `institution_id` → `institutions.name` | ❌ No | Building | Join query |
| Degree | `degree_id` → `degrees.display_name` or `degree_name` | ❌ No | GraduationCap | Join query |
| Department | `department_id` → `departments.department_name` | ❌ No | BookOpen | Join query |
| Program | `program_id` → `programs.program_name` | ❌ No | BookOpen | Join query |

### Current Enrollment
| Field Label | Database Column | Editable | Icon | Source |
|------------|----------------|----------|------|--------|
| Semester | `semester_id` → `semesters.semester_name` | ❌ No | Calendar | Join query |
| Section | `section_id` → `sections.section_name` | ❌ No | Users | Join query |
| Academic Year | `academic_year_id` → `academic_years.academic_year_name` | ❌ No | Calendar | Join query |
| Admission Year | `admission_year` | ❌ No | Calendar | Integer year |

### Student Identifiers
| Field Label | Database Column | Editable | Icon | Notes |
|------------|----------------|----------|------|-------|
| Roll Number | `roll_number` | ❌ No | FileText | Unique identifier |
| Register Number | `register_number` | ❌ No | FileText | University reg no |
| College Email | `college_email` | ❌ No | Mail | Auto-generated |

### Administrative Details
| Field Label | Database Column | Editable | Icon | Source |
|------------|----------------|----------|------|--------|
| Entry Type | `entry_type` | ❌ No | ClipboardList | Regular/Lateral |
| Regulation | `regulation_id` → `regulations.regulation_year` or `regulation_code` | ❌ No | BookOpen | Join query |
| Batch | `batch_id` → `batches.batch_name` | ❌ No | Users | Join query |

**Total Fields:** 14 (0 editable - all read-only)

---

## 4️⃣ Contact Details (Green Card)

### Student Contact
| Field Label | Database Column | Editable | Icon | Validation |
|------------|----------------|----------|------|------------|
| Mobile | `student_mobile` | ✅ Yes | Phone | 10-digit Indian format |
| Email | `student_email` | ✅ Yes | Mail | Email format |

### Father's Details
| Field Label | Database Column | Editable | Icon | Validation |
|------------|----------------|----------|------|------------|
| Name | `father_name` | ✅ Yes | User | Required, text |
| Mobile | `father_mobile` | ✅ Yes | Phone | 10-digit Indian format |
| Occupation | `father_occupation` | ✅ Yes | FileText | Optional, text |

### Mother's Details
| Field Label | Database Column | Editable | Icon | Validation |
|------------|----------------|----------|------|------------|
| Name | `mother_name` | ✅ Yes | User | Required, text |
| Mobile | `mother_mobile` | ✅ Yes | Phone | 10-digit Indian format |
| Occupation | `mother_occupation` | ✅ Yes | FileText | Optional, text |

### Guardian Details (Optional - if provided)
| Field Label | Database Column | Editable | Icon | Validation |
|------------|----------------|----------|------|------------|
| Name | `guardian_name` | ✅ Yes | User | Optional, text |
| Mobile | `guardian_mobile` | ✅ Yes | Phone | 10-digit Indian format |
| Occupation | `guardian_occupation` | ✅ Yes | FileText | Optional, text |

### Financial Information
| Field Label | Database Column | Editable | Icon | Validation |
|------------|----------------|----------|------|------------|
| Annual Income | `annual_income` | ✅ Yes | FileText | Optional, text/number |

**Total Fields:** 13 (13 editable)

---

## 5️⃣ Address Information (Orange Card)

### Permanent Address
| Field Label | Database Column | Editable | Icon | Validation |
|------------|----------------|----------|------|------------|
| Address | `permanent_address_street` | ✅ Yes | Home | Required, text |
| District | `permanent_address_district` | ✅ Yes | MapPin | Required, text |
| State | `permanent_address_state` | ✅ Yes | MapPin | Required, text |
| PIN Code | `permanent_address_pin_code` | ✅ Yes | MapPin | 6-digit format |

### Present Address (Currently Not Shown)
| Field Label | Database Column | Editable | Status |
|------------|----------------|----------|--------|
| Address | `present_address_street` | ✅ Yes | Hidden (no data) |
| District | `present_address_district` | ✅ Yes | Hidden (no data) |
| State | `present_address_state` | ✅ Yes | Hidden (no data) |
| PIN Code | `present_address_pin_code` | ✅ Yes | Hidden (no data) |

**Total Fields:** 4 visible (4 editable)

---

## 6️⃣ Counseling & Quota (Indigo Card)

### Admission Information
| Field Label | Database Column | Editable | Icon | Display Format |
|------------|----------------|----------|------|----------------|
| Counseling Applied | `counseling_applied` | ❌ No | ClipboardList | Yes/No (boolean) |
| Counseling Number | `counseling_number` | ❌ No | FileText | Text |
| Quota | `quota` | ❌ No | Award | Text |
| Category | `category` | ❌ No | Users | Text |
| Scholarship Type | `scholarship_type` | ❌ No | Award | Text |

### Reference Information
| Field Label | Database Column | Editable | Icon | Notes |
|------------|----------------|----------|------|-------|
| Reference Type | `reference_type` | ✅ Yes | Users | Optional |
| Reference Name | `reference_name` | ✅ Yes | User | Optional |
| Reference Contact | `reference_contact` | ✅ Yes | Phone | Optional |

**Total Fields:** 8 (3 editable)

---

## 7️⃣ Accommodation Details (Rose Card)

### Hostel Information
| Field Label | Database Column | Editable | Icon | Display Format |
|------------|----------------|----------|------|----------------|
| Accommodation Type | `accommodation_type` | ✅ Yes | Home | Day Scholar/Hostel |
| Hostel Type | `hostel_type` | ✅ Yes | Bed | Boys/Girls/NA |
| Food Type | `food_type` | ✅ Yes | FileText | Veg/Non-Veg |

### Transport Information
| Field Label | Database Column | Editable | Icon | Display Format |
|------------|----------------|----------|------|----------------|
| Bus Required | `bus_required` | ✅ Yes | Bus | Yes/No (boolean) |
| Bus Route | `bus_route` | ✅ Yes | Bus | Text |
| Bus Pickup Location | `bus_pickup_location` | ✅ Yes | MapPin | Text |

**Total Fields:** 6 (6 editable)

---

## 8️⃣ Previous Academic Qualifications (Cyan Card - Full Width)

### 10th Standard
| Field Label | Database Column | Editable | Icon | Format |
|------------|----------------|----------|------|--------|
| Last School | `last_school` | ❌ No | School | Text |
| Board of Study | `board_of_study` | ❌ No | BookOpen | Text |
| 10th Marks | `tenth_marks` | ❌ No | Award | JSONB (formatted) |

### 12th Standard
| Field Label | Database Column | Editable | Icon | Format |
|------------|----------------|----------|------|--------|
| 12th Marks | `twelfth_marks` | ❌ No | Award | JSONB (formatted) |
| Medical Cutoff | `medical_cutoff_marks` | ❌ No | FileText | Text/Number |
| Engineering Cutoff | `engineering_cutoff_marks` | ❌ No | FileText | Text/Number |

### Competitive Exams
| Field Label | Database Column | Editable | Icon | Format |
|------------|----------------|----------|------|--------|
| NEET Roll Number | `neet_roll_number` | ❌ No | FileText | Text |
| NEET Score | `neet_score` | ❌ No | Award | Text/Number |

**Total Fields:** 8 (0 editable - all read-only)

---

## 📊 Summary Statistics

### Field Count by Section
| Section | Total Fields | Editable | Read-Only | Percentage Editable |
|---------|-------------|----------|-----------|---------------------|
| Profile Header | 6 | 0 | 6 | 0% |
| Personal Information | 9 | 4 | 5 | 44% |
| Academic Information | 14 | 0 | 14 | 0% |
| Contact Details | 13 | 13 | 0 | 100% |
| Address Information | 4 | 4 | 0 | 100% |
| Counseling & Quota | 8 | 3 | 5 | 38% |
| Accommodation Details | 6 | 6 | 0 | 100% |
| Academic Qualifications | 8 | 0 | 8 | 0% |
| **TOTAL** | **68** | **30** | **38** | **44%** |

### Editable Fields Breakdown (30 fields)

#### Personal (4 fields)
- First Name, Last Name, Blood Group, Religion, Community, Caste

#### Contact (13 fields)
- Student Mobile, Student Email
- Father Name/Mobile/Occupation
- Mother Name/Mobile/Occupation
- Guardian Name/Mobile/Occupation (optional)
- Annual Income

#### Address (4 fields)
- Permanent Address, District, State, PIN Code

#### Counseling (3 fields)
- Reference Type, Reference Name, Reference Contact

#### Accommodation (6 fields)
- Accommodation Type, Hostel Type, Food Type
- Bus Required, Bus Route, Bus Pickup Location

### Read-Only Fields Breakdown (38 fields)

#### Header (6 fields)
- Photo, Name, Application ID, Roll No, Register No, Status, Department/Program

#### Personal (5 fields)
- Date of Birth, Gender, Aadhar Number

#### Academic (14 fields)
- Institution, Degree, Department, Program
- Semester, Section, Academic Year, Admission Year
- Roll Number, Register Number, College Email
- Entry Type, Regulation, Batch

#### Counseling (5 fields)
- Counseling Applied, Counseling Number, Quota, Category, Scholarship Type

#### Academic Qualifications (8 fields)
- Last School, Board of Study, 10th Marks, 12th Marks
- Medical Cutoff, Engineering Cutoff, NEET Roll Number, NEET Score

---

## 🎨 Visual Design Features

### Card Colors & Icons
| Section | Background Color | Icon Color | Icon |
|---------|-----------------|------------|------|
| Personal | Blue (`bg-blue-50`) | Blue 600 | User |
| Academic | Purple (`bg-purple-50`) | Purple 600 | GraduationCap |
| Contact | Green (`bg-green-50`) | Green 600 | Phone |
| Address | Orange (`bg-orange-50`) | Orange 600 | MapPin |
| Counseling | Indigo (`bg-indigo-50`) | Indigo 600 | ClipboardList |
| Accommodation | Rose (`bg-rose-50`) | Rose 600 | Bed |
| Qualifications | Cyan (`bg-cyan-50`) | Cyan 600 | School |

### Responsive Layout
- **Mobile** (< 768px): Single column, full-width cards
- **Tablet** (768px - 1024px): 1-2 column layout
- **Desktop** (> 1024px): 2-column grid for most cards
- **Full Width:** Academic Qualifications card spans both columns

---

## 🔒 Field Edit Permissions

### Edit Workflow
1. Student clicks **"Edit Profile"** button
2. System checks for pending change requests
3. If no pending request exists:
   - Edit form opens with only editable fields
   - Student can modify personal, contact, address, and accommodation fields
   - Changes are submitted as a change request
4. If pending request exists:
   - Edit button is disabled
   - Banner shows pending status
   - Side-by-side comparison of current vs requested changes

### Field Categories by Edit Permission

#### ✅ Always Editable (30 fields)
Personal details, contact information, address, accommodation preferences

#### ❌ Never Editable (38 fields)
Academic information, student identifiers, admission details, previous qualifications

#### 🔐 Admin-Only Editable (via learners management)
Photo URL, Academic Year, Regulation, Batch, Roll Number, Register Number, etc.

---

## 📝 Data Formatting

### Special Formats
| Field Type | Format | Example |
|-----------|--------|---------|
| Aadhar Number | Masked | `XXXX-XXXX-1234` |
| Date | Formatted | `Jan 15, 2005` |
| Boolean | Yes/No | `Yes` / `No` |
| JSONB Marks | Key-Value | `Tamil: 95, English: 92` |
| Not Provided | Italicized | _Not provided_ |

### JSON Fields (JSONB)
- **10th Marks:** `{"Tamil": 95, "English": 92, "Maths": 98, ...}`
- **12th Marks:** `{"Physics": 95, "Chemistry": 92, "Maths": 98, ...}`
- Format: Comma-separated key-value pairs

---

## 🔄 Change Request Workflow

### Editable Field Submission
1. Student modifies editable fields
2. System detects changes and shows preview
3. Student submits change request
4. Request goes to HOD/Staff for approval
5. Upon approval, changes reflect in profile
6. Upon rejection, student sees feedback and can resubmit

### Status Indicators
- **Pending:** Yellow badge, awaiting approval
- **Approved:** Green badge, changes applied
- **Rejected:** Red badge, feedback provided
- **Cancelled:** Gray badge, request withdrawn

---

## 🎯 Next Steps for Field Management

### Future Enhancements
1. Add present address fields to edit form
2. Allow profile photo upload/update
3. Add document attachments (10th/12th certificates, Aadhar, etc.)
4. Enable guardian details editing
5. Add emergency contact section
6. Allow students to update qualification documents

### Recommended Validations
- Phone: 10-digit Indian format (`^[6-9]\d{9}$`)
- Email: Standard email validation
- PIN Code: 6-digit format (`^\d{6}$`)
- Blood Group: Enum validation (A+, B+, O+, AB+, A-, B-, O-, AB-)
- Annual Income: Numeric with commas

---

**Document Version:** 1.0
**Last Updated:** 2025-01-20
**Maintained By:** Development Team
