# MyJKKN Database Schema Documentation

This directory contains the database migration files for the MyJKKN application, focusing on the Admission Management, Students, and Academic modules.

## Migration Files Overview

### 001_create_custom_types.sql
Creates all custom enum types used across the application:
- `student_status`: Tracks student enrollment status (active, inactive, exited, graduated, pending)
- `user_role`: Defines user roles for access control
- `approval_status`: For various approval workflows
- Other utility enums for the application

### 002_create_helper_functions.sql
Contains all helper functions used by triggers and policies:
- `handle_updated_at()`: Automatically updates timestamp
- `user_has_institution_access()`: Checks user access to institutions
- `generate_institution_application_id()`: Generates unique application IDs
- Auto-population functions for institution IDs
- Validation functions for data consistency

### 003_create_academic_tables.sql
Creates the core academic structure:
- **academic_years**: Academic year definitions per institution
- **degrees**: Degree programs (BE, ME, BSc, etc.)
- **departments**: Academic departments under degrees
- **programs**: Specific programs under departments
- **semesters**: Semester definitions for programs
- **sections**: Class sections within semesters
- **courses**: Course catalog for the institution

### 004_create_admission_tables.sql
Handles admission management:
- **applications**: General application configuration table
- **admissions**: Student admission records with all details

### 005_create_students_table.sql
The main students table containing:
- Personal information
- Academic information
- Contact details
- Address information
- Academic placement (program, semester, section)
- Profile completion tracking

### 006_create_rls_policies.sql
Row Level Security policies ensuring:
- Super admins have full access
- Administrators can manage their institutions
- Faculty can manage their institution data
- Students can view their own information
- Proper data isolation between institutions

### 007_create_attendance_table.sql
Student attendance tracking:
- Daily attendance records
- Links to students, courses, sections
- Supports multiple attendance statuses
- Audit trail for attendance marking

### 008_create_course_mappings.sql
Maps courses to academic structure:
- Links courses to programs and semesters
- Assigns faculty to course sections
- Tracks credits and course types
- Manages elective courses

### 009_sample_data.sql (Optional)
Sample data for testing - DO NOT run in production

## Database Relationships

### Academic Hierarchy
```
Institution
    ├── Academic Years
    ├── Degrees
    │   └── Departments
    │       └── Programs
    │           └── Semesters
    │               └── Sections
    └── Courses
```

### Student Flow
```
Admission → Student → Program/Semester/Section → Attendance
```

## Key Features

1. **Multi-tenant Architecture**: All tables include institution_id for data isolation
2. **Automatic Institution Assignment**: Triggers auto-populate institution_id based on user profile
3. **Hierarchical Validation**: Ensures students can only be assigned to valid program/semester combinations
4. **Comprehensive Audit Trail**: Created/updated timestamps and user tracking
5. **Flexible Course Management**: Supports theory, practical, elective courses with credit system

## Setup Instructions

1. Ensure you have the required PostgreSQL extensions:
   - uuid-ossp
   - moddatetime

2. Run migrations in order:
   ```sql
   -- Run each file in sequence
   \i 001_create_custom_types.sql
   \i 002_create_helper_functions.sql
   \i 003_create_academic_tables.sql
   \i 004_create_admission_tables.sql
   \i 005_create_students_table.sql
   \i 006_create_rls_policies.sql
   \i 007_create_attendance_table.sql
   \i 008_create_course_mappings.sql
   -- Only for testing:
   \i 009_sample_data.sql
   ```

3. Verify RLS is enabled:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';
   ```

## Prerequisites

Before running these migrations, ensure you have:
1. **profiles** table with user management
2. **institutions** table for multi-tenancy
3. **staff** table for faculty/staff records
4. **user_institution_access** table for access control

## Security Considerations

- All tables have Row Level Security enabled
- Access is controlled through user roles and institution membership
- Sensitive operations require administrator or super_admin roles
- Faculty have limited access to their institution data only

## Performance Optimization

The schema includes:
- Strategic indexes on foreign keys and frequently queried columns
- Composite indexes for complex queries
- Partial indexes where applicable
- Efficient UUID generation using gen_random_uuid()

## Future Enhancements

Consider adding:
- Timetable management tables
- Grade/marks management
- Fee management integration
- Library management integration
- Hostel management integration