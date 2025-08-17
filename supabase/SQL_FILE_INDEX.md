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

### Tables (19 total)
| Table Name | Location | Last Updated | Purpose |
|------------|----------|--------------|---------|
| profiles | setup/01_tables.sql | 2025-01-16 | User profiles extending auth.users |
| institutions | setup/01_tables.sql | 2025-01-16 | Educational institutions |
| departments | setup/01_tables.sql | 2025-01-16 | Institution departments |
| programs | setup/01_tables.sql | 2025-01-16 | Academic programs |
| academic_years | setup/01_tables.sql | 2025-01-16 | Academic year definitions |
| semesters | setup/01_tables.sql | 2025-01-16 | Program semesters |
| courses | setup/01_tables.sql | 2025-01-16 | Course definitions |
| sections | setup/01_tables.sql | 2025-01-16 | Class sections |
| students | setup/01_tables.sql | 2025-01-16 | Student records |
| staff | setup/01_tables.sql | 2025-01-16 | Staff records |
| daily_attendance | setup/01_tables.sql | 2025-01-16 | Daily attendance tracking |
| student_bills | setup/01_tables.sql | 2025-01-16 | Student billing |
| billing_receipts | setup/01_tables.sql | 2025-01-16 | Payment receipts |
| periods | setup/01_tables.sql | 2025-01-16 | Timetable periods |
| timetables | setup/01_tables.sql | 2025-01-16 | Class timetables |

### Functions
| Function Name | Location | Purpose |
|---------------|----------|---------|
| auth.get_user_role() | setup/00_master_setup.sql | Get current user role |
| auth.get_user_institutions() | setup/00_master_setup.sql | Get user's institution IDs |
| auth.has_institution_access() | setup/00_master_setup.sql | Check institution access |
| update_updated_at_column() | setup/00_master_setup.sql | Auto-update timestamp |

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