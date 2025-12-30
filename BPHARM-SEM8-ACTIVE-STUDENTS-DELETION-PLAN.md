# BPHARM Semester 8 ACTIVE Students Deletion - Implementation Plan

**Date**: December 30, 2025
**Status**: ⏳ **AWAITING APPROVAL**

---

## ⚠️ CRITICAL WARNING

**This operation will PERMANENTLY DELETE 107 ACTIVE student records across 3 tables.**

**Preserved**:
- 99 graduated students will be KEPT (not deleted)

**Deleted**:
- 107 active students only
- All associated auth accounts
- All profile data

**This action is IRREVERSIBLE without backup restoration.**

---

## Overview

### Scope
Delete ONLY ACTIVE BPHARM Semester 8 students from:
1. `auth.users` table (Supabase Auth) - 107 user accounts
2. `profiles` table - 107 profile records
3. `learners_profiles` table - 107 learner records

**Filter Criteria**: `lifecycle_status = 'active'`

### Affected Data

**Semester Details:**
- **Semester ID**: `a74396db-9f15-43e7-a8c3-cdfc185ac09b`
- **Program**: BPHARM
- **Semester**: Semester 8

**Student Breakdown:**
| Section | Active (DELETE) | Graduated (KEEP) | Total |
|---------|-----------------|------------------|-------|
| Batch A | 28 | 99 | 127 |
| Batch B | 15 | 0 | 15 |
| Batch C | 16 | 0 | 16 |
| Batch D | 16 | 0 | 16 |
| Batch E | 16 | 0 | 16 |
| Batch F | 16 | 0 | 16 |
| **TOTAL** | **107 (DELETE)** | **99 (KEEP)** | **206** |

---

## Database Analysis

### Foreign Key Relationships

**profiles.learner_id → learners_profiles.id**
- Constraint: `profiles_learner_id_fkey`
- Action: Must delete/nullify profiles.learner_id BEFORE deleting learners_profiles

### All Active Students Have Profiles
- Active learners: 107
- Have profiles: 107
- Missing profiles: 0

**✅ All active students have corresponding profile and auth records**

---

## Pre-Deletion Backup Strategy

### 1. Export Active Student Data (CSV)
```sql
-- Export ONLY ACTIVE students to CSV for backup
COPY (
  SELECT
    lp.*,
    p.email as profile_email,
    p.full_name as profile_full_name,
    p.role,
    sec.section_name,
    s.semester_name,
    pr.program_name
  FROM learners_profiles lp
  LEFT JOIN profiles p ON lp.college_email = p.email
  LEFT JOIN sections sec ON lp.section_id = sec.id
  LEFT JOIN semesters s ON lp.semester_id = s.id
  LEFT JOIN programs pr ON s.program_id = pr.id
  WHERE lp.semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
    AND lp.lifecycle_status = 'active'
  ORDER BY sec.section_name, lp.first_name
) TO '/tmp/bpharm_sem8_active_backup_2025-12-30.csv' WITH CSV HEADER;
```

### 2. Create Backup Tables
```sql
-- Backup ACTIVE learners_profiles only
CREATE TABLE IF NOT EXISTS learners_profiles_backup_bpharm_sem8_active AS
SELECT * FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lifecycle_status = 'active';

-- Backup profiles for ACTIVE students only
CREATE TABLE IF NOT EXISTS profiles_backup_bpharm_sem8_active AS
SELECT p.* FROM profiles p
WHERE p.email IN (
  SELECT college_email FROM learners_profiles
  WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
    AND lifecycle_status = 'active'
);
```

### 3. Verify Backup Counts
```sql
SELECT
  'learners_profiles_backup (active only)' as table_name,
  COUNT(*) as record_count
FROM learners_profiles_backup_bpharm_sem8_active
UNION ALL
SELECT
  'profiles_backup (active only)' as table_name,
  COUNT(*) as record_count
FROM profiles_backup_bpharm_sem8_active;
```

**Expected**: Both should return **107 records** (not 206!)

---

## Deletion Strategy

### Deletion Order (Critical!)

**MUST follow this order to avoid foreign key violations:**

1. **Step 1**: Delete from `auth.users` (Supabase Auth)
   - Delete 107 user accounts (ACTIVE students only)
   - Method: Use Supabase Admin API (auth.admin.deleteUser)
   - Note: This is SLOW (sequential, ~1-2 seconds per user)
   - Estimated time: 2-4 minutes

2. **Step 2**: Nullify `profiles.learner_id` references
   - Update 107 profiles to set learner_id = NULL
   - This breaks the FK relationship
   - Fast batch operation

3. **Step 3**: Delete from `profiles` table
   - Delete 107 profile records (ACTIVE students only)
   - Fast batch operation

4. **Step 4**: Delete from `learners_profiles` table
   - Delete 107 learner records (ACTIVE students only)
   - Fast batch operation

---

## Implementation Steps

### Phase 1: Pre-Deletion Verification ✅

1. **Count verification**
```sql
-- Verify 107 ACTIVE students exist
SELECT COUNT(*) FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lifecycle_status = 'active';

-- Verify 99 GRADUATED students will remain
SELECT COUNT(*) FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lifecycle_status = 'graduated';
```

**Expected**: 107 active, 99 graduated

2. **Sample data review**
```sql
-- Show first 10 ACTIVE records for verification
SELECT
  lp.college_email,
  lp.first_name,
  lp.last_name,
  lp.lifecycle_status,
  sec.section_name
FROM learners_profiles lp
JOIN sections sec ON lp.section_id = sec.id
WHERE lp.semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lp.lifecycle_status = 'active'
LIMIT 10;
```

### Phase 2: Create Backups ✅

1. Create backup tables (see SQL above)
2. Verify backup counts = **107** (not 206!)
3. Export CSV for offline backup

### Phase 3: Deletion Execution ⚠️

#### Step 1: Delete Auth Users (SLOW - Sequential)
```typescript
// Get emails of ACTIVE students only
const { data: activeStudents } = await supabaseAdmin
  .from('learners_profiles')
  .select('college_email')
  .eq('semester_id', 'a74396db-9f15-43e7-a8c3-cdfc185ac09b')
  .eq('lifecycle_status', 'active');

const emails = activeStudents.map(s => s.college_email);

// Delete auth users
const results = {
  success: 0,
  failed: 0,
  errors: []
};

for (const email of emails) {
  try {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const user = users.users.find(u => u.email === email);

    if (user) {
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      results.success++;
      console.log(`[${results.success}/${emails.length}] Deleted auth user: ${email}`);
    }
  } catch (error) {
    results.failed++;
    results.errors.push({ email, error: error.message });
  }
}
```

**Estimated Time**: 2-4 minutes for 107 users

#### Step 2: Nullify profiles.learner_id (FAST)
```sql
-- Update profiles to remove learner_id FK reference (ACTIVE students only)
UPDATE profiles
SET learner_id = NULL,
    updated_at = NOW()
WHERE email IN (
  SELECT college_email FROM learners_profiles
  WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
    AND lifecycle_status = 'active'
);
```

**Expected**: 107 rows updated

#### Step 3: Delete Profiles (FAST)
```sql
-- Delete profile records (ACTIVE students only)
DELETE FROM profiles
WHERE email IN (
  SELECT college_email FROM learners_profiles
  WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
    AND lifecycle_status = 'active'
);
```

**Expected**: 107 rows deleted

#### Step 4: Delete Learners (FAST)
```sql
-- Delete learner records (ACTIVE students only)
DELETE FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lifecycle_status = 'active';
```

**Expected**: 107 rows deleted

### Phase 4: Post-Deletion Verification ✅

1. **Verify ACTIVE students deleted**
```sql
-- Should return 0
SELECT COUNT(*) FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lifecycle_status = 'active';
```

2. **Verify GRADUATED students preserved**
```sql
-- Should return 99
SELECT COUNT(*) FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lifecycle_status = 'graduated';
```

3. **Verify profiles deleted**
```sql
-- Should return 0
SELECT COUNT(*) FROM profiles
WHERE email IN (
  SELECT college_email FROM learners_profiles_backup_bpharm_sem8_active
);
```

4. **Verify backup integrity**
```sql
-- Should return 107
SELECT COUNT(*) FROM learners_profiles_backup_bpharm_sem8_active;
SELECT COUNT(*) FROM profiles_backup_bpharm_sem8_active;
```

---

## Rollback Strategy

### If Deletion Needs to be Reversed

**⚠️ Note**: Auth users CANNOT be restored (must recreate with new passwords)

1. **Restore learners_profiles (active students)**
```sql
INSERT INTO learners_profiles
SELECT * FROM learners_profiles_backup_bpharm_sem8_active;
```

2. **Restore profiles (active students)**
```sql
INSERT INTO profiles
SELECT * FROM profiles_backup_bpharm_sem8_active
ON CONFLICT (id) DO NOTHING;
```

3. **Recreate auth users** (requires manual process)
- Use bulk upload with password generation
- Email students their new passwords

---

## Estimated Timeline

| Phase | Task | Duration |
|-------|------|----------|
| 1 | Pre-deletion verification | 2 minutes |
| 2 | Create backups | 2 minutes |
| 3.1 | Delete auth users (107) | 3-4 minutes |
| 3.2 | Nullify profiles.learner_id | 5 seconds |
| 3.3 | Delete profiles | 5 seconds |
| 3.4 | Delete learners_profiles | 5 seconds |
| 4 | Post-deletion verification | 2 minutes |
| **TOTAL** | **~9-11 minutes** |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Accidentally delete graduated students | Low | CRITICAL | Double-check lifecycle_status filter in ALL queries |
| FK constraint violation | Low | High | Follow deletion order strictly |
| Partial deletion failure | Medium | High | Transaction wrapping, verify each step |
| Backup restoration failure | Low | CRITICAL | Test backup integrity before deletion |
| Auth user deletion timeout | Medium | Medium | Sequential processing, log failures |

---

## Safety Checklist

Before proceeding, verify:

- [ ] **Backup created**: learners_profiles_backup_bpharm_sem8_active has **107 records** (not 206!)
- [ ] **Backup created**: profiles_backup_bpharm_sem8_active has **107 records** (not 206!)
- [ ] **CSV exported**: Offline backup file created
- [ ] **Filter verified**: ALL queries include `lifecycle_status = 'active'`
- [ ] **Count verified**: Exactly 107 ACTIVE students will be deleted
- [ ] **Graduated preserved**: 99 graduated students will remain
- [ ] **Approval obtained**: User confirmed deletion of ACTIVE students only
- [ ] **No production impact**: Understand this affects 107 active students

---

## Post-Deletion Actions

1. **Verify graduated students intact**
```sql
-- Should show 99 graduated students still exist
SELECT
  sec.section_name,
  COUNT(*) as graduated_count
FROM learners_profiles lp
JOIN sections sec ON lp.section_id = sec.id
WHERE lp.semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
  AND lp.lifecycle_status = 'graduated'
GROUP BY sec.section_name;
```

2. **Drop backup tables** (after verification)
```sql
DROP TABLE IF EXISTS learners_profiles_backup_bpharm_sem8_active;
DROP TABLE IF EXISTS profiles_backup_bpharm_sem8_active;
```

3. **Vacuum tables** (reclaim space)
```sql
VACUUM ANALYZE learners_profiles;
VACUUM ANALYZE profiles;
```

4. **Update documentation**
- Record deletion in changelog
- Update student count statistics

---

## Summary of Changes

**Before Deletion:**
- Total BPHARM Sem 8 students: 206
  - Active: 107
  - Graduated: 99

**After Deletion:**
- Total BPHARM Sem 8 students: 99
  - Active: 0 ✅ (deleted)
  - Graduated: 99 ✅ (preserved)

---

## Approval Required

**⚠️ STOP - DO NOT PROCEED WITHOUT EXPLICIT CONFIRMATION**

Please confirm:
1. You want to DELETE **ONLY the 107 ACTIVE students**
2. You want to KEEP the 99 graduated students
3. You understand auth accounts for active students will be permanently deleted
4. You have reviewed the active student list
5. You approve proceeding with deletion

**Type "CONFIRMED - DELETE 107 ACTIVE STUDENTS ONLY" to proceed.**

---

**Developer**: Claude Code
**Status**: Awaiting approval
**Risk Level**: CRITICAL - Permanent data deletion (107 active students only)
**Preserved**: 99 graduated students will NOT be deleted
