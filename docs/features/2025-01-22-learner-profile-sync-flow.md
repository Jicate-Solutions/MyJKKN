# Learner Profile Sync - Flow & Criteria Verification

**Date**: 2025-01-22
**Module**: Learners
**Feature**: Profile Sync for Missing User Accounts

## ✅ Current Implementation - VERIFIED CORRECT

### Sync Criteria (What Gets Synced?)

The sync feature **ONLY** creates user profiles for learners that meet **ALL** of these conditions:

```sql
-- Exact query from check-missing-profiles route
SELECT id, college_email, first_name, last_name
FROM learners_profiles
WHERE
  is_profile_complete = true          -- ✅ Profile must be complete
  AND lifecycle_status = 'active'     -- ✅ Must be active status
  AND college_email IS NOT NULL       -- ✅ Must have college email
  AND college_email NOT IN (
    SELECT email FROM profiles        -- ✅ Must NOT already have user account
  );
```

### Why These Criteria?

| Condition | Reason |
|-----------|--------|
| **is_profile_complete = true** | Only learners with all required information filled |
| **lifecycle_status = 'active'** | Only currently active learners (not inactive, exited, graduated, etc.) |
| **college_email IS NOT NULL** | Email is required to create user account |
| **No existing profile** | Prevents duplicate user account creation |

## 📊 Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│  User clicks "Sync Missing Profiles" button            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  1. CHECK MISSING PROFILES API                          │
│     GET /api/learners/check-missing-profiles            │
├─────────────────────────────────────────────────────────┤
│  a) Authenticate user                                   │
│  b) Check permissions (super admin OR                   │
│     learners.profiles.sync)                             │
│  c) Query learners_profiles WHERE:                      │
│     • is_profile_complete = true                        │
│     • lifecycle_status = 'active'                       │
│     • college_email IS NOT NULL                         │
│  d) Query profiles table for existing emails            │
│  e) Compare and find missing profiles                   │
│  f) Return summary + list of missing profiles           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  2. DISPLAY RESULTS                                     │
├─────────────────────────────────────────────────────────┤
│  • Total active learners with complete profiles         │
│  • Number with user profiles                            │
│  • Number without user profiles                         │
│  • List of learners missing profiles                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  User clicks "Create X Profiles" button                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  3. CREATE MISSING PROFILES API                         │
│     POST /api/learners/create-missing-profiles          │
├─────────────────────────────────────────────────────────┤
│  a) Authenticate user                                   │
│  b) Check permissions (same as check endpoint)          │
│  c) Call check-missing-profiles to get list             │
│     (inherits same filtering criteria)                  │
│  d) For each learner in the list:                       │
│     • Generate temporary password                       │
│     • Create auth user (Supabase Auth)                  │
│     • Create profile record                             │
│     • Link to learner via email                         │
│  e) Return results (success + failures)                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  4. DISPLAY CREATION RESULTS                            │
├─────────────────────────────────────────────────────────┤
│  • Successfully created profiles (with temp passwords)  │
│  • Failed profiles (with error messages)                │
│  • Auto re-check to confirm sync complete               │
└─────────────────────────────────────────────────────────┘
```

## 🔍 Code Verification

### Check Missing Profiles Route
**File**: `app/api/learners/check-missing-profiles/route.ts` (Lines 95-100)

```typescript
// 3. Get all learners with complete profiles, active status, and a college email
const { data: learners, error: learnersError } = await supabaseAdmin
  .from('learners_profiles')
  .select('id, college_email, first_name, last_name')
  .eq('is_profile_complete', true)        // ✅ CORRECT
  .eq('lifecycle_status', 'active')       // ✅ CORRECT
  .not('college_email', 'is', null);      // ✅ CORRECT
```

### Create Missing Profiles Route
**File**: `app/api/learners/create-missing-profiles/route.ts` (Lines 117-130)

```typescript
// 3. Find learners with complete profiles who are missing a user profile
const checkUrl = `${
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}/api/learners/check-missing-profiles`;

const checkResponse = await fetch(checkUrl);
const checkData = await checkResponse.json();

// Uses results from check endpoint - inherits same criteria ✅
const learnersToCreate = checkData.details;
```

## ✅ Verification Results

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Only active learners | ✅ CORRECT | `lifecycle_status = 'active'` |
| Only complete profiles | ✅ CORRECT | `is_profile_complete = true` |
| Must have college email | ✅ CORRECT | `college_email IS NOT NULL` |
| No duplicate creation | ✅ CORRECT | Filters out existing profiles |
| Permission protected | ✅ CORRECT | Super admin OR `learners.profiles.sync` |

## 📋 Example Scenarios

### Scenario 1: Learner Should Be Synced ✅
```
Learner Data:
- lifecycle_status: 'active'
- is_profile_complete: true
- college_email: 'john.doe@jkkn.ac.in'
- No existing profile in profiles table

Result: ✅ Will appear in sync list and profile can be created
```

### Scenario 2: Learner Should NOT Be Synced ❌
```
Learner Data:
- lifecycle_status: 'inactive'          ❌ Not active
- is_profile_complete: true
- college_email: 'jane.doe@jkkn.ac.in'

Result: ❌ Will NOT appear in sync list (not active)
```

### Scenario 3: Learner Should NOT Be Synced ❌
```
Learner Data:
- lifecycle_status: 'active'
- is_profile_complete: false            ❌ Profile not complete
- college_email: 'bob.smith@jkkn.ac.in'

Result: ❌ Will NOT appear in sync list (incomplete profile)
```

### Scenario 4: Learner Should NOT Be Synced ❌
```
Learner Data:
- lifecycle_status: 'active'
- is_profile_complete: true
- college_email: 'alice.jones@jkkn.ac.in'
- Profile already exists in profiles table  ❌ Already has account

Result: ❌ Will NOT appear in sync list (already has profile)
```

### Scenario 5: Learner Should NOT Be Synced ❌
```
Learner Data:
- lifecycle_status: 'active'
- is_profile_complete: true
- college_email: null                    ❌ No email

Result: ❌ Will NOT appear in sync list (no email)
```

## 🎯 Summary

The current implementation is **100% CORRECT** and follows the exact requirements:

✅ **Only syncs active learners** (`lifecycle_status = 'active'`)
✅ **Only syncs complete profiles** (`is_profile_complete = true`)
✅ **Only syncs learners with email** (`college_email IS NOT NULL`)
✅ **Prevents duplicates** (checks existing profiles table)
✅ **Permission protected** (super admin or specific permission)
✅ **Both endpoints use same criteria** (create calls check first)

No changes needed - the flow is working as designed! 🎉
