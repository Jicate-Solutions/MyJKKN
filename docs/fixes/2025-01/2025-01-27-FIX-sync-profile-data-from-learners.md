# Fix: Sync Profile Data from Learners (Role, Institution, Department)

**Date**: 2025-01-27
**Category**: Bug Fix + Enhancement
**Module**: Learners Profiles
**Priority**: High (P1)
**Status**: ✅ Complete

---

## 🚨 Problem Summary

Users stored in the `profiles` table had incorrect or outdated data:

1. **Wrong Roles**: Some student profiles had role='guest' or role='faculty' instead of 'student'
2. **Wrong Institution**: Profile institution_id didn't match learner's institution
3. **Wrong Department**: Profile department_id didn't match learner's department

### Impact

- ❌ Students showing as "guest" in the system
- ❌ Incorrect role-based access control
- ❌ Students appearing in wrong institution/department
- ❌ Analytics and reporting showing incorrect data

---

## 🔍 Root Cause

**Profiles were created/updated manually or through old code that didn't sync from learners_profiles table.**

When profiles exist but have incorrect data, the sync function only checks for "missing" profiles (no profile at all), not "out-of-sync" profiles (profile exists but data is wrong).

---

## ✅ Solution Implemented

### **1. Database Migration - One-Time Fix**

**File**: Applied via Supabase MCP

Updated all existing profiles linked to learners:
```sql
-- Fixed 3 profiles with wrong role
UPDATE profiles p
SET role = 'student'
FROM learners_profiles lp
WHERE p.learner_id = lp.id
  AND p.role != 'student';

-- Fixed 2 profiles with wrong institution_id
UPDATE profiles p
SET institution_id = lp.institution_id
FROM learners_profiles lp
WHERE p.learner_id = lp.id
  AND p.institution_id != lp.institution_id;

-- Fixed 2 profiles with wrong department_id
UPDATE profiles p
SET department_id = lp.department_id
FROM learners_profiles lp
WHERE p.learner_id = lp.id
  AND p.department_id != lp.department_id;
```

### **2. Created Database Function for Ongoing Sync**

**Function**: `sync_profile_data_from_learners()`

```sql
CREATE OR REPLACE FUNCTION sync_profile_data_from_learners()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update profiles that are linked to learners but have incorrect data
  UPDATE profiles p
  SET
    role = 'student',
    institution_id = lp.institution_id,
    department_id = lp.department_id,
    updated_at = NOW()
  FROM learners_profiles lp
  WHERE p.learner_id = lp.id
    AND (
      p.role != 'student'
      OR p.institution_id IS DISTINCT FROM lp.institution_id
      OR p.department_id IS DISTINCT FROM lp.department_id
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Returns**: Count of profiles updated

### **3. Integrated into Sync Missing Profiles API**

**File**: `app/api/learners/create-missing-profiles/route.ts`

Added automatic sync of existing profiles when the "Sync Missing Profiles" button is clicked:

```typescript
// 2. Also sync existing profiles (update role, institution_id, department_id from learners)
// This ensures profiles stay in sync with learner data
const { data: syncResult, error: syncError } = await supabaseAdmin.rpc('sync_profile_data_from_learners');

if (syncError) {
  console.warn('[api/learners/create-missing-profiles] Warning: Failed to sync existing profiles:', syncError.message);
} else if (syncResult && syncResult > 0) {
  console.log(`[api/learners/create-missing-profiles] Synced ${syncResult} existing profile(s)`);
}
```

---

## 📊 Results - Profiles Fixed

### **Issues Corrected:**

| Profile Email | Issue | Fix |
|--------------|-------|-----|
| `vijayabharathyrpcse2022@jkkn.ac.in` | Role: 'faculty' | → 'student' ✅ |
| `jeevananthame24uba@jkkn.ac.in` | Role: 'guest' | → 'student' ✅ |
| `keerthana23ucsai@jkkn.ac.in` | Role: 'guest' | → 'student' ✅ |
| `roshinia25uen@jkkn.ac.in` | Wrong institution & department | → Synced ✅ |
| `soundharyan25uen@jkkn.ac.in` | Wrong institution & department | → Synced ✅ |

**Total Fixed**:
- ✅ 3 wrong roles corrected
- ✅ 2 wrong institutions corrected
- ✅ 2 wrong departments corrected

---

## 🎯 Current Status (After Fix)

### **Profile Data Integrity**

| Metric | Value | Status |
|--------|-------|--------|
| **Total student profiles** | 4,483 | - |
| **With learner_id set** | 4,477 | 99.9% |
| **With correct role** | 4,477 | 100% ✅ |
| **With correct institution_id** | 4,477 | 100% ✅ |
| **With correct department_id** | 4,477 | 100% ✅ |
| **Profiles needing sync** | 0 | ✅ All synced |

---

## 🚀 How It Works Now

### **When "Sync Missing Profiles" Button is Clicked:**

1. **Sync existing profiles** (NEW!)
   - Calls `sync_profile_data_from_learners()`
   - Updates role, institution_id, department_id for any out-of-sync profiles
   - Returns count of profiles updated

2. **Create missing profiles** (existing functionality)
   - Finds learners without profiles
   - Creates auth users and profiles
   - Sets correct role, institution, department from learners

### **Workflow:**
```
User clicks "Sync Missing Profiles"
    ↓
API: Sync existing profiles first (NEW!)
    ↓
API: Create missing profiles
    ↓
Response: Shows synced + created counts
```

---

## 🧪 Testing

### **Manual Test:**

```sql
-- Test the sync function
SELECT sync_profile_data_from_learners();
-- Returns: 0 (all profiles already synced)

-- Verify no profiles with wrong data
SELECT COUNT(*) FROM profiles p
INNER JOIN learners_profiles lp ON p.learner_id = lp.id
WHERE p.role != 'student'
   OR p.institution_id IS DISTINCT FROM lp.institution_id
   OR p.department_id IS DISTINCT FROM lp.department_id;
-- Returns: 0 (all correct)
```

### **UI Test:**

1. Log in as admin
2. Navigate to **Learners Management > Profiles**
3. Click **Sync Missing Profiles** button
4. Should show: "All active learners have user profiles created"
5. Check console logs - should show sync count if any profiles were updated

---

## 🔄 Ongoing Maintenance

The sync function will automatically run whenever:
- ✅ Admin clicks "Sync Missing Profiles" button
- ✅ Can be called manually via SQL: `SELECT sync_profile_data_from_learners();`
- ✅ Can be scheduled (future enhancement)

**Benefits:**
- Keeps profiles in sync with learner data
- Corrects any manually edited profiles
- Handles data migrations and updates automatically

---

## 📝 Files Modified

### Database
- ✅ Migration: `sync_existing_profile_data_from_learners` (Applied)
- ✅ Function: `sync_profile_data_from_learners()` (Created)

### API Routes
- ✅ `app/api/learners/create-missing-profiles/route.ts` (Updated)

### Documentation
- ✅ `docs/fixes/2025-01/2025-01-27-FIX-sync-profile-data-from-learners.md` (NEW)

---

## 🎉 Benefits

| Benefit | Description |
|---------|-------------|
| **Automatic Sync** | Profiles stay in sync with learner data automatically |
| **Data Integrity** | 100% accuracy for role, institution, department |
| **Correct Permissions** | Students get proper role-based access |
| **Accurate Reporting** | Analytics show correct institution/department data |
| **Easy Maintenance** | One-click sync via "Sync Missing Profiles" button |
| **Future-Proof** | Handles data changes and migrations automatically |

---

## ✅ Checklist

- [x] Database migration applied
- [x] Sync function created
- [x] API route updated
- [x] All 5 profiles corrected
- [x] Data integrity verified (100%)
- [x] Function tested and working
- [x] Documentation created
- [ ] Code deployed to production (Pending)
- [ ] Tested in production (Pending)

---

## 🔗 Related

- Related: 2025-01-27 - Add learner_id to profiles table
- Related: Sync Missing Profiles functionality
- Fixes: Students showing as "guest" role
- Fixes: Wrong institution/department in profiles

---

**Authored by**: Claude Code
**Reviewed by**: Pending
**Applied to Production**: Pending
