# BPHARM Semester 8 Student Records Deletion - Implementation Plan

**Date**: December 30, 2025
**Status**: ⏳ **AWAITING APPROVAL**

---

## ⚠️ CRITICAL WARNING

**This operation will PERMANENTLY DELETE 206 student records across 3 tables.**

**Impact**:
- 107 active students
- 99 graduated students
- All associated auth accounts
- All profile data

**This action is IRREVERSIBLE without backup restoration.**

---

## Overview

### Scope
Delete all BPHARM Semester 8 student records from:
1. `auth.users` table (Supabase Auth) - 206 user accounts
2. `profiles` table - 206 profile records
3. `learners_profiles` table - 206 learner records

### Affected Data

**Semester Details:**
- **Semester ID**: `a74396db-9f15-43e7-a8c3-cdfc185ac09b`
- **Program**: BPHARM
- **Semester**: Semester 8

**Student Breakdown:**
| Section | Active | Graduated | Total |
|---------|--------|-----------|-------|
| Batch A | 28 | 99 | 127 |
| Batch B | 15 | 0 | 15 |
| Batch C | 16 | 0 | 16 |
| Batch D | 16 | 0 | 16 |
| Batch E | 16 | 0 | 16 |
| Batch F | 16 | 0 | 16 |
| **TOTAL** | **107** | **99** | **206** |

---

## Database Analysis

### Foreign Key Relationships

**profiles.learner_id → learners_profiles.id**
- Constraint: `profiles_learner_id_fkey`
- Action: Must delete/nullify profiles.learner_id BEFORE deleting learners_profiles

### All Students Have Profiles
- Total learners: 206
- Have profiles: 206
- Missing profiles: 0

**✅ All students have corresponding profile and auth records**

---

## Pre-Deletion Backup Strategy

### 1. Export Student Data (CSV)
```sql
-- Export to CSV for backup
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
  ORDER BY sec.section_name, lp.first_name
) TO '/tmp/bpharm_sem8_backup_2025-12-30.csv' WITH CSV HEADER;
```

### 2. Create Backup Tables
```sql
-- Backup learners_profiles
CREATE TABLE IF NOT EXISTS learners_profiles_backup_bpharm_sem8 AS
SELECT * FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b';

-- Backup profiles
CREATE TABLE IF NOT EXISTS profiles_backup_bpharm_sem8 AS
SELECT p.* FROM profiles p
WHERE p.email IN (
  SELECT college_email FROM learners_profiles
  WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
);
```

### 3. Verify Backup Counts
```sql
SELECT
  'learners_profiles_backup' as table_name,
  COUNT(*) as record_count
FROM learners_profiles_backup_bpharm_sem8
UNION ALL
SELECT
  'profiles_backup' as table_name,
  COUNT(*) as record_count
FROM profiles_backup_bpharm_sem8;
```

**Expected**: Both should return 206 records

---

## Deletion Strategy

### Deletion Order (Critical!)

**MUST follow this order to avoid foreign key violations:**

1. **Step 1**: Delete from `auth.users` (Supabase Auth)
   - Delete 206 user accounts
   - Method: Use Supabase Admin API (auth.admin.deleteUser)
   - Note: This is SLOW (sequential, ~1-2 seconds per user)
   - Estimated time: 3-7 minutes

2. **Step 2**: Nullify `profiles.learner_id` references
   - Update 206 profiles to set learner_id = NULL
   - This breaks the FK relationship
   - Fast batch operation

3. **Step 3**: Delete from `profiles` table
   - Delete 206 profile records
   - Fast batch operation

4. **Step 4**: Delete from `learners_profiles` table
   - Delete 206 learner records
   - Fast batch operation

---

## Implementation Steps

### Phase 1: Pre-Deletion Verification ✅

1. **Count verification**
```sql
-- Verify 206 students exist
SELECT COUNT(*) FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b';
```

2. **Sample data review**
```sql
-- Show first 10 records for verification
SELECT
  lp.college_email,
  lp.first_name,
  lp.last_name,
  lp.lifecycle_status,
  sec.section_name
FROM learners_profiles lp
JOIN sections sec ON lp.section_id = sec.id
WHERE lp.semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
LIMIT 10;
```

### Phase 2: Create Backups ✅

1. Create backup tables (see SQL above)
2. Verify backup counts = 206
3. Export CSV for offline backup

### Phase 3: Deletion Execution ⚠️

#### Step 1: Delete Auth Users (SLOW - Sequential)
```typescript
// Service function to delete auth users
async function deleteAuthUsers(emails: string[]) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const email of emails) {
    try {
      // Get user by email
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const user = users.users.find(u => u.email === email);

      if (user) {
        // Delete auth user
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        results.success++;
      }
    } catch (error) {
      results.failed++;
      results.errors.push({ email, error: error.message });
    }
  }

  return results;
}
```

**Estimated Time**: 3-7 minutes for 206 users

#### Step 2: Nullify profiles.learner_id (FAST)
```sql
-- Update profiles to remove learner_id FK reference
UPDATE profiles
SET learner_id = NULL,
    updated_at = NOW()
WHERE email IN (
  SELECT college_email FROM learners_profiles
  WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
);
```

**Expected**: 206 rows updated

#### Step 3: Delete Profiles (FAST)
```sql
-- Delete profile records
DELETE FROM profiles
WHERE email IN (
  SELECT college_email FROM learners_profiles
  WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
);
```

**Expected**: 206 rows deleted

#### Step 4: Delete Learners (FAST)
```sql
-- Delete learner records
DELETE FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b';
```

**Expected**: 206 rows deleted

### Phase 4: Post-Deletion Verification ✅

1. **Verify all deletions**
```sql
-- Should return 0
SELECT COUNT(*) FROM learners_profiles
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b';

-- Should return 0
SELECT COUNT(*) FROM profiles
WHERE email IN (
  SELECT college_email FROM learners_profiles_backup_bpharm_sem8
);
```

2. **Verify backup integrity**
```sql
-- Should return 206
SELECT COUNT(*) FROM learners_profiles_backup_bpharm_sem8;
SELECT COUNT(*) FROM profiles_backup_bpharm_sem8;
```

---

## Rollback Strategy

### If Deletion Needs to be Reversed

**⚠️ Note**: Auth users CANNOT be restored (must recreate with new passwords)

1. **Restore learners_profiles**
```sql
INSERT INTO learners_profiles
SELECT * FROM learners_profiles_backup_bpharm_sem8;
```

2. **Restore profiles**
```sql
INSERT INTO profiles
SELECT * FROM profiles_backup_bpharm_sem8
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
| 2 | Create backups | 3 minutes |
| 3.1 | Delete auth users (206) | 5-7 minutes |
| 3.2 | Nullify profiles.learner_id | 10 seconds |
| 3.3 | Delete profiles | 10 seconds |
| 3.4 | Delete learners_profiles | 10 seconds |
| 4 | Post-deletion verification | 2 minutes |
| **TOTAL** | **~12-15 minutes** |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Accidental deletion | Medium | CRITICAL | Require explicit confirmation, backup first |
| FK constraint violation | Low | High | Follow deletion order strictly |
| Partial deletion failure | Medium | High | Transaction wrapping, verify each step |
| Backup restoration failure | Low | CRITICAL | Test backup integrity before deletion |
| Auth user deletion timeout | Medium | Medium | Sequential processing, log failures |

---

## Safety Checklist

Before proceeding, verify:

- [ ] **Backup created**: learners_profiles_backup_bpharm_sem8 has 206 records
- [ ] **Backup created**: profiles_backup_bpharm_sem8 has 206 records
- [ ] **CSV exported**: Offline backup file created
- [ ] **Semester verified**: Confirmed semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b'
- [ ] **Count verified**: Exactly 206 students will be deleted
- [ ] **Approval obtained**: User confirmed deletion
- [ ] **No production impact**: Understand this affects 107 active + 99 graduated students

---

## Post-Deletion Actions

1. **Drop backup tables** (after verification)
```sql
DROP TABLE IF EXISTS learners_profiles_backup_bpharm_sem8;
DROP TABLE IF EXISTS profiles_backup_bpharm_sem8;
```

2. **Vacuum tables** (reclaim space)
```sql
VACUUM ANALYZE learners_profiles;
VACUUM ANALYZE profiles;
```

3. **Update documentation**
- Record deletion in changelog
- Update student count statistics

---

## Alternative Approach: Soft Delete

**Instead of hard delete, consider soft delete:**

```sql
-- Mark as deleted instead of removing
UPDATE learners_profiles
SET
  lifecycle_status = 'deleted',
  updated_at = NOW(),
  updated_by = <admin_user_id>
WHERE semester_id = 'a74396db-9f15-43e7-a8c3-cdfc185ac09b';
```

**Advantages**:
- Reversible
- Audit trail preserved
- No auth user deletion needed

**Disadvantages**:
- Data still occupies space
- Email addresses remain "used"

---

## Questions to Answer Before Proceeding

1. **Why are we deleting these students?**
   - Data cleanup?
   - Re-import with correct data?
   - Semester closure?

2. **Are there any dependent records?**
   - Attendance records?
   - Billing records?
   - Grade records?

3. **Should we use soft delete instead?**
   - Preserves data for audit
   - Reversible

4. **Do we need to notify students?**
   - Account deletion notice?
   - Data export for GDPR?

---

## Approval Required

**⚠️ STOP - DO NOT PROCEED WITHOUT EXPLICIT CONFIRMATION**

Please confirm:
1. You want to DELETE (not soft-delete) 206 students
2. You understand this includes 107 ACTIVE students
3. You understand auth accounts will be permanently deleted
4. You have reviewed the student list
5. You approve proceeding with deletion

**Type "CONFIRMED - DELETE BPHARM SEM8 STUDENTS" to proceed.**

---

**Developer**: Claude Code
**Status**: Awaiting approval
**Risk Level**: CRITICAL - Permanent data deletion
