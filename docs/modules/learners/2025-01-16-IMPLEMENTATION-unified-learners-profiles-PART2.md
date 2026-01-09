# Unified Learners Profiles Implementation Plan - PART 2

**Continuation of:** 2025-01-16-IMPLEMENTATION-unified-learners-profiles.md

---

## Phase 3 (Continued): Service Layer Migration

#### 3.3 Create React Query Hooks

**File:** `hooks/learner/use-learner-profiles.ts`

```typescript
// Updated: 2025-01-23 - Created unified learner profile hooks
// Replaces: hooks/admission/* + hooks/student/*

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LearnerProfileService } from '@/lib/services/learners/learner-profile-service';
import type {
  LearnerProfile,
  CreateLearnerProfileDto,
  UpdateLearnerProfileDto,
  LearnerProfileFilters,
  LifecycleStatus,
} from '@/types/learner-profile';
import toast from 'react-hot-toast';

// Query keys
export const learnerProfileKeys = {
  all: ['learner-profiles'] as const,
  lists: () => [...learnerProfileKeys.all, 'list'] as const,
  list: (filters: LearnerProfileFilters) =>
    [...learnerProfileKeys.lists(), filters] as const,
  details: () => [...learnerProfileKeys.all, 'detail'] as const,
  detail: (id: string) => [...learnerProfileKeys.details(), id] as const,
  analytics: (filters: any) => [...learnerProfileKeys.all, 'analytics', filters] as const,
};

/**
 * Get single learner profile
 */
export function useLearnerProfile(id: string | undefined) {
  return useQuery({
    queryKey: learnerProfileKeys.detail(id!),
    queryFn: () => LearnerProfileService.getLearnerProfile(id!),
    enabled: !!id,
  });
}

/**
 * Get learner profiles with filters
 */
export function useLearnerProfiles(filters: LearnerProfileFilters) {
  return useQuery({
    queryKey: learnerProfileKeys.list(filters),
    queryFn: () => LearnerProfileService.getLearnerProfiles(filters),
  });
}

/**
 * Create learner profile
 */
export function useCreateLearnerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLearnerProfileDto) =>
      LearnerProfileService.createLearnerProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      toast.success('Learner profile created successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create learner profile');
    },
  });
}

/**
 * Update learner profile
 */
export function useUpdateLearnerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLearnerProfileDto }) =>
      LearnerProfileService.updateLearnerProfile(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      toast.success('Learner profile updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update learner profile');
    },
  });
}

/**
 * Update lifecycle status
 */
export function useUpdateLifecycleStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      newStatus,
      reason,
    }: {
      id: string;
      newStatus: LifecycleStatus;
      reason?: string;
    }) => LearnerProfileService.updateLifecycleStatus(id, newStatus, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      toast.success(`Status updated to ${variables.newStatus}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status');
    },
  });
}

/**
 * Enroll learner
 */
export function useEnrollLearner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      enrollmentData,
    }: {
      id: string;
      enrollmentData: {
        semester_id: string;
        section_id: string;
        roll_number: string;
        college_email: string;
        academic_year_id?: string;
        regulation_id?: string;
        batch_id?: string;
        student_photo_url?: string;
      };
    }) => LearnerProfileService.enrollLearner(id, enrollmentData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      toast.success('Learner enrolled successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to enroll learner');
    },
  });
}

/**
 * Bulk update status
 */
export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ids,
      newStatus,
      reason,
    }: {
      ids: string[];
      newStatus: LifecycleStatus;
      reason?: string;
    }) => LearnerProfileService.bulkUpdateStatus(ids, newStatus, reason),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      toast.success(`Updated ${result.updated} learner(s). Failed: ${result.failed}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to bulk update');
    },
  });
}

/**
 * Delete learner profile
 */
export function useDeleteLearnerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LearnerProfileService.deleteLearnerProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      toast.success('Learner profile deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete learner profile');
    },
  });
}

/**
 * Get dashboard analytics
 */
export function useLearnerAnalytics(filters: {
  institution_id?: string;
  fromDate?: string;
  toDate?: string;
}) {
  return useQuery({
    queryKey: learnerProfileKeys.analytics(filters),
    queryFn: () => LearnerProfileService.getDashboardAnalytics(filters),
  });
}
```

#### 3.4 Feature Flag Configuration

**File:** `lib/config/feature-flags.ts`

```typescript
// Feature flags for gradual migration
export const FEATURE_FLAGS = {
  // Phase 3: Enable learner profiles module (default: false)
  USE_LEARNERS_PROFILES: process.env.NEXT_PUBLIC_USE_LEARNERS_PROFILES === 'true',

  // Per-module flags (granular control)
  LEARNERS_ENQUIRIES: process.env.NEXT_PUBLIC_LEARNERS_ENQUIRIES === 'true',
  LEARNERS_APPLICATIONS: process.env.NEXT_PUBLIC_LEARNERS_APPLICATIONS === 'true',
  LEARNERS_PROFILES: process.env.NEXT_PUBLIC_LEARNERS_PROFILES === 'true',
  LEARNERS_ALUMNI: process.env.NEXT_PUBLIC_LEARNERS_ALUMNI === 'true',
  LEARNERS_ANALYTICS: process.env.NEXT_PUBLIC_LEARNERS_ANALYTICS === 'true',
} as const;

// Helper to check if learners module should be used
export function useLearnerProfilesModule() {
  return FEATURE_FLAGS.USE_LEARNERS_PROFILES;
}
```

**Environment Variables (.env.local):**

```bash
# Phase 3 Feature Flags (Week 3-4)
NEXT_PUBLIC_USE_LEARNERS_PROFILES=false  # Start with false, enable gradually

# Granular flags (enable one at a time for testing)
NEXT_PUBLIC_LEARNERS_ENQUIRIES=false
NEXT_PUBLIC_LEARNERS_APPLICATIONS=false
NEXT_PUBLIC_LEARNERS_PROFILES=false
NEXT_PUBLIC_LEARNERS_ALUMNI=false
NEXT_PUBLIC_LEARNERS_ANALYTICS=false
```

#### 3.5 Create New Routes (Parallel to Existing)

**File Structure:**
```
app/(routes)/
├── admissions/           # Keep during migration
├── students/             # Keep during migration
└── learners/             # NEW - parallel routes
    ├── page.tsx          # Learner dashboard (redirect based on user role)
    ├── enquiries/
    │   ├── page.tsx      # List enquiries (lifecycle_status='enquiry' | 'pending')
    │   ├── new/
    │   │   └── page.tsx  # Create new enquiry
    │   └── [id]/
    │       ├── page.tsx  # View enquiry
    │       └── edit/
    │           └── page.tsx  # Edit enquiry
    ├── applications/
    │   ├── page.tsx      # List applications (lifecycle_status='approved' | 'waitlisted' | 'rejected')
    │   └── [id]/
    │       ├── page.tsx  # View application
    │       └── edit/
    │           └── page.tsx  # Process application (approve/reject/enroll)
    ├── profiles/
    │   ├── page.tsx      # List profiles (lifecycle_status='active' | 'inactive')
    │   ├── [id]/
    │   │   ├── page.tsx  # View profile
    │   │   └── edit/
    │   │       └── page.tsx  # Edit profile
    │   ├── bulk-edit/
    │   │   └── page.tsx  # Bulk edit profiles
    │   └── promotion/
    │       └── page.tsx  # Promote to next semester
    ├── alumni/
    │   ├── page.tsx      # List alumni (lifecycle_status='graduated' | 'exited')
    │   └── [id]/
    │       └── page.tsx  # View alumni profile
    └── analytics/
        └── page.tsx      # Unified analytics dashboard
```

#### 3.6 Update Sidebar Menu

**File:** `lib/sidebarMenuLinks.ts`

```typescript
// Add learners section (conditionally shown via feature flag)
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

export const sidebarMenuLinks = [
  // ... existing menu items ...

  // LEGACY ITEMS (Hide when learners module is enabled)
  ...(FEATURE_FLAGS.USE_LEARNERS_PROFILES
    ? []
    : [
        {
          title: 'Admissions',
          icon: UserPlus,
          roles: ['admin', 'admission_admin'],
          submenu: [
            { title: 'All Admissions', href: '/admissions' },
            { title: 'New Application', href: '/admissions/new' },
            { title: 'Analytics', href: '/admissions/analytics' },
          ],
        },
        {
          title: 'Students',
          icon: Users,
          roles: ['admin', 'academic_admin'],
          submenu: [
            { title: 'All Students', href: '/students' },
            { title: 'Graduated', href: '/students/graduated' },
            { title: 'Dashboard', href: '/students/dashboard' },
          ],
        },
      ]),

  // NEW LEARNERS MODULE (Show when enabled)
  ...(FEATURE_FLAGS.USE_LEARNERS_PROFILES
    ? [
        {
          title: 'Learners',
          icon: GraduationCap,
          roles: ['admin', 'admission_admin', 'academic_admin'],
          submenu: [
            { title: 'Enquiries', href: '/learners/enquiries' },
            { title: 'Applications', href: '/learners/applications' },
            { title: 'Profiles', href: '/learners/profiles' },
            { title: 'Alumni', href: '/learners/alumni' },
            { title: 'Analytics', href: '/learners/analytics' },
          ],
        },
      ]
    : []),
];
```

#### 3.7 Module-by-Module Migration Schedule

| Week | Module | Description | Feature Flag |
|------|--------|-------------|--------------|
| **Week 3** | Enquiries | New enquiry form + listing | `LEARNERS_ENQUIRIES` |
| | Analytics | Unified dashboard | `LEARNERS_ANALYTICS` |
| **Week 4** | Applications | Application processing (approve/reject/enroll) | `LEARNERS_APPLICATIONS` |
| | Profiles | Active student management | `LEARNERS_PROFILES` |
| | Alumni | Graduated/exited learners | `LEARNERS_ALUMNI` |

**Testing Protocol for Each Module:**
1. Enable feature flag for module
2. Test CRUD operations (Create, Read, Update, Delete)
3. Test filters and search
4. Verify data shows correctly from learners_profiles table
5. Check RLS policies (institution access, role-based permissions)
6. Test status transitions
7. Verify backward compatibility (old routes still work via VIEWs)
8. Rollback if critical issues found

#### 3.8 Rollback Plan (Phase 3)

```bash
# Disable feature flags
NEXT_PUBLIC_USE_LEARNERS_PROFILES=false
NEXT_PUBLIC_LEARNERS_ENQUIRIES=false
NEXT_PUBLIC_LEARNERS_APPLICATIONS=false
NEXT_PUBLIC_LEARNERS_PROFILES=false
NEXT_PUBLIC_LEARNERS_ALUMNI=false
NEXT_PUBLIC_LEARNERS_ANALYTICS=false

# Redeploy application
# Old routes automatically take over (VIEWs still active)
# No data loss, users see old UI
```

**Deliverables:**
- ✅ LearnerProfileService created
- ✅ React Query hooks created
- ✅ Feature flags configured
- ✅ Parallel routes created (/learners)
- ✅ Sidebar updated with conditional display
- ✅ Module-by-module migration complete
- ✅ All modules tested with feature flags

---

### Phase 4: Foreign Key Migration (Week 5)

**Objective:** Migrate foreign keys from student_id to learner_profile_id in dependent tables.

#### 4.1 Dependent Tables Inventory

| Table | FK Column | References | Record Count | Migration Priority |
|-------|-----------|------------|--------------|-------------------|
| billing_receipts | student_id | students.id | 57 | High (active module) |
| billing_student_bills | student_id | students.id | 32 | High (active module) |
| billing_invoices | student_id | students.id | 0 | Medium |
| payment_transactions | student_id | students.id | Unknown | High |
| student_attendance | student_id | students.id | Unknown | High (active module) |

#### 4.2 Add Shadow Columns

**File:** `supabase/migrations/20250127_add_learner_profile_fk_shadow_columns.sql`

```sql
-- Updated: 2025-01-27 - Add learner_profile_id shadow columns to dependent tables
-- Purpose: Gradual FK migration without breaking existing queries

-- billing_receipts
ALTER TABLE billing_receipts
ADD COLUMN learner_profile_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_billing_receipts_learner_profile_id ON billing_receipts(learner_profile_id);

COMMENT ON COLUMN billing_receipts.learner_profile_id IS 'New FK to learners_profiles. Migrating from student_id.';

-- billing_student_bills
ALTER TABLE billing_student_bills
ADD COLUMN learner_profile_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_billing_student_bills_learner_profile_id ON billing_student_bills(learner_profile_id);

-- billing_invoices
ALTER TABLE billing_invoices
ADD COLUMN learner_profile_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_billing_invoices_learner_profile_id ON billing_invoices(learner_profile_id);

-- payment_transactions
ALTER TABLE payment_transactions
ADD COLUMN learner_profile_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_payment_transactions_learner_profile_id ON payment_transactions(learner_profile_id);

-- student_attendance
ALTER TABLE student_attendance
ADD COLUMN learner_profile_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_student_attendance_learner_profile_id ON student_attendance(learner_profile_id);
```

#### 4.3 Populate Shadow Columns

```sql
-- Populate learner_profile_id from student_id
UPDATE billing_receipts
SET learner_profile_id = (
  SELECT id FROM learners_profiles
  WHERE original_student_id = billing_receipts.student_id
)
WHERE student_id IS NOT NULL;

UPDATE billing_student_bills
SET learner_profile_id = (
  SELECT id FROM learners_profiles
  WHERE original_student_id = billing_student_bills.student_id
)
WHERE student_id IS NOT NULL;

UPDATE billing_invoices
SET learner_profile_id = (
  SELECT id FROM learners_profiles
  WHERE original_student_id = billing_invoices.student_id
)
WHERE student_id IS NOT NULL;

UPDATE payment_transactions
SET learner_profile_id = (
  SELECT id FROM learners_profiles
  WHERE original_student_id = payment_transactions.student_id
)
WHERE student_id IS NOT NULL;

UPDATE student_attendance
SET learner_profile_id = (
  SELECT id FROM learners_profiles
  WHERE original_student_id = student_attendance.student_id
)
WHERE student_id IS NOT NULL;

-- Verify all student_id have corresponding learner_profile_id
SELECT
  'billing_receipts' as table_name,
  COUNT(*) as total,
  COUNT(learner_profile_id) as migrated,
  COUNT(*) - COUNT(learner_profile_id) as missing
FROM billing_receipts
WHERE student_id IS NOT NULL

UNION ALL

SELECT
  'billing_student_bills',
  COUNT(*),
  COUNT(learner_profile_id),
  COUNT(*) - COUNT(learner_profile_id)
FROM billing_student_bills
WHERE student_id IS NOT NULL

UNION ALL

SELECT
  'billing_invoices',
  COUNT(*),
  COUNT(learner_profile_id),
  COUNT(*) - COUNT(learner_profile_id)
FROM billing_invoices
WHERE student_id IS NOT NULL

UNION ALL

SELECT
  'payment_transactions',
  COUNT(*),
  COUNT(learner_profile_id),
  COUNT(*) - COUNT(learner_profile_id)
FROM payment_transactions
WHERE student_id IS NOT NULL

UNION ALL

SELECT
  'student_attendance',
  COUNT(*),
  COUNT(learner_profile_id),
  COUNT(*) - COUNT(learner_profile_id)
FROM student_attendance
WHERE student_id IS NOT NULL;

-- Expected: missing = 0 for all tables
```

#### 4.4 Update Service Queries (Gradual)

Update services to use learner_profile_id while keeping student_id as fallback:

```typescript
// Example: BillingService
static async getStudentBills(studentId: string) {
  const { data, error } = await this.supabase
    .from('billing_student_bills')
    .select('*')
    .or(`student_id.eq.${studentId},learner_profile_id.eq.${studentId}`); // Support both FKs

  // ...
}
```

#### 4.5 Rollback Plan (Phase 4)

```sql
-- Remove shadow columns if issues found
ALTER TABLE billing_receipts DROP COLUMN IF EXISTS learner_profile_id;
ALTER TABLE billing_student_bills DROP COLUMN IF EXISTS learner_profile_id;
ALTER TABLE billing_invoices DROP COLUMN IF EXISTS learner_profile_id;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS learner_profile_id;
ALTER TABLE student_attendance DROP COLUMN IF EXISTS learner_profile_id;

-- All queries continue to use student_id
-- No functionality loss
```

**Deliverables:**
- ✅ Shadow columns added to all dependent tables
- ✅ learner_profile_id populated (100% match to student_id)
- ✅ Dual FK support in services
- ✅ Verification complete (0 missing FKs)

---

### Phase 5: Cleanup & Archive (Week 6)

**Objective:** Complete cutover, archive legacy tables, remove compatibility layer.

#### 5.1 Final Verification

```sql
-- Verify all systems using learner_profile_id
SELECT
  schemaname,
  tablename,
  attname as column_name
FROM pg_attribute
JOIN pg_class ON pg_attribute.attrelid = pg_class.oid
JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
WHERE attname IN ('student_id', 'admission_id', 'learner_profile_id')
  AND schemaname = 'public'
ORDER BY tablename, attname;

-- Check for any remaining queries using admissions_legacy or students_legacy
-- (Review application logs for VIEW usage)
```

#### 5.2 Remove Compatibility VIEWs

```sql
-- Updated: 2025-02-03 - Remove compatibility VIEWs (migration complete)

-- Drop INSTEAD OF triggers first
DROP TRIGGER IF EXISTS admissions_instead_of_insert ON admissions CASCADE;
DROP TRIGGER IF EXISTS admissions_instead_of_update ON admissions CASCADE;
DROP TRIGGER IF EXISTS students_instead_of_insert ON students CASCADE;
DROP TRIGGER IF EXISTS students_instead_of_update ON students CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS admissions_view_insert() CASCADE;
DROP FUNCTION IF EXISTS admissions_view_update() CASCADE;
DROP FUNCTION IF EXISTS students_view_insert() CASCADE;
DROP FUNCTION IF EXISTS students_view_update() CASCADE;

-- Drop views
DROP VIEW IF EXISTS admissions CASCADE;
DROP VIEW IF EXISTS students CASCADE;
```

#### 5.3 Archive Legacy Tables

```sql
-- Rename legacy tables with timestamp
ALTER TABLE admissions_legacy RENAME TO admissions_archived_20250203;
ALTER TABLE students_legacy RENAME TO students_archived_20250203;

-- Update comments
COMMENT ON TABLE admissions_archived_20250203 IS 'ARCHIVED: 2025-02-03. Replaced by learners_profiles. Safe to drop after 90 days (2025-05-04).';
COMMENT ON TABLE students_archived_20250203 IS 'ARCHIVED: 2025-02-03. Replaced by learners_profiles. Safe to drop after 90 days (2025-05-04).';

-- Revoke public access (admin only)
REVOKE ALL ON admissions_archived_20250203 FROM PUBLIC;
REVOKE ALL ON students_archived_20250203 FROM PUBLIC;
GRANT SELECT ON admissions_archived_20250203 TO authenticated; -- Read-only access for audit
GRANT SELECT ON students_archived_20250203 TO authenticated;
```

#### 5.4 Remove Old Services & Routes

**Files to Remove:**
```bash
# Services
rm -rf lib/services/admission/
rm -rf lib/services/student/

# Hooks
rm -rf hooks/admission/
rm -rf hooks/student/

# Routes (after traffic validation)
# Keep for 1 week with redirect, then remove
# rm -rf app/(routes)/admissions/
# rm -rf app/(routes)/students/

# Types (after confirming no imports)
# rm types/admission.ts
# rm types/student.ts
```

**Add Redirects (Temporary - 1 week):**

**File:** `app/(routes)/admissions/page.tsx`

```typescript
// Redirect to learners/enquiries
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdmissionsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/learners/enquiries');
  }, [router]);

  return <div>Redirecting to Learners module...</div>;
}
```

Similar redirects for all admission/student routes.

#### 5.5 Update Documentation

**Files to Update:**
- ✅ Update SQL_FILE_INDEX.md with learners_profiles table
- ✅ Update DOCUMENTATION_INDEX.md with new learners module docs
- ✅ Archive admission/student module docs
- ✅ Update README.md with new module structure
- ✅ Update API documentation (if applicable)

#### 5.6 Final Cleanup Checklist

- [ ] All feature flags enabled (USE_LEARNERS_PROFILES=true)
- [ ] All modules migrated and tested
- [ ] All foreign keys using learner_profile_id
- [ ] Legacy VIEWs dropped
- [ ] Legacy tables archived
- [ ] Old services/hooks removed
- [ ] Redirects in place
- [ ] Documentation updated
- [ ] Team trained on new module
- [ ] Rollback plan documented

#### 5.7 Schedule Legacy Table Deletion

**Calendar Reminder: 2025-05-04 (90 days after archive)**

```sql
-- After 90 days, if no issues reported:
DROP TABLE IF EXISTS admissions_archived_20250203 CASCADE;
DROP TABLE IF EXISTS students_archived_20250203 CASCADE;

-- Confirm deletion
SELECT schemaname, tablename
FROM pg_tables
WHERE tablename LIKE '%admission%' OR tablename LIKE '%student%'
ORDER BY tablename;

-- Should only show: learners_profiles, student_attendance (attendance module)
```

**Deliverables:**
- ✅ Compatibility VIEWs removed
- ✅ Legacy tables archived (90-day retention)
- ✅ Old code removed
- ✅ Redirects in place
- ✅ Documentation updated
- ✅ Deletion scheduled

---

## 4. Safety & Rollback Procedures

### 4.1 Emergency Rollback Matrix

| Phase | Rollback Complexity | Downtime | Data Loss Risk | Steps |
|-------|---------------------|----------|----------------|-------|
| **Phase 1** | Low | None | None | Drop learners_profiles table |
| **Phase 2** | Low | None | None | Drop VIEWs, rename _legacy tables back |
| **Phase 3** | Medium | None | None | Disable feature flags, redeploy |
| **Phase 4** | Medium | None | None | Drop shadow columns, revert services |
| **Phase 5** | High | Potential | None (archived) | Restore VIEWs, rename archived tables |

### 4.2 Rollback Decision Tree

```
Issue Detected
     │
     ▼
Is data corrupted or missing?
     │
     ├─ YES ──→ IMMEDIATE ROLLBACK (highest priority)
     │          Execute Phase-specific rollback procedure
     │          Investigate root cause
     │          Fix before retrying
     │
     └─ NO
         │
         ▼
    Is functionality broken?
         │
         ├─ YES ──→ Can it be hotfixed within 1 hour?
         │          │
         │          ├─ YES ──→ Deploy hotfix, monitor
         │          │
         │          └─ NO ──→ ROLLBACK
         │                     Schedule fix for next phase
         │
         └─ NO
             │
             ▼
        Is performance degraded >20%?
             │
             ├─ YES ──→ Investigate, optimize if quick
             │          Otherwise ROLLBACK
             │
             └─ NO ──→ MONITOR, continue migration
```

### 4.3 Monitoring & Alerts

**Metrics to Track:**
```typescript
// Phase 2-5 monitoring
const CRITICAL_METRICS = {
  // Data consistency
  learnerProfileCount: 'SELECT COUNT(*) FROM learners_profiles',
  legacyAdmissionCount: 'SELECT COUNT(*) FROM admissions_legacy',
  legacyStudentCount: 'SELECT COUNT(*) FROM students_legacy',
  orphanedRecords: 'Check for records in learners_profiles without original_admission_id or original_student_id',

  // Query performance
  avgQueryTime: 'Track query execution time for getLearnerProfiles()',
  viewQueryTime: 'Track query time through VIEWs vs direct table',

  // Foreign key integrity
  fkMismatches: 'Count records where student_id exists but learner_profile_id is NULL',

  // Feature flag usage
  viewAccessCount: 'Track hits to admissions/students VIEWs',
  newRouteAccessCount: 'Track hits to /learners routes',

  // Error rate
  serviceErrors: 'Track LearnerProfileService error rate',
  dbErrors: 'Track database constraint violations',
};
```

**Alert Thresholds:**
- ⚠️ WARNING: Query time >2x baseline
- 🚨 CRITICAL: Data count mismatch >1%
- 🚨 CRITICAL: FK integrity issues >0
- 🚨 CRITICAL: Service error rate >5%

---

## 5. Module Implementation

### 5.1 Example: Enquiries Module

**File:** `app/(routes)/learners/enquiries/page.tsx`

```typescript
'use client';

import { useLearnerProfiles } from '@/hooks/learner/use-learner-profiles';
import { DataTable } from '@/components/ui/data-table';
import { learnerEnquiryColumns } from './_components/learner-enquiry-columns';
import { LearnerEnquiryFilters } from './_components/learner-enquiry-filters';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function LearnersEnquiriesPage() {
  const [filters, setFilters] = useState({
    lifecycle_status: ['enquiry', 'pending'] as const,
    page: 1,
    limit: 50,
  });

  const { data, isLoading } = useLearnerProfiles(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enquiries</h1>
          <p className="text-muted-foreground">
            Manage admission enquiries and applications
          </p>
        </div>

        <Button asChild>
          <Link href="/learners/enquiries/new">
            <Plus className="mr-2 h-4 w-4" />
            New Enquiry
          </Link>
        </Button>
      </div>

      <LearnerEnquiryFilters filters={filters} onFiltersChange={setFilters} />

      <DataTable
        columns={learnerEnquiryColumns}
        data={data?.data || []}
        isLoading={isLoading}
        pagination={data?.metadata}
        onPaginationChange={(page) => setFilters({ ...filters, page })}
      />
    </div>
  );
}
```

### 5.2 Status Badge Component

**File:** `components/learners/lifecycle-status-badge.tsx`

```typescript
import { Badge } from '@/components/ui/badge';
import type { LifecycleStatus } from '@/types/learner-profile';

interface LifecycleStatusBadgeProps {
  status: LifecycleStatus;
}

const statusConfig: Record<
  LifecycleStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }
> = {
  enquiry: { label: 'Enquiry', variant: 'outline' },
  pending: { label: 'Pending', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  waitlisted: { label: 'Waitlisted', variant: 'secondary' },
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'secondary' },
  exited: { label: 'Exited', variant: 'destructive' },
  graduated: { label: 'Graduated', variant: 'default' },
  alumni: { label: 'Alumni', variant: 'outline' },
};

export function LifecycleStatusBadge({ status }: LifecycleStatusBadgeProps) {
  const config = statusConfig[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

**File:** `lib/services/learners/__tests__/learner-profile-service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearnerProfileService } from '../learner-profile-service';
import type { CreateLearnerProfileDto } from '@/types/learner-profile';

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    })),
  }),
}));

describe('LearnerProfileService', () => {
  describe('createLearnerProfile', () => {
    it('should create learner profile with default enquiry status', async () => {
      const mockData: CreateLearnerProfileDto = {
        first_name: 'John',
        last_name: 'Doe',
        father_name: 'James Doe',
        mother_name: 'Jane Doe',
        // ... other required fields
        lifecycle_status: 'enquiry',
      };

      const result = await LearnerProfileService.createLearnerProfile(mockData);

      expect(result).toBeDefined();
      expect(result.lifecycle_status).toBe('enquiry');
    });
  });

  describe('updateLifecycleStatus', () => {
    it('should validate status transitions', async () => {
      // Test invalid transition (rejected -> active)
      await expect(
        LearnerProfileService.updateLifecycleStatus('test-id', 'active')
      ).rejects.toThrow('Invalid status transition');
    });

    it('should allow valid transitions', async () => {
      // Test valid transition (pending -> approved)
      const result = await LearnerProfileService.updateLifecycleStatus(
        'test-id',
        'approved'
      );

      expect(result.lifecycle_status).toBe('approved');
    });
  });
});
```

### 6.2 Integration Tests

**Test Scenarios:**

1. **Data Migration Integrity**
   ```sql
   -- Test: All admissions migrated
   -- Test: All students migrated
   -- Test: Merged records have both original IDs
   -- Test: No duplicate application_ids
   ```

2. **View Compatibility**
   ```sql
   -- Test: INSERT through admissions VIEW creates learner_profile
   -- Test: UPDATE through students VIEW updates learner_profile
   -- Test: SELECT from admissions VIEW returns correct status mapping
   ```

3. **Service Layer**
   ```typescript
   // Test: createLearnerProfile with all statuses
   // Test: updateLifecycleStatus with valid transitions
   // Test: enrollLearner creates auth profile
   // Test: bulkUpdateStatus handles partial failures
   ```

4. **UI/UX**
   ```typescript
   // Test: Enquiry form submission creates record with status='enquiry'
   // Test: Status badge shows correct color
   // Test: Filters work correctly
   // Test: Pagination works
   // Test: Search across multiple fields
   ```

### 6.3 Performance Tests

**Benchmarks:**

| Query | Current (2 tables) | Target (1 table) | Improvement |
|-------|-------------------|------------------|-------------|
| List all learners | 450ms | <300ms | 33% faster |
| Get single learner | 120ms | <100ms | 17% faster |
| Analytics query | 850ms | <500ms | 41% faster |
| Status update | 200ms | <150ms | 25% faster |

**Load Testing:**
```bash
# Use k6 or Artillery for load testing
# Simulate 100 concurrent users
# Test: List learners, create, update, delete
# Target: <500ms p95, <1000ms p99
```

### 6.4 Rollback Tests

**Quarterly Rollback Drills:**

1. **Phase 2 Rollback Drill** (Every 3 months)
   - Drop VIEWs
   - Rename legacy tables back
   - Verify all old routes work
   - Time to recovery: <5 minutes

2. **Phase 3 Rollback Drill**
   - Disable feature flags
   - Redeploy
   - Verify users see old UI
   - Time to recovery: <10 minutes

3. **Phase 4 Rollback Drill**
   - Drop shadow columns
   - Revert service queries
   - Verify billing still works
   - Time to recovery: <15 minutes

---

## 7. Deployment Checklist

### Pre-Deployment (Day Before Each Phase)

- [ ] Code review completed
- [ ] All tests passing (unit + integration)
- [ ] Performance benchmarks met
- [ ] Database migration tested on staging
- [ ] Rollback procedure tested on staging
- [ ] Team trained on new features
- [ ] Documentation updated
- [ ] Communication sent to users (if UI changes)
- [ ] Monitoring dashboards configured
- [ ] Alert thresholds set

### Deployment Day

**Phase 1 (Week 1):**
- [ ] Backup production database
- [ ] Run migration script: `20250116_create_learners_profiles.sql`
- [ ] Verify migration: All 3,506 records migrated
- [ ] Run verification queries (Section 3.1.3)
- [ ] Monitor for 24 hours

**Phase 2 (Week 2):**
- [ ] Deploy VIEW migration: `20250120_create_compatibility_views.sql`
- [ ] Verify INSTEAD OF triggers working
- [ ] Test: INSERT/UPDATE through VIEWs
- [ ] Rename original tables to _legacy
- [ ] Monitor VIEW query performance
- [ ] Verify billing/attendance modules work unchanged

**Phase 3 (Week 3-4):**
- [ ] Deploy new services + hooks
- [ ] Deploy new routes (/learners)
- [ ] Enable feature flag: `LEARNERS_ENQUIRIES=true` (Day 1)
- [ ] Monitor for issues (2 days)
- [ ] Enable `LEARNERS_APPLICATIONS=true` (Day 3)
- [ ] Monitor (2 days)
- [ ] Enable `LEARNERS_PROFILES=true` (Day 5)
- [ ] Monitor (2 days)
- [ ] Enable `LEARNERS_ALUMNI=true` + `LEARNERS_ANALYTICS=true` (Day 7)
- [ ] Full module enabled by end of Week 4

**Phase 4 (Week 5):**
- [ ] Deploy shadow column migration: `20250127_add_learner_profile_fk_shadow_columns.sql`
- [ ] Populate shadow columns
- [ ] Verify 100% FK population
- [ ] Update service queries to use learner_profile_id
- [ ] Monitor foreign key performance

**Phase 5 (Week 6):**
- [ ] Drop compatibility VIEWs
- [ ] Archive legacy tables
- [ ] Remove old services/hooks/routes
- [ ] Add redirects
- [ ] Update documentation
- [ ] Schedule legacy table deletion (90 days)
- [ ] Celebrate successful migration! 🎉

### Post-Deployment (24 hours after each phase)

- [ ] Verify no errors in logs
- [ ] Check monitoring dashboards
- [ ] Review performance metrics
- [ ] User feedback collected
- [ ] Update status in project tracker

---

## 8. Appendix: SQL Scripts

### Appendix A: Complete Migration Script

See `supabase/migrations/20250116_create_learners_profiles.sql` for complete table creation and migration function.

### Appendix B: Verification Queries

**Data Integrity Checks:**
```sql
-- Check for missing migrations
SELECT 'admissions not migrated' as issue, COUNT(*) as count
FROM admissions a
LEFT JOIN learners_profiles lp ON lp.original_admission_id = a.id
WHERE lp.id IS NULL

UNION ALL

SELECT 'students not migrated', COUNT(*)
FROM students s
LEFT JOIN learners_profiles lp ON lp.original_student_id = s.id
WHERE lp.id IS NULL

UNION ALL

SELECT 'duplicate application_ids', COUNT(*)
FROM (
  SELECT application_id, COUNT(*) as cnt
  FROM learners_profiles
  WHERE application_id IS NOT NULL
  GROUP BY application_id
  HAVING COUNT(*) > 1
) dups;

-- Should return 0 for all
```

**Performance Checks:**
```sql
-- Analyze query plan
EXPLAIN ANALYZE
SELECT *
FROM learners_profiles
WHERE institution_id = 'test-id'
  AND lifecycle_status = 'active'
ORDER BY created_at DESC
LIMIT 50;

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'learners_profiles'
ORDER BY idx_scan DESC;
```

### Appendix C: RLS Policy Templates

```sql
-- Template for institution-based access
CREATE POLICY "policy_name" ON learners_profiles
FOR SELECT
USING (
  institution_id IN (
    SELECT institution_id
    FROM user_institution_access
    WHERE user_id = auth.uid()
  )
);

-- Template for role-based access
CREATE POLICY "policy_name" ON learners_profiles
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = ANY(ARRAY['admin', 'super_admin'])
  )
);

-- Template for self-access
CREATE POLICY "policy_name" ON learners_profiles
FOR SELECT
USING (
  college_email = (SELECT email FROM profiles WHERE id = auth.uid())
);
```

### Appendix D: Useful Queries for Admins

```sql
-- Get lifecycle status distribution
SELECT lifecycle_status, COUNT(*) as count, ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM learners_profiles
GROUP BY lifecycle_status
ORDER BY count DESC;

-- Get conversion funnel
SELECT
  COUNT(*) FILTER (WHERE lifecycle_status IN ('enquiry', 'pending')) as enquiries,
  COUNT(*) FILTER (WHERE lifecycle_status IN ('approved', 'waitlisted')) as applications,
  COUNT(*) FILTER (WHERE lifecycle_status IN ('active', 'inactive')) as enrolled,
  COUNT(*) FILTER (WHERE lifecycle_status = 'graduated') as graduated,
  ROUND(COUNT(*) FILTER (WHERE lifecycle_status IN ('active', 'inactive'))::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE lifecycle_status IN ('enquiry', 'pending')), 0) * 100, 2) as conversion_rate
FROM learners_profiles;

-- Find incomplete profiles
SELECT id, first_name, last_name, application_id, lifecycle_status, is_profile_complete
FROM learners_profiles
WHERE lifecycle_status = 'active'
  AND is_profile_complete = false
ORDER BY created_at DESC;

-- Migration source breakdown
SELECT migration_source, COUNT(*) as count
FROM learners_profiles
GROUP BY migration_source;
```

---

## Summary & Next Steps

### Implementation Timeline Summary

| Phase | Week | Key Deliverables | Success Criteria |
|-------|------|-----------------|------------------|
| **Phase 1** | Week 1 | learners_profiles table + data migration | 3,506 records migrated, 0 data loss |
| **Phase 2** | Week 2 | Compatibility VIEWs + archive legacy tables | All old queries work, VIEWs tested |
| **Phase 3** | Week 3-4 | New services, hooks, routes with feature flags | All modules working, users transitioned |
| **Phase 4** | Week 5 | Foreign key migration with shadow columns | 100% FK migrated, dependent modules work |
| **Phase 5** | Week 6 | Cleanup + archive + documentation | VIEWs dropped, legacy archived, docs updated |

### Risk Mitigation Summary

✅ **Zero Downtime:** Phased approach with parallel systems
✅ **Data Safety:** Multiple verification steps, rollback at each phase
✅ **Backward Compatibility:** VIEWs maintain old queries during transition
✅ **Gradual Adoption:** Feature flags allow per-module testing
✅ **Performance:** Unified table reduces JOIN complexity
✅ **Audit Trail:** original_admission_id + original_student_id preserve lineage

### Post-Migration Benefits

1. **Single Source of Truth:** No more data sync issues
2. **Simplified Queries:** One table instead of two with complex JOINs
3. **Better Analytics:** Unified lifecycle tracking from enquiry to alumni
4. **Cleaner Codebase:** One service instead of two
5. **Easier Maintenance:** Less code duplication
6. **Future-Proof:** Extensible status system for new workflows

### Support & Training

**Training Sessions (Week 5):**
- Session 1: Overview for all staff (1 hour)
- Session 2: Deep dive for admission staff (2 hours)
- Session 3: Deep dive for academic staff (2 hours)
- Session 4: Q&A and troubleshooting (1 hour)

**Support Channels:**
- Slack: #learners-migration-support
- Email: support@myjkkn.edu
- Documentation: /docs/modules/learners/

---

**Document Version:** 1.0
**Last Updated:** 2025-01-16
**Next Review:** 2025-02-15 (post-migration retrospective)
**Owner:** MyJKKN Development Team

---

**END OF IMPLEMENTATION PLAN**
