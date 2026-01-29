# Learner Profile Update & Sync Issues - Root Cause Analysis

**Date:** 2026-01-28
**Module:** Learners Management
**Severity:** High (Affects user authentication and role assignment)

## Executive Summary

Three interconnected issues prevent proper synchronization between `learners_profiles` table and `profiles` (user accounts) table when college email is updated:

1. **Email Update Not Syncing**: Changes to `college_email` don't update the corresponding `profiles` table entry
2. **Role Stuck as 'guest'**: User profiles remain with incorrect role instead of 'student'
3. **Sync Function Not Detecting Mismatches**: `syncProfileStatus()` doesn't handle email changes or verify role correctness

## Issue Analysis

### Issue 1: College Email Update Not Reflecting in Profiles Table

**Location**: `lib/services/learner-profile-service.ts:229-285` (syncProfileStatus function)

**Root Cause**:
The `syncProfileStatus()` function searches for the profile using the **NEW email address** from `learnerProfile.college_email`:

```typescript
// Line 243-246
const { data: profile, error: profileError } = (await supabase
  .from('profiles')
  .select('id, is_active')
  .eq('email', learnerProfile.college_email)  // ← Searching for NEW email
  .maybeSingle()) as { data: UserProfile | null; error: any };
```

**The Problem**:
- User profile still has the **OLD email**
- Query looks for the **NEW email**
- Profile is not found → `profile` is `null`
- Function exits early with log: "No profile found for {email}, skipping sync" (line 255)
- **Result**: Profile email is never updated

**Data Flow**:
```
1. Admin updates learner college_email: old@jkkn.ac.in → new@jkkn.ac.in
2. learners_profiles.college_email = 'new@jkkn.ac.in' ✓
3. syncProfileStatus() runs
4. Searches profiles WHERE email = 'new@jkkn.ac.in'
5. Profile still has email = 'old@jkkn.ac.in'
6. No match found → exits without updating
7. profiles.email = 'old@jkkn.ac.in' ✗ (unchanged)
```

### Issue 2: User Role Stuck as 'guest'

**Location**: Multiple factors

**Root Cause Chain**:

1. **Profile Creation** (`app/api/learners/complete-onboarding/route.ts:170-183`):
   - Creates profile with `role: 'student'` ✓
   - Sets `learner_id` link ✓

2. **Auto-Linking Trigger** (`supabase/setup/04_triggers.sql:507-510`):
   - `trigger_auto_link_profile_to_approved_learner` runs **ONLY on profile INSERT**
   - Doesn't run when learner is updated
   - Doesn't verify or fix existing profiles

3. **Sync Function Limitation** (`lib/services/learner-profile-service.ts:229-285`):
   - `syncProfileStatus()` only syncs `is_active` status
   - **Does NOT sync or verify**:
     - ✗ Email address
     - ✗ Role
     - ✗ Institution/department
     - ✗ Learner_id link

**Scenarios Where Role Gets Stuck**:

| Scenario | What Happens | Result |
|----------|--------------|--------|
| Profile created manually before learner | Role set to 'guest' by default | Role never updated to 'student' |
| Email changed after profile creation | syncProfileStatus can't find profile | Profile never updated |
| Profile created without learner_id link | Orphaned profile | No automatic sync |

### Issue 3: Sync Profiles Function Not Detecting Mismatches

**Location**: `lib/services/learner-profile-service.ts:229-285`

**Root Cause**: The `syncProfileStatus()` function has a narrow scope:

```typescript
// Lines 259-267 - ONLY syncs is_active
const shouldBeActive = learnerProfile.lifecycle_status === 'active';

if (profile.is_active !== shouldBeActive) {
  const updateQuery: any = supabase.from('profiles');
  const { error: updateError } = await updateQuery
    .update({ is_active: shouldBeActive })  // ← ONLY updates is_active
    .eq('id', profile.id);
}
```

**What's Missing**:

1. **No Email Sync**: Doesn't update `profiles.email` when `college_email` changes
2. **No Role Verification**: Doesn't check or fix incorrect roles
3. **No Learner Link Check**: Doesn't verify `profiles.learner_id` is set correctly
4. **No Old Email Lookup**: Doesn't try to find profile by learner_id when email doesn't match
5. **No Orphan Detection**: Doesn't detect profiles that should be linked but aren't

## Evidence from Code

### Trigger Only Runs on INSERT:
```sql
-- supabase/setup/04_triggers.sql:507
CREATE TRIGGER trigger_auto_link_profile_to_approved_learner
    BEFORE INSERT ON public.profiles  -- ← ONLY on INSERT
    FOR EACH ROW
    EXECUTE FUNCTION auto_link_profile_to_approved_learner();
```

### Function Searches by New Email Only:
```typescript
// lib/services/learner-profile-service.ts:243-256
const { data: profile, error: profileError } = (await supabase
  .from('profiles')
  .select('id, is_active')
  .eq('email', learnerProfile.college_email)  // ← NEW email
  .maybeSingle()) as { data: UserProfile | null; error: any };

if (!profile) {
  console.log(`No profile found for ${learnerProfile.college_email}, skipping sync`);
  return;  // ← Exits without trying learner_id lookup
}
```

### Function Only Syncs is_active:
```typescript
// lib/services/learner-profile-service.ts:265-267
const { error: updateError } = await updateQuery
  .update({ is_active: shouldBeActive })  // ← ONLY this field
  .eq('id', profile.id);
```

## Impact

### User Experience Impact:
- ✗ Users can't log in with new email after it's changed
- ✗ Users stuck with 'guest' role lack proper permissions
- ✗ No visibility into which accounts are broken
- ✗ Manual intervention required to fix each case

### Administrative Impact:
- ✗ No automated detection of sync issues
- ✗ Silent failures (only logs, no errors thrown)
- ✗ Difficult to audit which profiles need fixing
- ✗ Time-consuming manual database updates required

## Proposed Solutions

### Solution 1: Enhanced syncProfileStatus Function (Immediate Fix)

**Modify**: `lib/services/learner-profile-service.ts:229-285`

**Changes Needed**:

1. **Add learner_id lookup fallback**:
```typescript
// Try email first
let profile = await findProfileByEmail(learnerProfile.college_email);

// If not found, try learner_id link
if (!profile) {
  profile = await findProfileByLearnerId(learnerId);
}
```

2. **Sync all fields, not just is_active**:
```typescript
const updates: any = {};

// Check email
if (profile.email !== learnerProfile.college_email) {
  updates.email = learnerProfile.college_email;
}

// Check role
if (profile.role !== 'student') {
  updates.role = 'student';
}

// Check is_active
const shouldBeActive = learnerProfile.lifecycle_status === 'active';
if (profile.is_active !== shouldBeActive) {
  updates.is_active = shouldBeActive;
}

// Check learner_id link
if (!profile.learner_id) {
  updates.learner_id = learnerId;
}

// Apply all updates if any
if (Object.keys(updates).length > 0) {
  await updateProfile(profile.id, updates);
}
```

3. **Add comprehensive logging**:
```typescript
console.log('[syncProfileStatus] Syncing profile for learner:', {
  learnerId,
  learnerEmail: learnerProfile.college_email,
  profileEmail: profile?.email,
  changesNeeded: Object.keys(updates),
});
```

### Solution 2: Database Trigger for Email Changes (Comprehensive Fix)

**Create**: `supabase/setup/02_functions.sql` + `04_triggers.sql`

**New Function**:
```sql
CREATE OR REPLACE FUNCTION sync_learner_email_to_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  existing_profile_id UUID;
BEGIN
  -- Only sync if college_email changed
  IF OLD.college_email IS DISTINCT FROM NEW.college_email THEN
    -- Find profile by learner_id (more reliable than email)
    SELECT id INTO existing_profile_id
    FROM profiles
    WHERE learner_id = NEW.id
    LIMIT 1;

    IF existing_profile_id IS NOT NULL THEN
      -- Update profile email to match new college_email
      UPDATE profiles
      SET
        email = NEW.college_email,
        updated_at = NOW()
      WHERE id = existing_profile_id;

      RAISE NOTICE 'Updated profile email for learner % from % to %',
        NEW.id, OLD.college_email, NEW.college_email;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

**New Trigger**:
```sql
CREATE TRIGGER trg_sync_learner_email_changes
  AFTER UPDATE ON learners_profiles
  FOR EACH ROW
  WHEN (OLD.college_email IS DISTINCT FROM NEW.college_email)
  EXECUTE FUNCTION sync_learner_email_to_profile();
```

### Solution 3: Diagnostic & Repair Script (Operational Tool)

**Created**: `scripts/debug-learner-profile-sync.ts`

**Features**:
- Detects all mismatches between learners and profiles
- Categorizes issues (email mismatch, role error, status mismatch, etc.)
- Generates detailed report
- Can be extended to auto-fix issues

**Usage**:
```bash
npx tsx scripts/debug-learner-profile-sync.ts
```

## Testing Strategy

### Phase 1: Reproduce Issues
1. Create test learner with email: `test1@jkkn.ac.in`
2. Activate learner (should create profile)
3. Update learner email to: `test2@jkkn.ac.in`
4. Verify issue: Profile still has `test1@jkkn.ac.in`
5. Verify role: Check if role is 'student' or 'guest'

### Phase 2: Test Enhanced Sync Function
1. Apply Solution 1 changes
2. Update learner email again
3. Verify: Profile email updates correctly
4. Verify: Profile role is 'student'
5. Verify: Profile is_active matches lifecycle_status

### Phase 3: Test Database Trigger
1. Apply Solution 2 (trigger)
2. Update learner email
3. Verify: Automatic email sync in profiles table
4. Check logs: Trigger NOTICE message appears

### Phase 4: Diagnostic Report
1. Run diagnostic script
2. Verify: All mismatches detected
3. Fix reported issues
4. Re-run: Should show 0 mismatches

## Recommended Implementation Order

1. **Immediate** (Today):
   - Run diagnostic script to understand scope
   - Document all affected learners
   - Manual fix for critical cases (active students who can't log in)

2. **Short-term** (This Week):
   - Implement Solution 1 (Enhanced syncProfileStatus)
   - Deploy to production
   - Monitor logs for sync success

3. **Long-term** (Next Sprint):
   - Implement Solution 2 (Database trigger)
   - Add comprehensive tests
   - Create admin dashboard for sync status

## Related Files

### Service Layer:
- `lib/services/learner-profile-service.ts` - Contains syncProfileStatus function

### API Routes:
- `app/api/learners/complete-onboarding/route.ts` - User account creation

### Database:
- `supabase/setup/01_tables.sql` - Table definitions
- `supabase/setup/02_functions.sql` - Database functions
- `supabase/setup/04_triggers.sql` - Triggers including auto-link

### UI Components:
- `app/(routes)/learners/profiles/[id]/edit/page.tsx` - Edit page
- `app/(routes)/learners/enquiries/_components/enquiry-form.tsx` - Form with email field

## Verification Queries

### Check for Email Mismatches:
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
    OR p.role != 'student'
  );
```

### Check for Role Errors:
```sql
SELECT
  p.id,
  p.email,
  p.role,
  p.learner_id,
  l.lifecycle_status
FROM profiles p
LEFT JOIN learners_profiles l ON l.id = p.learner_id
WHERE p.learner_id IS NOT NULL
  AND p.role != 'student';
```

### Check for Orphaned Profiles:
```sql
SELECT *
FROM profiles p
WHERE p.learner_id IS NULL
  AND p.role = 'student'
  AND p.email LIKE '%@jkkn.ac.in';
```

## Conclusion

The root cause is a **design limitation** in the sync function that:
1. Only searches by the new email (can't find existing profiles with old email)
2. Only updates `is_active` (doesn't sync email, role, or links)
3. Has no fallback mechanism (no learner_id lookup)

**Fix Priority**: High - Affects active students' ability to log in and access system features with correct permissions.

---
**Document Version**: 1.0
**Last Updated**: 2026-01-28
**Author**: Claude Code (Systematic Debugging Analysis)
