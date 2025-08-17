# Database Structure Analysis Report
Generated: 2025-01-17

## Summary
The actual database structure differs significantly from the definitions in `01_tables.sql`. Many tables have different column names, missing columns, and extra columns that are not defined in the SQL file.

## Key Discrepancies by Table

### 1. PROFILES Table
**Database Columns:**
- phone_number (not phone)
- bio, gender, designation (extra columns)
- profile_completed (extra)
- last_login, is_super_admin (extra)
- institution_id (single UUID, not array)

**Missing from Database:**
- institution_ids (UUID array)
- metadata (JSONB)

**In SQL but different:**
- phone → phone_number in DB
- institution_ids UUID[] → institution_id UUID

### 2. INSTITUTIONS Table
**Database Columns:**
- counselling_code, category, accredited_by (extra)
- address_line1, address_line2, address_line3 (instead of single address)
- pin_code (not pincode)
- institution_type (extra)
- Multiple department JSONBs (transportation_dept, administration_dept, etc.)

**Missing from Database:**
- code (unique identifier)
- settings (JSONB)

### 3. DEPARTMENTS Table
**Database Columns:**
- degree_id (extra required field)
- department_code, department_name (not code, name)
- created_by (extra)

**Missing from Database:**
- description
- head_of_department

### 4. PROGRAMS Table
**Database Columns:**
- degree_id (extra)
- program_id, program_name (not code, name)
- created_by (extra)

**Missing from Database:**
- duration_years
- degree_type
- total_semesters

### 5. ACADEMIC_YEARS Table
**Database Columns:**
- academic_year_name (not name)

**Missing from Database:**
- status (enum)
- is_current

### 6. SEMESTERS Table
**Database Columns:**
- degree_id (extra required)
- semester_code, semester_name (extra)
- semester_type (extra required)

**Missing from Database:**
- semester_number
- start_date, end_date

### 7. COURSES Table
**Database Columns:**
- course_code, course_name (not code, name)

**Missing from Database:**
- department_id
- credits
- course_type
- description
- syllabus

### 8. SECTIONS Table
**Database Columns:**
- section_name (not name)
- degree_id (extra)
- Columns ordered differently

**Missing from Database:**
- capacity
- current_strength
- class_teacher

### 9. STUDENTS Table
**Major Differences:**
- Completely different structure
- Has admission-related fields (admission_id, application_id)
- Detailed parent information (father/mother occupation, mobile)
- Academic marks stored (tenth_marks, twelfth_marks as JSONB)
- Address as individual fields (not JSONB)
- Many admission-specific fields

**Missing from Database:**
- user_id reference
- admission_number (has application_id instead)
- blood_group (in staff table but not students)
- photo_url (has student_photo_url)
- documents, metadata as JSONB

### 10. STAFF Table
**Database Columns:**
- More detailed personal info (marital_status, blood_group, gender, date_of_birth)
- staff_id (not employee_id)
- category_id (extra required)
- institution_email (extra required)
- profile_picture (not photo_url)
- Address as text fields (not JSONB)

**Missing from Database:**
- qualification
- specialization
- employment_type
- salary_info
- documents, metadata

### 11. STUDENT_ATTENDANCE Table
- Structure matches but column order is different

### 12. BILLING Tables
**Major Difference:**
- Database has: billing_invoices, billing_receipts (different structure)
- SQL file has: student_bills, billing_receipts

**billing_invoices (DB) vs student_bills (SQL):**
- Different column names and structure
- invoice_number vs bill_number
- No balance_amount calculation
- Different payment tracking approach

### 13. PERIODS Table
**Database Columns:**
- period_name (not name)
- is_break (not period_type)

**Missing from Database:**
- order_number
- is_active

### 14. TIMETABLES Table
**Complete Restructure:**
- Database uses JSONB for timetable_data and periods
- Has academic_year_id, degree_id references
- Stores semester/section as text
- Has versioning and template support
- Uses flexible date/day selection

**SQL file structure (simpler):**
- Direct section_id reference
- day_of_week integer
- period_id reference
- course_id, staff_id direct references
- room_number

## Tables in Database but NOT in SQL file:
1. admissions
2. api_keys
3. applications
4. billing_discounts
5. billing_invoice_items
6. billing_item_categories
7. billing_parent_categories
8. billing_receipt_items
9. billing_refunds
10. billing_student_bills
11. billing_sub_categories
12. bug_report_messages
13. bug_report_participants
14. bug_reports
15. categories
16. course_mappings
17. custom_roles
18. dashboard_configurations
19. dashboard_widget_types
20. dashboard_widgets
21. degrees (referenced by many tables!)
22. employment_categories
23. notifications
24. push_subscriptions
25. resource_* tables (5 tables)
26. staff_plan_courses
27. staff_plans
28. subcategories
29. user_activity_logs
30. user_institution_access
31. user_notifications

## Critical Issues:

### 1. Foreign Key Dependencies
- Many tables reference `degrees` table which doesn't exist in SQL file
- departments, programs, semesters, sections all require degree_id

### 2. Column Name Mismatches
- Almost every table has different column naming conventions
- program_name vs name, course_code vs code, etc.

### 3. Data Type Differences
- VARCHAR vs TEXT usage inconsistent
- JSONB fields in different places
- Some required fields in DB are optional in SQL

### 4. Missing Core Tables
- degrees table (critical for hierarchy)
- user_institution_access (for multi-tenancy)
- billing structure completely different

## Recommendations:

1. **DO NOT USE current 01_tables.sql** - It will break the existing database
2. Need to reverse-engineer exact structure from database
3. Create proper migrations to match existing structure
4. Document the actual relationships and dependencies
5. The degrees table is critical and must be added
6. Billing module uses different table structure than defined
7. Timetables use JSONB structure, not normalized tables