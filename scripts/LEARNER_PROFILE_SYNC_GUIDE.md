# Learner Profile Sync - Complete Guide

**Last Updated:** 2026-01-28
**Status:** Production Ready

## Overview

This guide covers the complete solution for learner-profile synchronization issues, including diagnostic tools, repair scripts, and automated database triggers.

## The Problem (Fixed)

Previously, when you updated a learner's `college_email` in the `learners_profiles` table:
- ✗ The email didn't update in the `profiles` table
- ✗ User roles remained as 'guest' instead of 'student'
- ✗ The sync function couldn't find profiles after email changes
- ✗ No automated detection or repair of mismatches

## The Solution (Implemented)

### Three-Layer Fix:

1. **Enhanced Service Layer** (`lib/services/learner-profile-service.ts`)
   - Smart profile lookup (by email, then by learner_id)
   - Syncs ALL fields (email, role, is_active, learner_id, institution, department)
   - Comprehensive logging

2. **Database Triggers** (`supabase/setup/02_functions.sql` + `04_triggers.sql`)
   - Auto-syncs email changes at database level
   - Auto-syncs lifecycle_status changes
   - Handles orphaned profile linking

3. **Diagnostic & Repair Scripts** (`scripts/`)
   - Detect all existing mismatches
   - Automatically repair issues
   - Detailed reporting

## Quick Start

### Step 1: Apply Database Changes

Run the SQL files to add triggers:

```bash
# Option 1: Using Supabase CLI (if installed)
supabase db push

# Option 2: Manual - Copy and execute in Supabase SQL Editor
# 1. Open Supabase Dashboard → SQL Editor
# 2. Copy content from: supabase/setup/02_functions.sql (lines ~1853-2000)
# 3. Execute
# 4. Copy content from: supabase/setup/04_triggers.sql (lines ~515-545)
# 5. Execute
```

### Step 2: Check for Existing Issues

Run the diagnostic script to see current state:

```bash
npx tsx scripts/debug-learner-profile-sync.ts
```

**Expected Output:**
```
════════════════════════════════════════════════════════════════
LEARNER-PROFILE SYNC DIAGNOSTIC REPORT
════════════════════════════════════════════════════════════════

Generated: 2026-01-28T...
Total Mismatches Found: 12

ISSUE SUMMARY:
─────────────────────────────────────────────────────────────────
  ⚠️  EMAIL MISMATCH: 5
  ⚠️  ROLE ERROR: 3
  ⚠️  STATUS MISMATCH: 4

DETAILED ISSUES:
─────────────────────────────────────────────────────────────────
1. John Doe (active)
   Learner Email: john.new@jkkn.ac.in
   Profile Email: john.old@jkkn.ac.in
   Issues:
     - EMAIL MISMATCH: Profile email 'john.old@jkkn.ac.in' ≠ learner email 'john.new@jkkn.ac.in'
...
```

### Step 3: Fix Existing Issues (Dry Run First)

Test the repair without making changes:

```bash
npx tsx scripts/repair-learner-profile-sync.ts --dry-run
```

**Review the output**, then run for real:

```bash
npx tsx scripts/repair-learner-profile-sync.ts
```

### Step 4: Verify Fixes

Re-run the diagnostic to confirm all issues are resolved:

```bash
npx tsx scripts/debug-learner-profile-sync.ts
```

**Expected Output:**
```
✓ No issues found! All learner profiles are in sync.
```

## Script Reference

### 1. Diagnostic Script

**File:** `scripts/debug-learner-profile-sync.ts`

**Purpose:** Detect all mismatches between learners and profiles

**Usage:**
```bash
npx tsx scripts/debug-learner-profile-sync.ts
```

**Output:**
- Console report with issue summary
- JSON file: `learner-profile-sync-report-{timestamp}.json`

**Detects:**
- Missing profiles for active learners
- Email mismatches
- Incorrect roles
- is_active status mismatches
- Missing learner_id links
- Duplicate profiles

### 2. Repair Script

**File:** `scripts/repair-learner-profile-sync.ts`

**Purpose:** Automatically fix all detected mismatches

**Usage:**
```bash
# Dry run (shows what would be fixed without making changes)
npx tsx scripts/repair-learner-profile-sync.ts --dry-run

# Verbose output (shows all learners, even those already in sync)
npx tsx scripts/repair-learner-profile-sync.ts --verbose

# Dry run with verbose
npx tsx scripts/repair-learner-profile-sync.ts --dry-run --verbose

# Apply fixes
npx tsx scripts/repair-learner-profile-sync.ts
```

**Flags:**
- `--dry-run`: Preview changes without applying them
- `--verbose`: Show detailed logs for all learners

**Output:**
- Console summary with fixed/failed counts
- JSON file: `repair-report-{timestamp}.json`

**Fixes:**
- Email mismatches (profile email → learner college_email)
- Role errors (any role → 'student')
- Status mismatches (is_active synced with lifecycle_status)
- Missing learner_id links
- Institution/department sync

## Database Triggers

### Trigger 1: Email Sync

**Name:** `trg_sync_learner_email_to_profile`
**Table:** `learners_profiles`
**Event:** `AFTER INSERT OR UPDATE OF college_email`

**What it does:**
- When college_email is added/changed in learners_profiles
- Automatically updates the corresponding profiles.email
- Links orphaned profiles if found
- Ensures role is 'student'

**Example:**
```
Admin updates learner:
  college_email: old@jkkn.ac.in → new@jkkn.ac.in

Trigger automatically:
  ✓ Finds profile by learner_id
  ✓ Updates profile.email to new@jkkn.ac.in
  ✓ Ensures profile.role = 'student'
  ✓ Syncs institution and department
```

### Trigger 2: Status Sync

**Name:** `trg_sync_learner_status_to_profile`
**Table:** `learners_profiles`
**Event:** `AFTER UPDATE OF lifecycle_status`

**What it does:**
- When lifecycle_status changes in learners_profiles
- Automatically updates profiles.is_active
- Only 'active' learners have is_active = true
- All other statuses → is_active = false

**Example:**
```
Admin activates learner:
  lifecycle_status: approved → active

Trigger automatically:
  ✓ Finds profile by learner_id
  ✓ Sets profile.is_active = true

Admin deactivates learner:
  lifecycle_status: active → inactive

Trigger automatically:
  ✓ Sets profile.is_active = false
  ✓ User can no longer log in
```

## Enhanced Service Function

**File:** `lib/services/learner-profile-service.ts`
**Function:** `syncProfileStatus()`

**Improvements:**

**Before:**
- ✗ Only searched by new email
- ✗ Only updated is_active
- ✗ Couldn't find profiles after email change

**After:**
- ✓ Searches by email, then falls back to learner_id
- ✓ Syncs all fields (email, role, is_active, learner_id, institution, department)
- ✓ Comprehensive logging for debugging
- ✓ Handles email changes gracefully

## Verification Queries

Run these in Supabase SQL Editor to verify sync status:

### Check for Email Mismatches
```sql
SELECT
  l.id as learner_id,
  l.first_name,
  l.last_name,
  l.college_email as learner_email,
  l.lifecycle_status,
  p.id as profile_id,
  p.email as profile_email,
  p.role,
  p.is_active
FROM learners_profiles l
LEFT JOIN profiles p ON p.learner_id = l.id
WHERE l.college_email IS NOT NULL
  AND l.college_email != ''
  AND (
    p.email != l.college_email
    OR p.email IS NULL
  );
```

### Check for Role Errors
```sql
SELECT
  p.id,
  p.email,
  p.role,
  p.learner_id,
  l.first_name,
  l.last_name
FROM profiles p
LEFT JOIN learners_profiles l ON l.id = p.learner_id
WHERE p.learner_id IS NOT NULL
  AND p.role != 'student';
```

### Check for Status Mismatches
```sql
SELECT
  l.id as learner_id,
  l.first_name,
  l.last_name,
  l.college_email,
  l.lifecycle_status,
  p.is_active as profile_is_active,
  CASE
    WHEN l.lifecycle_status = 'active' THEN true
    ELSE false
  END as should_be_active
FROM learners_profiles l
INNER JOIN profiles p ON p.learner_id = l.id
WHERE l.college_email IS NOT NULL
  AND p.is_active != (l.lifecycle_status = 'active');
```

## Workflow Examples

### Scenario 1: Changing a Student's Email

**Before (Issue):**
```
1. Admin updates learner college_email in UI
2. learners_profiles.college_email updates ✓
3. profiles.email stays old ✗
4. Student can't log in with new email ✗
```

**After (Fixed):**
```
1. Admin updates learner college_email in UI
2. learners_profiles.college_email updates ✓
3. Enhanced syncProfileStatus() runs ✓
   - Finds profile by learner_id ✓
   - Updates profile.email ✓
4. Database trigger also runs ✓
   - Double-ensures sync ✓
5. Student can log in with new email ✓
```

### Scenario 2: Activating a Student

**Before (Issue):**
```
1. Admin sets lifecycle_status to 'active'
2. User account created ✓
3. Profile role might be 'guest' ✗
4. Student has limited access ✗
```

**After (Fixed):**
```
1. Admin sets lifecycle_status to 'active'
2. User account created ✓
3. syncProfileStatus() runs ✓
   - Sets role to 'student' ✓
   - Sets is_active to true ✓
4. Trigger also runs ✓
   - Double-ensures is_active = true ✓
5. Student has full access ✓
```

### Scenario 3: Fixing Existing Issues

**Steps:**
```bash
# 1. Discover issues
npx tsx scripts/debug-learner-profile-sync.ts

# 2. Review issues in report

# 3. Test fix (dry run)
npx tsx scripts/repair-learner-profile-sync.ts --dry-run

# 4. Apply fixes
npx tsx scripts/repair-learner-profile-sync.ts

# 5. Verify all fixed
npx tsx scripts/debug-learner-profile-sync.ts
```

## Monitoring & Maintenance

### Regular Health Checks

**Weekly:**
```bash
npx tsx scripts/debug-learner-profile-sync.ts
```
Should show: "✓ No issues found!"

**If issues found:**
```bash
npx tsx scripts/repair-learner-profile-sync.ts
```

### Logs to Monitor

**Application logs:**
```
[learner-profile-service] Syncing profile (found by learner_id):
[learner-profile-service] ✓ Successfully synced 3 field(s) for profile {id}
```

**Database logs (NOTICE):**
```sql
NOTICE: Synced profile {id} email from {old} to {new} for learner {id}
NOTICE: Synced profile {id} is_active to true for learner {id}
```

### Error Handling

**If repair script fails:**
1. Check the JSON report file for details
2. Verify database connection
3. Check RLS policies allow profile updates
4. Run with `--verbose` flag for more info

**If trigger fails:**
1. Check Supabase logs (Dashboard → Database → Logs)
2. Look for NOTICE messages
3. Verify functions exist: `\df sync_learner_*`
4. Verify triggers exist: `\d learners_profiles`

## Rollback Plan

If issues occur, you can disable the triggers:

```sql
-- Disable triggers
DROP TRIGGER IF EXISTS trg_sync_learner_email_to_profile ON learners_profiles;
DROP TRIGGER IF EXISTS trg_sync_learner_status_to_profile ON learners_profiles;

-- The enhanced service function will still work
-- Just database-level auto-sync will be disabled
```

To re-enable:
```sql
-- Re-run the trigger creation from 04_triggers.sql
```

## Support & Troubleshooting

### Common Issues

**1. "No profile found" logs appearing:**
- Check if learner is active and profile_complete = true
- Inactive/incomplete learners don't need profiles yet
- This is expected behavior

**2. Repair script shows errors:**
- Check RLS policies allow profile updates
- Verify you have admin permissions
- Try with `--verbose` flag

**3. Trigger not firing:**
- Verify triggers exist: `SELECT * FROM pg_trigger WHERE tgname LIKE '%learner%';`
- Check function exists: `\df sync_learner_email_to_profile`
- Look at database logs for errors

### Getting Help

1. Review the fix documentation: `docs/fixes/2026-01/2026-01-28-FIX-learner-profile-sync-issues.md`
2. Check the diagnostic report JSON for details
3. Run repair script with `--verbose --dry-run` to see what would happen
4. Check Supabase logs for error messages

## Files Modified/Created

### Created:
- ✓ `scripts/debug-learner-profile-sync.ts` - Diagnostic tool
- ✓ `scripts/repair-learner-profile-sync.ts` - Repair tool
- ✓ `scripts/LEARNER_PROFILE_SYNC_GUIDE.md` - This guide
- ✓ `docs/fixes/2026-01/2026-01-28-FIX-learner-profile-sync-issues.md` - Root cause analysis

### Modified:
- ✓ `lib/services/learner-profile-service.ts` - Enhanced syncProfileStatus()
- ✓ `supabase/setup/02_functions.sql` - Added sync functions
- ✓ `supabase/setup/04_triggers.sql` - Added sync triggers

## Success Criteria

✓ College email changes sync to profiles table
✓ User roles are correctly set to 'student'
✓ Diagnostic script shows 0 mismatches
✓ Triggers automatically keep data in sync
✓ Comprehensive logging for debugging

---

**Version:** 1.0
**Last Updated:** 2026-01-28
**Status:** Production Ready ✓
