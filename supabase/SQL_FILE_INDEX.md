# Supabase SQL File Index

## ⚠️ IMPORTANT: SINGLE SOURCE OF TRUTH
**This is the ONLY place to track all SQL files. DO NOT create duplicate SQL files.**

## 📁 Directory Structure
```
supabase/
├── setup/              # Initial setup files (RUN IN ORDER)
│   ├── 00_master_setup.sql    # Extensions, types, helper functions
│   ├── 01_tables.sql           # ALL table definitions
│   ├── 02_functions.sql        # Custom functions and procedures
│   ├── 03_policies.sql         # RLS policies for all tables
│   ├── 04_triggers.sql         # Database triggers
│   ├── 05_views.sql            # Database views
│   └── 06_seed_data.sql        # Optional seed data
├── migrations/         # Version-controlled migrations (DO NOT EDIT OLD FILES)
├── tables/            # Individual table references (READ-ONLY)
├── functions/         # Individual function references (READ-ONLY)
├── policies/          # Individual policy references (READ-ONLY)
├── triggers/          # Individual trigger references (READ-ONLY)
└── views/            # Individual view references (READ-ONLY)
```

## 🔴 STRICT RULES

### Rule 1: NEVER Create Duplicate Files
- ❌ DO NOT create new files for existing objects
- ✅ UPDATE existing files with proper comments

### Rule 2: File Update Protocol
When updating any SQL file:
```sql
-- Updated: 2025-01-16 by [reason]
-- Previous version backed up as comments below
-- [Your changes here]
```

### Rule 3: Single Location Policy
- Tables: ONLY in `setup/01_tables.sql`
- Functions: ONLY in `setup/02_functions.sql`
- Policies: ONLY in `setup/03_policies.sql`
- Triggers: ONLY in `setup/04_triggers.sql`
- Views: ONLY in `setup/05_views.sql`

## 📊 Current Database Objects

### Tables (56 total in database, 19 in setup file)
| Module | Tables | Count | Status |
|--------|--------|-------|--------|
| Academic | academic_years, degrees, departments, programs, semesters, sections, courses, course_mappings | 8 | ✅ |
| Billing | billing_student_bills, billing_receipts, billing_invoices, billing_invoice_items, billing_receipt_items, billing_discounts, billing_refunds, billing_parent_categories, billing_sub_categories, billing_item_categories | 10 | ✅ |
| Students | students | 1 | ✅ |
| Staff | staff, staff_plans, staff_plan_courses | 3 | ✅ |
| Admission | admissions | 1 | ✅ |
| Attendance | periods, student_attendance | 2 | ✅ |
| Timetable | timetables, timetable_slot_continuity | 2 | ⚠️ Missing continuity table |
| Resources | resources, resource_reservations, resource_approvals, resource_usage_logs, resource_parent_categories, resource_sub_categories, resource_attribute_definitions | 7 | ✅ |
| Bug Reports | bug_reports, bug_report_messages, bug_report_participants | 3 | ✅ |
| Notifications | notifications, user_notifications, push_subscriptions | 3 | ✅ |
| API | api_keys | 1 | ✅ |
| User Management | profiles, users, user_institution_access, custom_roles | 4 | ✅ |
| Dashboard | dashboard_configurations, dashboard_widgets, dashboard_widget_types | 3 | ✅ |
| Child App Auth | registered_child_apps, child_app_sessions, child_app_access_logs, child_app_permissions, user_child_app_permissions | 5 | ✅ |
| Other | applications (with parent auth), categories, subcategories, employment_categories, user_activity_logs, activity_stats, institution_departments, migration_log | 8 | ✅ Updated with auth |

### Functions (237 total)
| Category | Location | Count | Purpose |
|----------|----------|-------|---------|
| Authentication & User | setup/02_functions.sql | 15 | User management, profiles, auth |
| Institution Access | setup/02_functions.sql | 10 | Institution access control |
| Billing | setup/02_functions.sql | 20 | Billing calculations, invoices |
| Attendance | setup/02_functions.sql | 5 | Attendance statistics |
| Timetable | setup/02_functions.sql | 10 | Timetable management |
| Academic | setup/02_functions.sql | 15 | Academic hierarchy, validations |
| Staff | setup/02_functions.sql | 5 | Staff management |
| Admission | setup/02_functions.sql | 4 | Application ID generation |
| Bug Reports | setup/02_functions.sql | 4 | Bug tracking |
| Resources | setup/02_functions.sql | 6 | Resource management |
| Notifications | setup/02_functions.sql | 1 | User notifications |
| API Keys | setup/02_functions.sql | 4 | API key management |
| Activity Logging | setup/02_functions.sql | 2 | Log cleanup, stats |
| Utilities | setup/02_functions.sql | 10+ | Helper functions |
| Dashboard | setup/02_functions.sql | 2 | Dashboard reporting |
| Permissions | setup/02_functions.sql | 6 | Role and permission checks |
| Child App Auth | setup/02_functions.sql | 2 | Session cleanup, access logging |

### RLS Policies (250+ total)
| Location | Count | Coverage |
|----------|-------|----------|
| setup/03_policies.sql | 250+ | 53 tables (94.6%) |

### Triggers (72 total)
| Category | Location | Count | Purpose |
|----------|----------|-------|---------|
| Timestamp Updates | setup/04_triggers.sql | 35 | Auto-update updated_at |
| Business Logic | setup/04_triggers.sql | 20 | Auto-populate, validations |
| Billing | setup/04_triggers.sql | 10 | Status updates, calculations |
| Attendance Validation | setup/04_triggers.sql | 1 | Staff assignment validation |
| Other | setup/04_triggers.sql | 6 | Various business rules |

### Views (7 total)
| View Name | Location | Module |
|-----------|----------|--------|
| auto_generated_invoices | setup/05_views.sql | Billing |
| bill_invoice_relationships | setup/05_views.sql | Billing |
| v_bill_details | setup/05_views.sql | Billing |
| bug_reporters_leaderboard | setup/05_views.sql | Bug Reports |
| bug_reports_with_details | setup/05_views.sql | Bug Reports |
| semester_hierarchy_health | setup/05_views.sql | Academic |
| semester_program_audit_view | setup/05_views.sql | Academic |

### Storage Buckets (7 total)
| Bucket | Purpose | Size Limit |
|--------|---------|------------|
| applications | Application documents | 50MB |
| avatars | User profile pictures | None |
| bug-reports | Bug report screenshots | 10MB |
| institution-logos | Institution branding | None |
| resource-management | Resource images | 10MB |
| staff-images | Staff photos | None |
| student-photos | Student photos | None |

### Indexes (382 total)
| Type | Count | Purpose |
|------|-------|---------|
| Primary Keys | 56 | Table primary keys |
| Unique | 95 | Unique constraints |
| Foreign Key | 0 | ⚠️ No FK constraints defined |
| Performance | 231 | Query optimization |

### Custom Types
| Type Name | Location | Values |
|-----------|----------|--------|
| user_role | setup/00_master_setup.sql | super_admin, admin, institution_admin, staff, student, parent, guest |
| attendance_status | setup/00_master_setup.sql | present, absent, late, excused, holiday |
| bill_status | setup/00_master_setup.sql | pending, partial, paid, overdue, cancelled |
| academic_year_status | setup/00_master_setup.sql | upcoming, active, completed |

## 🚀 Setup Instructions

### For New Clone/Setup:
```bash
# Run in Supabase SQL Editor in this exact order:
1. Run supabase/setup/00_master_setup.sql
2. Run supabase/setup/01_tables.sql
3. Run supabase/setup/02_functions.sql (when created)
4. Run supabase/setup/03_policies.sql (when created)
5. Run supabase/setup/04_triggers.sql (when created)
6. Run supabase/setup/05_views.sql (when created)
7. Run supabase/setup/06_seed_data.sql (optional)
```

### For Updates:
```bash
# NEVER create new files. Update existing files:
1. Open the appropriate file based on object type
2. Add update comments with date and reason
3. Make your changes
4. Update this index file
5. Test in development first
```

## 📝 Change Log

### 2025-01-17
- **Complete Database Analysis Performed**
- Created setup/02_functions.sql with 237 functions
- Created setup/03_policies.sql with 250+ RLS policies
- Created setup/04_triggers.sql with 71 triggers
- Created setup/05_views.sql with 7 views
- Generated comprehensive DATABASE_ANALYSIS_REPORT.md
- Identified critical issues (no foreign keys)
- Updated index with complete database structure
- **Parent Authentication Integration with Applications Module**
  - Added authentication fields to applications table in setup/01_tables.sql
  - Created migration file 20250117_add_auth_to_applications.sql
  - Updated TypeScript types to support authentication
  - Integrated authentication settings into application form UI
  - Applications can now optionally use MyJKKN authentication instead of separate login

### 2025-01-16
- Created organized structure
- Consolidated all existing SQL into proper files
- Established single source of truth policy

## ⚠️ Common Mistakes to Avoid

1. **Creating files like:**
   - ❌ `admission_module_schema.sql`
   - ❌ `organization_module_setup.sql`
   - ❌ `staff_module_setup.sql`
   - ❌ `billing_module_complete.sql`

2. **Instead, update:**
   - ✅ `setup/01_tables.sql` for any table changes
   - ✅ `setup/02_functions.sql` for function changes
   - ✅ This index file when changes are made

## 🔍 Quick Search

### Find billing-related objects:
- Tables: student_bills, billing_receipts in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find attendance-related objects:
- Tables: daily_attendance in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find user/auth-related objects:
- Tables: profiles in `setup/01_tables.sql`
- Functions: auth.* functions in `setup/00_master_setup.sql`

---
**Remember: ONE file per object type, NO duplicates, ALWAYS update existing files!**