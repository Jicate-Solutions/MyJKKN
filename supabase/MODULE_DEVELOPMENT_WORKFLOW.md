# Module Development Workflow for MyJKKN

## 📋 Overview
This document explains the proper workflow for adding new feature modules to the MyJKKN database.

## 🔄 Dual-File Strategy

When creating a new module, you must maintain TWO sets of files:

### 1. Migration Files (For Execution)
- **Location**: `supabase/migrations/`
- **Purpose**: Actually execute database changes
- **Naming**: `YYYYMMDD_module_name.sql`
- **Usage**: Run with `supabase db push` or apply directly

### 2. Setup Files (For Reference)
- **Location**: `supabase/setup/`
- **Purpose**: Complete database reference and documentation
- **Files to Update**:
  - `01_tables.sql` - Table definitions
  - `02_functions.sql` - Functions and procedures
  - `03_policies.sql` - RLS policies
  - `04_triggers.sql` - Triggers (if any)
  - `05_views.sql` - Views (if any)

## 📝 Step-by-Step Workflow

### Step 1: Create Migration File
```sql
-- supabase/migrations/20250117_child_app_auth.sql
-- Purpose: Add child app authentication module
-- Author: [Your Name]
-- Date: 2025-01-17

-- Your complete module SQL here
CREATE TABLE IF NOT EXISTS...
```

### Step 2: Run Migration
```bash
# Apply the migration to your database
supabase db push
```

### Step 3: Update Setup Files
After successfully running the migration, update the setup files:

#### A. Update 01_tables.sql
```sql
-- =====================================================
-- CHILD APP AUTHENTICATION MODULE
-- Updated: 2025-01-17 - Added child app authentication tables
-- =====================================================
-- Add your table definitions here
```

#### B. Update 02_functions.sql
```sql
-- =====================================================
-- CHILD APP AUTHENTICATION FUNCTIONS
-- Updated: 2025-01-17 - Added child app functions
-- =====================================================
-- Add your functions here
```

#### C. Update 03_policies.sql
```sql
-- =====================================================
-- CHILD APP AUTHENTICATION POLICIES
-- Updated: 2025-01-17 - Added RLS policies
-- =====================================================
-- Add your policies here
```

### Step 4: Update SQL_FILE_INDEX.md
Add your module to the index:
```markdown
| Child App Auth | registered_child_apps, child_app_sessions, ... | 5 | ✅ |
```

## ✅ Benefits of This Approach

1. **Migration History**: Keep track of when changes were applied
2. **Complete Reference**: Setup files show the complete database structure
3. **Easy Rollback**: Migration files can be reverted if needed
4. **Documentation**: Setup files serve as documentation
5. **Fresh Installs**: Setup files can recreate the entire database

## 🚫 Common Mistakes to Avoid

1. **DON'T** delete migration files after running them
2. **DON'T** forget to update setup files after migrations
3. **DON'T** modify old migration files
4. **DON'T** create duplicate definitions

## 📂 Example: Child App Authentication Module

### Migration File (For Execution)
```
supabase/migrations/20250117_child_app_auth_tables.sql
```
- Contains complete module implementation
- Run once to apply changes

### Setup Files (For Reference)
```
supabase/setup/01_tables.sql - Added 5 tables
supabase/setup/02_functions.sql - Added 2 functions  
supabase/setup/03_policies.sql - Added RLS policies
```
- Updated with module components
- Serves as complete database documentation

## 🔍 Quick Checklist for New Modules

- [ ] Create migration file in `supabase/migrations/`
- [ ] Test migration locally
- [ ] Run migration on database
- [ ] Update `01_tables.sql` with new tables
- [ ] Update `02_functions.sql` with new functions
- [ ] Update `03_policies.sql` with RLS policies
- [ ] Update `04_triggers.sql` if needed
- [ ] Update `05_views.sql` if needed
- [ ] Update `SQL_FILE_INDEX.md`
- [ ] Commit all changes

## 📌 Important Notes

- **Migration files** = What to run
- **Setup files** = What exists
- Always keep both in sync!

---

*Last Updated: 2025-01-17*