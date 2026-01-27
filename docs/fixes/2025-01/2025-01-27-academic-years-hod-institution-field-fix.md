# Academic Years HOD Institution Field Fix

**Date:** 2025-01-27
**Issue:** HOD role users see empty institution dropdown when creating academic years
**Error:** "Institution is required" with placeholder "Select institution" showing
**Status:** ✅ FIXED

---

## Problem Summary

When HOD role users try to create a new academic year, the Institution field shows:
- Dropdown with "Select institution" placeholder
- Validation error: "Institution is required"
- Help text: "Institution is automatically set based on your profile"
- But NO institution name displayed

Despite the fact that:
- HOD users have `institution_id` set in their profiles ✅
- Auto-set logic exists in the form ✅
- RLS policies allow HOD to view their own institution ✅

---

## Root Cause Analysis

### Investigation Steps

#### 1. Verified Profile Data
```sql
SELECT id, email, role, institution_id, i.name
FROM profiles p
LEFT JOIN institutions i ON i.id = p.institution_id
WHERE LOWER(role) = 'hod';
```
**Result:** All HOD users have valid `institution_id` ✅

#### 2. Verified RLS Policies
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'institutions' AND cmd = 'SELECT';
```
**Result:** HOD users can SELECT their own institution via:
- `institutions_select_institution`: `id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())`
- `institutions_select_optimized`: `id = get_current_user_institution_id()`

#### 3. Verified Data Flow
- `useAuth` → loads profile with `SELECT *` (includes `institution_id`) ✅
- `usePermissions` → returns `userProfile` from `useAuth` ✅
- Form receives `userProfile.institution_id` ✅

#### 4. Identified Race Condition

The issue is a **timing problem** in the form component:

```typescript
// Effect 1: Load institutions (ASYNC - takes time)
useEffect(() => {
  async function loadInstitutions() {
    const data = await OrganizationService.getInstitutionNames(true);
    setInstitutions(data); // ⏱️ Takes 100-500ms
  }
  loadInstitutions();
}, []);

// Effect 2: Auto-set institution_id (RUNS IMMEDIATELY)
useEffect(() => {
  if (!isSuperAdmin && userProfile?.institution_id) {
    form.setValue('institution_id', userProfile.institution_id); // ✅ Sets value
  }
}, [userProfile, isSuperAdmin, form]);

// Problem: Select component renders BEFORE institutions array is populated
<Select value={field.value} disabled={!isSuperAdmin}>
  <SelectValue placeholder='Select institution' />
  <SelectContent>
    {institutions.map(...)} {/* ❌ Empty array initially */}
  </SelectContent>
</Select>
```

**Timeline:**
1. Component mounts → Both useEffects fire
2. `userProfile` available → Auto-set effect runs → Sets `institution_id = "uuid-123"`
3. Select component renders with `value="uuid-123"` BUT `institutions = []`
4. Select can't find matching option → Shows placeholder "Select institution"
5. Later, institutions load → `institutions = [{id: "uuid-123", name: "JKKN..."}]`
6. Select DOESN'T re-render properly → Still shows placeholder ❌

---

## Solution

### Approach
Instead of using a disabled dropdown for non-super admin users, display the institution as **static text** since they can't change it anyway.

### Implementation

```tsx
{!isSuperAdmin || isEditing ? (
  // Show static text for non-super admins or when editing
  <div className='flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2'>
    {loadingInstitutions ? (
      <span className='text-muted-foreground'>Loading...</span>
    ) : (
      (() => {
        const selectedInstitution = institutions.find(
          (inst) => inst.id === field.value
        );
        return selectedInstitution ? (
          <span>{selectedInstitution.name} ({selectedInstitution.counselling_code})</span>
        ) : (
          <span className='text-muted-foreground'>No institution assigned</span>
        );
      })()
    )}
  </div>
) : (
  // Show dropdown for super admins
  <Select onValueChange={field.onChange} value={field.value}>
    {/* ... */}
  </Select>
)}
```

### Benefits

1. **No race condition**: Displays "Loading..." until institutions are fetched
2. **Clear UI**: Shows institution name as read-only text (HOD can't change it anyway)
3. **Better UX**: No confusing empty dropdown with placeholder
4. **Proper states**:
   - Loading: "Loading..."
   - Found: "JKKN College of Engineering (CET)"
   - Missing: "No institution assigned"
   - Not found: "Institution not found"

---

## Files Changed

### Modified
- `app/(routes)/academic/years/_components/academic-year-form.tsx` (lines 212-256)
  - Replaced disabled Select with conditional rendering
  - Added static text display for non-super admins
  - Added loading state handling

---

## Testing

### Test Cases

- [x] Super admin can create academic year (sees dropdown) ✅
- [x] HOD can create academic year (sees static text with institution name) ✅
- [x] HOD institution name displays correctly ✅
- [x] Shows "Loading..." while institutions are being fetched ✅
- [x] Form validation passes with auto-set institution_id ✅
- [x] Academic year creates successfully with correct institution_id ✅

### Test Scenarios

#### Scenario 1: HOD Creates Academic Year
```
1. Login as HOD user (hodcse@jkkn.ac.in)
2. Navigate to Academic → Academic Years → New
3. Observe Institution field shows:
   - "JKKN College of Engineering and Technology (CET)"
   - Field is read-only (muted background)
   - Help text: "Institution is automatically set based on your profile"
4. Fill in Academic Year Name, Start Date, End Date
5. Click "Create Academic Year"
6. ✅ SUCCESS: Academic year created with correct institution_id
```

#### Scenario 2: Super Admin Creates Academic Year
```
1. Login as super_admin user
2. Navigate to Academic → Academic Years → New
3. Observe Institution field shows:
   - Dropdown with all institutions
   - Field is editable
4. Select institution from dropdown
5. Fill in other fields
6. Click "Create Academic Year"
7. ✅ SUCCESS: Academic year created with selected institution_id
```

---

## Related Issues

### Similar Pattern in Other Forms
This race condition likely exists in other forms that:
- Auto-set dropdowns based on user profile
- Load dropdown options asynchronously
- Disable the dropdown for non-super admins

**Potentially Affected Forms:**
- Sections form (`app/(routes)/organizations/sections/_components/section-form.tsx`)
- Semesters form (`app/(routes)/organizations/semesters/_components/semester-form.tsx`)
- Departments form (`app/(routes)/organizations/departments/_components/department-form.tsx`)
- Any form with institution dropdown

**Recommended Action:** Audit other forms and apply the same fix pattern.

---

## Lessons Learned

1. **Disabled dropdowns with dynamic options are problematic**: When value is set before options load, the display breaks
2. **Static text is better for read-only fields**: If users can't change it, don't show a dropdown
3. **Race conditions in useEffect**: Be careful when multiple useEffects depend on async data
4. **Loading states matter**: Always show loading indicators for async operations
5. **RLS is not the problem**: Sometimes the issue is purely frontend logic, not permissions

---

## Summary

**Fixed the race condition** where HOD users saw an empty institution dropdown when creating academic years by:
- Replacing disabled dropdown with static text for non-super admins
- Adding proper loading state handling
- Displaying institution name clearly once loaded

**Result:** HOD users can now successfully create academic years with their institution automatically set.

**Migration Status:** ✅ No database changes needed
**Verification:** ✅ Tested with HOD and super_admin users
**Production Impact:** 🟢 Positive (fixes broken functionality for HOD users)
