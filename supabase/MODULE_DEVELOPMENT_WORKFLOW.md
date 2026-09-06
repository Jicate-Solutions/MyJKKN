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

### Step 5 (FINAL): If the migration is applied BY HAND, mark it APPLIED in `SQL_FILE_INDEX.md`

Most SQL in this repo does **not** reach production through `supabase db push`. It ships as
**FILE ONLY / NOT APPLIED**, waits on the Director, and is then applied by hand through the
Supabase Management API. That path writes **no** row to `supabase_migrations.schema_migrations`,
so the ledger can never tell you it ran — only the catalog can.

The hand-apply path is **not** finished at catalog verification. It is finished when the index
agrees with the database:

- [ ] Rehearse inside `BEGIN … ROLLBACK`, then confirm residue is **0 in a separate call** — the
      Management API wraps a whole batch in one transaction, so a same-batch check proves nothing.
- [ ] Apply, with the Director's approval on record.
- [ ] Verify by **catalog** — `pg_proc`, `pg_class`, `pg_policies`, `information_schema` — never by
      the ledger. A ledger HIT is definitive; a ledger MISS proves nothing.
- [ ] **FINAL STEP, same session: edit `supabase/SQL_FILE_INDEX.md`.** Change that migration's entry
      from `FILE ONLY / NOT APPLIED` to `✅ APPLIED to production <date>`, and paste the catalog
      evidence you actually read. If you are correcting a stale entry rather than recording a fresh
      apply, say so in the entry.

**Why this step is not optional.** An applied migration whose index entry still reads FILE ONLY
looks pending to the next session. It gets re-applied or re-written, and every `DROP` + `CREATE`
inside it is rolled back to whatever the file said the day it was written. This has already happened
here: `20260809101500` sat mis-marked until 2026-08-05, and `20260809103100` / `103200` / `103300` /
`103500` until 2026-08-06. Correcting the index later is a separate human act nobody remembers —
doing it in the same session as the apply is the only version that works.

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
5. **DON'T** leave an applied migration marked `FILE ONLY / NOT APPLIED` in `SQL_FILE_INDEX.md` — see Step 5

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
- [ ] **If applied BY HAND: mark that entry in `SQL_FILE_INDEX.md` `✅ APPLIED to production <date>` with the catalog proof — same session (Step 5)**
- [ ] Commit all changes

## 📌 Important Notes

- **Migration files** = What to run
- **Setup files** = What exists
- Always keep both in sync!

---

*Last Updated: 2026-08-06 — added Step 5: the hand-apply path ends at `SQL_FILE_INDEX.md`, not at catalog verification.*