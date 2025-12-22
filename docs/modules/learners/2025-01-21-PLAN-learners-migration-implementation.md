# Learners Module Migration Implementation Plan

**Date:** 2025-01-21
**Objective:** Safe migration from admissions/students tables to learners_profiles
**Estimated Duration:** 3-5 days (with testing)
**Risk Level:** 🔴 HIGH - Requires careful execution

---

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Phase 0: Backup and Validation](#phase-0-backup-and-validation)
3. [Phase 1: Billing Foreign Key Migration](#phase-1-billing-foreign-key-migration-critical)
4. [Phase 2: Service Layer Migration](#phase-2-service-layer-migration)
5. [Phase 3: Hook and Component Migration](#phase-3-hook-and-component-migration)
6. [Phase 4: Create Backwards-Compatible Views](#phase-4-create-backwards-compatible-views)
7. [Phase 5: Route Cleanup](#phase-5-route-cleanup)
8. [Phase 6: Final Table Deprecation](#phase-6-final-table-deprecation)
9. [Phase 7: Post-Migration Validation](#phase-7-post-migration-validation)
10. [Rollback Procedures](#rollback-procedures)
11. [Testing Strategy](#testing-strategy)

---

## Pre-Migration Checklist

Before starting migration, ensure:

- [ ] **Full database backup** created
- [ ] **Git commit** all current changes
- [ ] **Create feature branch** for migration
- [ ] **Test environment** available for validation
- [ ] **Rollback plan** reviewed and understood
- [ ] **Team notification** sent (if applicable)
- [ ] **Downtime window** scheduled (if needed)

### Required Tools/Access

- [ ] Supabase dashboard access
- [ ] Database migration permissions
- [ ] Git repository access
- [ ] Code deployment access

---

## Phase 0: Backup and Validation

**Duration:** 30 minutes
**Risk Level:** 🟢 LOW

### Objectives

1. Create complete database backup
2. Verify data migration completeness
3. Document current state

### Steps

#### 1. Create Database Backup

```bash
# Via Supabase Dashboard:
# Settings > Database > Backups > Create Backup
# Name: "pre-learners-migration-2025-01-21"
```

#### 2. Validate Data Migration

Run these validation queries:

```sql
-- Verify all admissions are in learners_profiles
SELECT
    COUNT(*) as admissions_count,
    (SELECT COUNT(*) FROM learners_profiles
     WHERE original_admission_id IS NOT NULL) as migrated_count,
    CASE
        WHEN COUNT(*) = (SELECT COUNT(*) FROM learners_profiles
                         WHERE original_admission_id IS NOT NULL)
        THEN '✅ MATCH'
        ELSE '❌ MISMATCH'
    END as status
FROM admissions;

-- Verify all students are in learners_profiles
SELECT
    COUNT(*) as students_count,
    (SELECT COUNT(*) FROM learners_profiles
     WHERE original_student_id IS NOT NULL) as migrated_count,
    CASE
        WHEN COUNT(*) = (SELECT COUNT(*) FROM learners_profiles
                         WHERE original_student_id IS NOT NULL)
        THEN '✅ MATCH'
        ELSE '❌ MISMATCH'
    END as status
FROM students;

-- Check for orphaned billing records
SELECT
    COUNT(*) as total_bills,
    COUNT(CASE WHEN s.id IS NULL THEN 1 END) as orphaned_bills
FROM billing_student_bills b
LEFT JOIN students s ON b.student_id = s.id;
```

#### 3. Document Current Foreign Keys

```sql
-- List all FKs referencing students table
SELECT
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'students'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

**Expected Output:** Save this output for rollback reference.

### Success Criteria

- ✅ Database backup created and verified
- ✅ All validation queries return "✅ MATCH"
- ✅ No orphaned billing records found
- ✅ Foreign key documentation saved

---

## Phase 1: Billing Foreign Key Migration (CRITICAL)

**Duration:** 2-3 hours
**Risk Level:** 🔴 CRITICAL
**Downtime Required:** No (if done correctly)

### Objectives

1. Add learner_id columns to billing tables
2. Populate learner_id using student_id → learners_profiles mapping
3. Update foreign keys to reference learners_profiles
4. Remove CASCADE DELETE constraints

⚠️ **CRITICAL:** This phase MUST be completed before any table deletions.

### Steps

#### Step 1: Add learner_id columns

Create migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_learner_id_to_billing.sql`

```sql
-- ================================================
-- Migration: Add learner_id to billing tables
-- Purpose: Replace student_id references with learner_id
-- Author: Migration Bot
-- Date: 2025-01-21
-- ================================================

-- Add learner_id columns (nullable initially for safe migration)
ALTER TABLE billing_student_bills
ADD COLUMN IF NOT EXISTS learner_id UUID;

ALTER TABLE billing_invoices
ADD COLUMN IF NOT EXISTS learner_id UUID;

ALTER TABLE billing_receipts
ADD COLUMN IF NOT EXISTS learner_id UUID;

ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS learner_id UUID;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_learner_id
ON billing_student_bills(learner_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_learner_id
ON billing_invoices(learner_id);

CREATE INDEX IF NOT EXISTS idx_billing_receipts_learner_id
ON billing_receipts(learner_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_learner_id
ON payment_transactions(learner_id);

COMMENT ON COLUMN billing_student_bills.learner_id IS 'References learners_profiles.id - migrated from student_id';
COMMENT ON COLUMN billing_invoices.learner_id IS 'References learners_profiles.id - migrated from student_id';
COMMENT ON COLUMN billing_receipts.learner_id IS 'References learners_profiles.id - migrated from student_id';
COMMENT ON COLUMN payment_transactions.learner_id IS 'References learners_profiles.id - migrated from student_id';
```

#### Step 2: Populate learner_id from student_id mapping

```sql
-- ================================================
-- Populate learner_id using student_id mapping
-- ================================================

-- billing_student_bills
UPDATE billing_student_bills b
SET learner_id = lp.id
FROM learners_profiles lp
WHERE b.student_id = lp.original_student_id;

-- Verify: Check for unmapped records
SELECT COUNT(*) as unmapped_bills
FROM billing_student_bills
WHERE learner_id IS NULL AND student_id IS NOT NULL;
-- Expected: 0

-- billing_invoices
UPDATE billing_invoices i
SET learner_id = lp.id
FROM learners_profiles lp
WHERE i.student_id = lp.original_student_id;

-- Verify: Check for unmapped records
SELECT COUNT(*) as unmapped_invoices
FROM billing_invoices
WHERE learner_id IS NULL AND student_id IS NOT NULL;
-- Expected: 0

-- billing_receipts
UPDATE billing_receipts r
SET learner_id = lp.id
FROM learners_profiles lp
WHERE r.student_id = lp.original_student_id;

-- Verify: Check for unmapped records
SELECT COUNT(*) as unmapped_receipts
FROM billing_receipts
WHERE learner_id IS NULL AND student_id IS NOT NULL;
-- Expected: 0

-- payment_transactions
UPDATE payment_transactions pt
SET learner_id = lp.id
FROM learners_profiles lp
WHERE pt.student_id = lp.original_student_id;

-- Verify: Check for unmapped records
SELECT COUNT(*) as unmapped_transactions
FROM payment_transactions
WHERE learner_id IS NULL AND student_id IS NOT NULL;
-- Expected: 0
```

#### Step 3: Remove old CASCADE DELETE foreign keys

```sql
-- ================================================
-- Remove old foreign keys with CASCADE DELETE
-- ================================================

-- Drop old constraints
ALTER TABLE billing_student_bills
DROP CONSTRAINT IF EXISTS fk_bills_student;

ALTER TABLE billing_invoices
DROP CONSTRAINT IF EXISTS fk_invoices_student;

ALTER TABLE billing_receipts
DROP CONSTRAINT IF EXISTS fk_receipts_student;

ALTER TABLE payment_transactions
DROP CONSTRAINT IF EXISTS fk_transactions_student;
```

#### Step 4: Add new foreign keys to learners_profiles

```sql
-- ================================================
-- Add new foreign keys to learners_profiles
-- Using RESTRICT to prevent accidental deletions
-- ================================================

ALTER TABLE billing_student_bills
ADD CONSTRAINT fk_bills_learner
FOREIGN KEY (learner_id)
REFERENCES learners_profiles(id)
ON DELETE RESTRICT  -- Changed from CASCADE to RESTRICT
ON UPDATE CASCADE;

ALTER TABLE billing_invoices
ADD CONSTRAINT fk_invoices_learner
FOREIGN KEY (learner_id)
REFERENCES learners_profiles(id)
ON DELETE RESTRICT  -- Changed from CASCADE to RESTRICT
ON UPDATE CASCADE;

ALTER TABLE billing_receipts
ADD CONSTRAINT fk_receipts_learner
FOREIGN KEY (learner_id)
REFERENCES learners_profiles(id)
ON DELETE RESTRICT  -- Changed from CASCADE to RESTRICT
ON UPDATE CASCADE;

ALTER TABLE payment_transactions
ADD CONSTRAINT fk_transactions_learner
FOREIGN KEY (learner_id)
REFERENCES learners_profiles(id)
ON DELETE RESTRICT  -- Changed from CASCADE to RESTRICT
ON UPDATE CASCADE;
```

#### Step 5: Make learner_id NOT NULL (after verification)

```sql
-- ================================================
-- Make learner_id NOT NULL after successful migration
-- Only run after all verifications pass
-- ================================================

-- Verify NO NULL learner_ids exist
SELECT
    'billing_student_bills' as table_name,
    COUNT(*) as null_count
FROM billing_student_bills
WHERE learner_id IS NULL
UNION ALL
SELECT 'billing_invoices', COUNT(*)
FROM billing_invoices
WHERE learner_id IS NULL
UNION ALL
SELECT 'billing_receipts', COUNT(*)
FROM billing_receipts
WHERE learner_id IS NULL
UNION ALL
SELECT 'payment_transactions', COUNT(*)
FROM payment_transactions
WHERE learner_id IS NULL;
-- Expected: All counts should be 0

-- If all verifications pass, make NOT NULL
ALTER TABLE billing_student_bills
ALTER COLUMN learner_id SET NOT NULL;

ALTER TABLE billing_invoices
ALTER COLUMN learner_id SET NOT NULL;

ALTER TABLE billing_receipts
ALTER COLUMN learner_id SET NOT NULL;

ALTER TABLE payment_transactions
ALTER COLUMN learner_id SET NOT NULL;
```

### Validation Queries

Run after each step:

```sql
-- Validate mapping completeness
SELECT
    COUNT(*) as total_bills,
    COUNT(learner_id) as mapped_bills,
    COUNT(*) - COUNT(learner_id) as unmapped_bills
FROM billing_student_bills;

-- Validate foreign key integrity
SELECT
    b.id,
    b.student_id,
    b.learner_id,
    lp.id as learner_profile_id,
    lp.first_name,
    lp.last_name
FROM billing_student_bills b
LEFT JOIN learners_profiles lp ON b.learner_id = lp.id
WHERE b.learner_id IS NOT NULL
LIMIT 10;
```

### Rollback Procedure

If issues occur:

```sql
-- Restore old foreign keys
ALTER TABLE billing_student_bills
ADD CONSTRAINT fk_bills_student
FOREIGN KEY (student_id)
REFERENCES students(id)
ON DELETE CASCADE;

ALTER TABLE billing_invoices
ADD CONSTRAINT fk_invoices_student
FOREIGN KEY (student_id)
REFERENCES students(id)
ON DELETE CASCADE;

ALTER TABLE billing_receipts
ADD CONSTRAINT fk_receipts_student
FOREIGN KEY (student_id)
REFERENCES students(id)
ON DELETE CASCADE;

ALTER TABLE payment_transactions
ADD CONSTRAINT fk_transactions_student
FOREIGN KEY (student_id)
REFERENCES students(id)
ON DELETE CASCADE;

-- Drop new columns
ALTER TABLE billing_student_bills DROP COLUMN learner_id;
ALTER TABLE billing_invoices DROP COLUMN learner_id;
ALTER TABLE billing_receipts DROP COLUMN learner_id;
ALTER TABLE payment_transactions DROP COLUMN learner_id;
```

### Success Criteria

- ✅ All billing tables have learner_id column
- ✅ All learner_id values populated (no NULLs)
- ✅ New foreign keys reference learners_profiles
- ✅ Old CASCADE DELETE constraints removed
- ✅ All validation queries pass
- ✅ No billing data lost

---

## Phase 2: Service Layer Migration

**Duration:** 1-2 days
**Risk Level:** 🟠 HIGH
**Downtime Required:** No (gradual migration)

### Objectives

1. Update billing services to use learner_id
2. Migrate student services to use learners_profiles
3. Update admission services to use learners_profiles

### Priority Order

1. **Billing Services** (CRITICAL - just migrated FKs)
2. **Student Services**
3. **Admission Services**
4. **Other Services** (attendance, dashboard, etc.)

### Service Migration Pattern

For each service file, follow this pattern:

#### Before (Old Code):

```typescript
// lib/services/billing/schedule/student-search-service.ts
export class StudentSearchService {
  async searchStudents(filters: StudentFilters) {
    let query = this.supabase
      .from('students')  // ❌ OLD TABLE
      .select(`
        id,
        first_name,
        last_name,
        roll_number,
        college_email,
        student_mobile,
        // ... other fields
      `);

    if (filters.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }

    const { data, error } = await query;
    return data;
  }
}
```

#### After (New Code):

```typescript
// lib/services/billing/schedule/student-search-service.ts
export class StudentSearchService {
  async searchStudents(filters: LearnerProfileFilters) {
    let query = this.supabase
      .from('learners_profiles')  // ✅ NEW TABLE
      .select(`
        id,
        first_name,
        last_name,
        roll_number,
        college_email,
        student_mobile,
        // ... other fields
      `);

    // Filter for active students only (unless specified otherwise)
    if (!filters.lifecycle_status) {
      query = query.in('lifecycle_status', ['active', 'inactive']);
    }

    if (filters.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }

    const { data, error } = await query;
    return data;
  }
}
```

### Files to Migrate (Priority Order)

#### 1. Billing Services (DO FIRST)

```
✅ lib/services/billing/schedule/student-search-service.ts
✅ lib/services/billing/schedule/student-search-service-optimized.ts
✅ lib/services/billing/schedule/student-bill-service.ts
✅ lib/services/billing/invoices/billing-invoice-service.ts
✅ lib/services/billing/invoices/billing-invoice-service-optimized.ts
✅ lib/services/billing/receipts/billing-receipt-service.ts
✅ lib/services/billing/refunds/billing-refund-service.ts
✅ lib/services/billing/reports/billing-report-service.ts
✅ lib/services/billing/payment-gateway-service.ts
✅ lib/services/billing/discounts/billing-discount-service.ts
```

**Key Changes:**
- Replace `.from('students')` with `.from('learners_profiles')`
- Update type imports from `Student` to `LearnerProfile`
- Use `learner_id` instead of `student_id` in JOIN/WHERE clauses
- Filter by `lifecycle_status IN ('active', 'inactive')` for student queries

#### 2. Student Services

```
✅ lib/services/student/student-service.ts
✅ lib/services/student/student-profile-sync-service.ts
✅ lib/services/student/student-photo-migration-service.ts
✅ lib/services/student/photo-migration-service.ts
```

**Migration Strategy:**
- These files can potentially be DELETED after migration
- Functions should move to `lib/services/learner-profile-service.ts`
- Or kept as thin wrappers calling learner-profile-service

#### 3. Admission Services

```
✅ lib/services/admission/admission-service.ts
✅ lib/services/admission/admission-ai-service.ts
```

**Migration Strategy:**
- Merge admission flow into learner-profile-service
- Keep CRM features if needed
- Update status flow: pending → approved → active (instead of enrolled)

#### 4. Other Services

```
✅ lib/services/academic/attendance-service.ts
✅ lib/services/academic/attendance-report-service.ts
✅ lib/services/academic/attendance-dashboard-service.ts
✅ lib/services/academic/attendance-export-service.ts
✅ lib/services/dashboard/dashboard-service.ts
✅ lib/services/organization/organization-service.ts
✅ lib/services/users/user-service.ts
✅ lib/services/ai-query-service.ts
```

### Example: Migrating Billing Invoice Service

#### Step 1: Update Type Imports

```typescript
// Before
import type { Student, StudentFilters } from '@/types/student';

// After
import type { LearnerProfile, LearnerProfileFilters } from '@/types/learner-profile';
```

#### Step 2: Update Table References

```typescript
// Before
const { data: students } = await this.supabase
  .from('students')
  .select('id, first_name, last_name, roll_number')
  .in('id', studentIds);

// After
const { data: learners } = await this.supabase
  .from('learners_profiles')
  .select('id, first_name, last_name, roll_number')
  .in('id', learnerIds);
```

#### Step 3: Update Foreign Key Columns

```typescript
// Before
const { data: invoice } = await this.supabase
  .from('billing_invoices')
  .insert({
    student_id: studentId,  // ❌ OLD COLUMN
    // ...other fields
  });

// After
const { data: invoice } = await this.supabase
  .from('billing_invoices')
  .insert({
    learner_id: learnerId,  // ✅ NEW COLUMN
    // ...other fields
  });
```

#### Step 4: Add Lifecycle Status Filters

```typescript
// After (add this filter)
let query = this.supabase
  .from('learners_profiles')
  .select('*')
  .in('lifecycle_status', ['active', 'inactive']);  // ✅ Filter for students only
```

### Testing After Each Service Migration

```typescript
// Test queries in Supabase SQL editor
-- Verify service still works
SELECT * FROM learners_profiles
WHERE lifecycle_status IN ('active', 'inactive')
LIMIT 10;

-- Verify billing linkage
SELECT
    lp.id,
    lp.first_name,
    lp.last_name,
    COUNT(b.id) as bill_count
FROM learners_profiles lp
LEFT JOIN billing_student_bills b ON b.learner_id = lp.id
WHERE lp.lifecycle_status = 'active'
GROUP BY lp.id, lp.first_name, lp.last_name
LIMIT 10;
```

### Success Criteria

- ✅ All billing services use `learners_profiles` table
- ✅ All services use `learner_id` instead of `student_id`
- ✅ All TypeScript types updated to `LearnerProfile`
- ✅ All services filter by `lifecycle_status` appropriately
- ✅ Unit tests pass (if applicable)
- ✅ Manual testing confirms functionality

---

## Phase 3: Hook and Component Migration

**Duration:** 1 day
**Risk Level:** 🟡 MEDIUM
**Downtime Required:** No

### Objectives

1. Update React Query hooks to use new services
2. Migrate component imports to use LearnerProfile types
3. Update UI filters and displays

### Hooks to Migrate

```
✅ hooks/billing/use-student-bills.ts
✅ hooks/billing/use-student-bills-optimized.ts
✅ hooks/billing/use-student-search.ts
✅ hooks/billing/use-student-search-optimized.ts
✅ hooks/admission/use-admissions.ts
✅ hooks/admission/use-admission-analytics.ts
✅ hooks/academic/use-attendance.ts
✅ hooks/use-ai-query.ts
✅ hooks/use-permissions.ts
```

### Hook Migration Pattern

#### Before:

```typescript
// hooks/billing/use-student-search.ts
import { StudentService } from '@/lib/services/student/student-service';
import type { Student, StudentFilters } from '@/types/student';

export function useStudentSearch(filters: StudentFilters) {
  return useQuery({
    queryKey: ['students', 'search', filters],
    queryFn: async () => {
      return await StudentService.searchStudents(filters);
    },
  });
}
```

#### After:

```typescript
// hooks/billing/use-student-search.ts (or rename to use-learner-search.ts)
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LearnerProfile, LearnerProfileFilters } from '@/types/learner-profile';

export function useStudentSearch(filters: LearnerProfileFilters) {
  return useQuery({
    queryKey: ['learners', 'search', filters],
    queryFn: async () => {
      // Add filter for student lifecycle statuses
      const studentFilters = {
        ...filters,
        lifecycle_status: filters.lifecycle_status || ['active', 'inactive'],
      };
      return await LearnerProfileService.getLearners(studentFilters);
    },
  });
}
```

### Component Migration

For components using old hooks:

```typescript
// Before
import { useStudentSearch } from '@/hooks/billing/use-student-search';
import type { Student } from '@/types/student';

export function BillingPage() {
  const { data: students } = useStudentSearch({ status: 'active' });

  return (
    <div>
      {students?.map((student: Student) => (
        <div key={student.id}>{student.first_name}</div>
      ))}
    </div>
  );
}

// After
import { useStudentSearch } from '@/hooks/billing/use-student-search';
import type { LearnerProfile } from '@/types/learner-profile';

export function BillingPage() {
  const { data: learners } = useStudentSearch({
    lifecycle_status: ['active', 'inactive']
  });

  return (
    <div>
      {learners?.map((learner: LearnerProfile) => (
        <div key={learner.id}>{learner.first_name}</div>
      ))}
    </div>
  );
}
```

### Success Criteria

- ✅ All hooks use new service layer
- ✅ All components use LearnerProfile types
- ✅ UI displays correctly
- ✅ No TypeScript errors
- ✅ React Query cache keys updated

---

## Phase 4: Create Backwards-Compatible Views

**Duration:** 2 hours
**Risk Level:** 🟢 LOW
**Downtime Required:** No

### Objectives

1. Create SQL views that mimic old table structures
2. Enable gradual service migration without breaking old code
3. Provide fallback for external integrations

### Create Students View

```sql
-- ================================================
-- Create backwards-compatible students VIEW
-- Allows old queries to work during transition
-- ================================================

CREATE OR REPLACE VIEW students AS
SELECT
    id,
    original_student_id as admission_id,  -- Map back to old admission_id
    first_name,
    last_name,
    father_name,
    father_occupation,
    father_mobile,
    mother_name,
    mother_occupation,
    mother_mobile,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    medical_cutoff_marks,
    engineering_cutoff_marks,
    neet_roll_number,
    neet_score,
    aadhar_number,
    counseling_applied,
    counseling_number,
    first_graduate,
    quota,
    category,
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_id,
    section_id,
    academic_year_id,
    register_number,
    regulation_id,
    batch_id,
    entry_type,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    student_mobile,
    student_email,
    accommodation_type,
    hostel_type,
    food_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    roll_number,
    student_photo_url,
    college_email,
    is_profile_complete,
    CASE
        WHEN lifecycle_status = 'active' THEN 'active'
        WHEN lifecycle_status = 'inactive' THEN 'inactive'
        WHEN lifecycle_status = 'exited' THEN 'exited'
        WHEN lifecycle_status = 'graduated' THEN 'graduated'
        WHEN lifecycle_status IN ('pending', 'approved') THEN 'pending'
        ELSE 'inactive'
    END as status,
    created_at,
    updated_at,
    created_by,
    updated_by
FROM learners_profiles
WHERE lifecycle_status IN ('active', 'inactive', 'exited', 'graduated');

COMMENT ON VIEW students IS 'Backwards-compatible view of learners_profiles filtered for student lifecycle statuses';
```

### Create Admissions View

```sql
-- ================================================
-- Create backwards-compatible admissions VIEW
-- ================================================

CREATE OR REPLACE VIEW admissions AS
SELECT
    id,
    application_id,
    first_name,
    last_name,
    father_name,
    father_occupation,
    father_mobile,
    mother_name,
    mother_occupation,
    mother_mobile,
    date_of_birth,
    gender,
    religion,
    community,
    caste,
    annual_income,
    aadhar_number,
    last_school,
    board_of_study,
    tenth_marks,
    twelfth_marks,
    medical_cutoff_marks,
    engineering_cutoff_marks,
    neet_roll_number,
    neet_score,
    counseling_applied,
    counseling_number,
    first_graduate,
    quota,
    category,
    institution_id,
    degree_id,
    department_id,
    program_id,
    academic_year_id,
    semester_id,
    section_id,
    roll_number,
    college_email,
    student_photo_url,
    register_number,
    regulation_id,
    batch_id,
    entry_type,
    permanent_address_street,
    permanent_address_taluk,
    permanent_address_district,
    permanent_address_pin_code,
    permanent_address_state,
    student_mobile,
    student_email,
    accommodation_type,
    hostel_type,
    food_type,
    bus_required,
    bus_route,
    bus_pickup_location,
    reference_type,
    reference_name,
    reference_contact,
    CASE
        WHEN lifecycle_status = 'enquiry' THEN 'pending'
        WHEN lifecycle_status = 'pending' THEN 'pending'
        WHEN lifecycle_status = 'approved' THEN 'approved'
        WHEN lifecycle_status = 'rejected' THEN 'rejected'
        WHEN lifecycle_status = 'waitlisted' THEN 'waitlisted'
        WHEN lifecycle_status IN ('active', 'inactive') THEN 'enrolled'
        ELSE 'pending'
    END as status,
    created_at,
    updated_at,
    created_by,
    updated_by
FROM learners_profiles
WHERE lifecycle_status IN ('enquiry', 'pending', 'approved', 'rejected', 'waitlisted');

COMMENT ON VIEW admissions IS 'Backwards-compatible view of learners_profiles filtered for admission lifecycle statuses';
```

### Important Notes

⚠️ **Views are READ-ONLY**. INSERT/UPDATE/DELETE operations will NOT work on views. All writes must go through learners_profiles table or use INSTEAD OF triggers.

### Success Criteria

- ✅ Views created successfully
- ✅ Old SELECT queries return expected data
- ✅ No errors in application logs
- ✅ Performance acceptable (views should be fast)

---

## Phase 5: Route Cleanup

**Duration:** 4 hours
**Risk Level:** 🟡 MEDIUM
**Downtime Required:** No (routes already replaced)

### Objectives

1. Remove old `/admissions/` routes
2. Remove old `/students/` routes
3. Update navigation/sidebar links
4. Redirect old URLs to new learner routes

### Steps

#### 1. Create Redirects (Before Deleting)

Update `next.config.js` or middleware:

```typescript
// middleware.ts or next.config.js redirects
const redirects = [
  // Admissions redirects
  {
    source: '/admissions',
    destination: '/learners/enquiries',
    permanent: true,
  },
  {
    source: '/admissions/new',
    destination: '/learners/enquiries/new',
    permanent: true,
  },
  {
    source: '/admissions/:id',
    destination: '/learners/enquiries/:id',
    permanent: true,
  },
  {
    source: '/admissions/:id/edit',
    destination: '/learners/enquiries/:id/edit',
    permanent: true,
  },
  {
    source: '/admissions/analytics',
    destination: '/learners/analytics',
    permanent: true,
  },

  // Students redirects
  {
    source: '/students',
    destination: '/learners/profiles',
    permanent: true,
  },
  {
    source: '/students/:id',
    destination: '/learners/profiles/:id',
    permanent: true,
  },
  {
    source: '/students/:id/edit',
    destination: '/learners/profiles/:id/edit',
    permanent: true,
  },
  {
    source: '/students/dashboard',
    destination: '/learners/analytics',
    permanent: true,
  },
  {
    source: '/students/promotion',
    destination: '/learners/profiles/promotion',
    permanent: true,
  },
  {
    source: '/students/graduated',
    destination: '/learners/alumni',
    permanent: true,
  },
];
```

#### 2. Update Sidebar Navigation

Update `lib/sidebarMenuLink.ts`:

```typescript
// Before - REMOVE THESE
{
  label: 'Admissions',
  href: '/admissions',
  icon: UserPlus,
},
{
  label: 'Students',
  href: '/students',
  icon: Users,
},

// After - KEEP THESE
{
  label: 'Learners',
  icon: Users,
  submenu: [
    { label: 'Enquiries', href: '/learners/enquiries' },
    { label: 'Profiles', href: '/learners/profiles' },
    { label: 'Alumni', href: '/learners/alumni' },
    { label: 'Analytics', href: '/learners/analytics' },
  ],
},
```

#### 3. Delete Old Route Directories

```bash
# Backup first (optional)
git checkout -b remove-old-learner-routes

# Delete old routes
rm -rf app/\(routes\)/admissions
rm -rf app/\(routes\)/students

# Commit
git add .
git commit -m "Remove deprecated admissions and students routes

- Replaced by /learners/ module
- Redirects configured in middleware
- All functionality available in learners module"
```

#### 4. Search for Hardcoded Links

```bash
# Search for hardcoded /admissions links
grep -r "href.*admissions" app/ components/

# Search for hardcoded /students links
grep -r "href.*students" app/ components/

# Update any found instances to /learners/
```

### Success Criteria

- ✅ Old routes deleted from codebase
- ✅ Redirects configured and tested
- ✅ Sidebar navigation updated
- ✅ No broken links in application
- ✅ Users redirected seamlessly

---

## Phase 6: Final Table Deprecation

**Duration:** 1 hour
**Risk Level:** 🟢 LOW (if all previous phases complete)
**Downtime Required:** No

⚠️ **ONLY DO THIS AFTER:**
- All services migrated
- All hooks migrated
- All components migrated
- Billing FKs migrated
- Views created
- Thorough testing complete

### Objectives

1. Rename old tables (don't delete yet)
2. Monitor for errors
3. Eventually drop tables

### Steps

#### 1. Rename Tables (Soft Deprecation)

```sql
-- ================================================
-- Rename tables for soft deprecation
-- Keeps data safe while monitoring for errors
-- ================================================

-- Rename students table
ALTER TABLE students RENAME TO _deprecated_students_backup_20250121;

-- Rename admissions table
ALTER TABLE admissions RENAME TO _deprecated_admissions_backup_20250121;

-- Add comments
COMMENT ON TABLE _deprecated_students_backup_20250121 IS 'DEPRECATED: Replaced by learners_profiles. Safe to drop after 2025-02-21 if no errors.';
COMMENT ON TABLE _deprecated_admissions_backup_20250121 IS 'DEPRECATED: Replaced by learners_profiles. Safe to drop after 2025-02-21 if no errors.';
```

#### 2. Monitor for Errors

Monitor application logs for 1-2 weeks:

```bash
# Check for errors referencing old tables
grep -i "students\|admissions" logs/*.log

# Check Supabase logs
# Look for queries failing due to missing tables
```

#### 3. Final Deletion (After Monitoring Period)

**ONLY after 2-4 weeks of successful operation:**

```sql
-- ================================================
-- FINAL DELETION - Point of no return
-- ================================================

-- Drop old tables
DROP TABLE IF EXISTS _deprecated_students_backup_20250121 CASCADE;
DROP TABLE IF EXISTS _deprecated_admissions_backup_20250121 CASCADE;
```

### Success Criteria

- ✅ Old tables renamed
- ✅ No application errors detected
- ✅ Monitoring period completed
- ✅ Final deletion successful (after monitoring)

---

## Phase 7: Post-Migration Validation

**Duration:** 2 hours
**Risk Level:** 🟢 LOW

### Comprehensive Validation Checklist

#### Database Validation

```sql
-- 1. Verify learners_profiles count
SELECT COUNT(*) as total_learners FROM learners_profiles;
-- Expected: 2978+ (original + any new entries)

-- 2. Verify billing linkage
SELECT
    COUNT(*) as total_bills,
    COUNT(DISTINCT learner_id) as unique_learners,
    COUNT(CASE WHEN learner_id IS NULL THEN 1 END) as null_learners
FROM billing_student_bills;
-- Expected: null_learners = 0

-- 3. Verify invoice linkage
SELECT
    COUNT(*) as total_invoices,
    COUNT(DISTINCT learner_id) as unique_learners
FROM billing_invoices;

-- 4. Verify payment linkage
SELECT
    COUNT(*) as total_transactions,
    COUNT(DISTINCT learner_id) as unique_learners
FROM payment_transactions;

-- 5. Verify foreign key constraints
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'learners_profiles'
ORDER BY tc.table_name;
-- Expected: All billing tables reference learners_profiles
```

#### Application Testing

- [ ] Login and access learner profiles page
- [ ] Create new enquiry
- [ ] Convert enquiry to active student
- [ ] Search for active learners
- [ ] View learner details
- [ ] Edit learner information
- [ ] Create bill for learner
- [ ] Generate invoice
- [ ] Process payment
- [ ] View billing reports
- [ ] Export learner data
- [ ] Bulk operations (if applicable)
- [ ] Attendance marking (if integrated)
- [ ] Analytics dashboards

#### Performance Testing

```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM learners_profiles
WHERE lifecycle_status IN ('active', 'inactive')
AND institution_id = 'some-uuid'
LIMIT 100;

-- Verify indexes exist
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'learners_profiles'
ORDER BY indexname;
```

### Success Criteria

- ✅ All database validation queries pass
- ✅ All application features work correctly
- ✅ No errors in logs
- ✅ Performance acceptable
- ✅ User acceptance testing complete

---

## Rollback Procedures

### If Issues Detected in Phase 1 (Billing Migration)

```sql
-- 1. Drop new foreign keys
ALTER TABLE billing_student_bills DROP CONSTRAINT fk_bills_learner;
ALTER TABLE billing_invoices DROP CONSTRAINT fk_invoices_learner;
ALTER TABLE billing_receipts DROP CONSTRAINT fk_receipts_learner;
ALTER TABLE payment_transactions DROP CONSTRAINT fk_transactions_learner;

-- 2. Restore old foreign keys
ALTER TABLE billing_student_bills
ADD CONSTRAINT fk_bills_student
FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE billing_invoices
ADD CONSTRAINT fk_invoices_student
FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE billing_receipts
ADD CONSTRAINT fk_receipts_student
FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE payment_transactions
ADD CONSTRAINT fk_transactions_student
FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- 3. Drop learner_id columns
ALTER TABLE billing_student_bills DROP COLUMN learner_id;
ALTER TABLE billing_invoices DROP COLUMN learner_id;
ALTER TABLE billing_receipts DROP COLUMN learner_id;
ALTER TABLE payment_transactions DROP COLUMN learner_id;
```

### If Issues Detected in Phase 2+ (Code Migration)

```bash
# 1. Revert Git commits
git revert <commit-hash>

# 2. Redeploy previous version
npm run build
# Deploy to production

# 3. Database changes already applied can stay
# Just revert code to use old tables
```

### Full Rollback (Emergency)

```bash
# 1. Restore database from backup
# Via Supabase Dashboard: Backups > Restore "pre-learners-migration-2025-01-21"

# 2. Revert all code changes
git checkout main
git reset --hard <commit-before-migration>

# 3. Force push (if needed - BE CAREFUL)
git push --force origin main

# 4. Redeploy application
npm run build && npm run deploy
```

---

## Testing Strategy

### Unit Testing

For each migrated service:

```typescript
// Example test
describe('LearnerProfileService', () => {
  it('should fetch learners with active status', async () => {
    const learners = await LearnerProfileService.getLearners({
      lifecycle_status: ['active'],
    });
    expect(learners.length).toBeGreaterThan(0);
    expect(learners[0]).toHaveProperty('id');
    expect(learners[0]).toHaveProperty('first_name');
  });

  it('should create billing invoice with learner_id', async () => {
    const invoice = await BillingInvoiceService.createInvoice({
      learner_id: 'test-learner-uuid',
      // ...other fields
    });
    expect(invoice.learner_id).toBe('test-learner-uuid');
  });
});
```

### Integration Testing

Test complete user flows:

1. **Admission → Enrollment Flow:**
   - Create enquiry
   - Approve to pending
   - Assign to semester/section
   - Activate student
   - Verify billing works

2. **Billing Flow:**
   - Search for active learner
   - Create bill
   - Generate invoice
   - Process payment
   - Verify receipt

3. **Reporting Flow:**
   - Generate student list
   - Export data
   - View analytics
   - Verify counts match

### Load Testing

```bash
# Use tool like k6 or Artillery
# Test with production-like data volume

# Example k6 script
import http from 'k6/http';
import { check } from 'k6';

export default function() {
  const res = http.get('https://your-app.com/api/learners');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

### User Acceptance Testing (UAT)

Create test checklist for end users:

- [ ] Can view list of students
- [ ] Can search students by various filters
- [ ] Can create new enquiry
- [ ] Can edit student information
- [ ] Can generate invoices
- [ ] Can process payments
- [ ] Can view reports
- [ ] All data is accurate
- [ ] Performance is acceptable

---

## Timeline and Milestones

### Day 1: Preparation and Billing Migration
- **Morning:** Phase 0 (Backup) + Phase 1 Start
- **Afternoon:** Phase 1 Complete + Validation
- **Evening:** Phase 2 Start (Billing services)

### Day 2: Service Layer Migration
- **Full Day:** Phase 2 Continue (All services)
- **Evening:** Testing and validation

### Day 3: Hooks and Components
- **Morning:** Phase 3 (Hooks migration)
- **Afternoon:** Phase 4 (Create views)
- **Evening:** Testing

### Day 4: Route Cleanup and Testing
- **Morning:** Phase 5 (Route cleanup)
- **Afternoon:** Phase 7 (Comprehensive testing)
- **Evening:** UAT preparation

### Day 5: Final Validation and Deployment
- **Morning:** UAT with users
- **Afternoon:** Fix any issues found
- **Evening:** Phase 6 (Soft table deprecation)

### Week 2-4: Monitoring
- **Monitor application for errors**
- **Collect user feedback**
- **Performance tuning if needed**

### After 4 Weeks: Final Cleanup
- **Phase 6 Complete (Drop old tables)**

---

## Success Metrics

### Key Performance Indicators (KPIs)

1. **Data Integrity:** 100% of records migrated with no data loss
2. **Uptime:** 99.9% application availability during migration
3. **Performance:** No degradation in query response times
4. **User Impact:** Zero critical bugs reported
5. **Billing Accuracy:** 100% of billing operations functional

### Validation Checklist

- [ ] All data migrated successfully
- [ ] All foreign keys updated
- [ ] All services using new tables
- [ ] All hooks using new services
- [ ] All components working correctly
- [ ] All routes redirected properly
- [ ] No errors in production logs
- [ ] Performance benchmarks met
- [ ] User acceptance complete
- [ ] Documentation updated

---

## Conclusion

This migration plan provides a **safe, phased approach** to replacing the admissions and students modules with the unified learners profiles system. The most critical phase is **Phase 1 (Billing FK Migration)**, which must be completed first to prevent catastrophic data loss.

**Key Takeaways:**

1. ✅ **Data is safe:** All records migrated to learners_profiles
2. ⚠️ **Billing is critical:** Must migrate foreign keys FIRST
3. 🔄 **Gradual migration:** Phase-by-phase to minimize risk
4. 🛡️ **Safety nets:** Views provide backwards compatibility
5. 📊 **Validation:** Comprehensive testing at each phase

**Estimated Total Effort:** 3-5 days of development + 2-4 weeks monitoring

---

## Related Documents

- `2025-01-21-MODULE-learners-migration-impact-analysis.md` - Detailed impact analysis
- `supabase/setup/01_tables.sql` - Table definitions
- `supabase/setup/06_foreign_keys.sql` - Foreign key constraints
- `types/learner-profile.ts` - New type definitions
- `lib/services/learner-profile-service.ts` - New service implementation

---

**Document Version:** 1.0
**Last Updated:** 2025-01-21
**Status:** Ready for Implementation
**Reviewed By:** [To be filled]
**Approved By:** [To be filled]
