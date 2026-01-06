# Fix: Bulk Upload Validation Inconsistency

**Date:** 2026-01-06
**Severity:** Medium
**Module:** Learners / Bulk Upload
**Status:** Fixed

## Problem

Different super admins received different validation results for identical Excel files. This occurred because the API route passed the user's profile institution instead of institutions from the Excel file, breaking the cascading validation design.

### Example

- Super Admin A (institution: JKKN Engineering) uploads Excel with "JKKN Engineering" data
- Super Admin B (institution: JKKN Pharmacy) uploads **same Excel** with "JKKN Engineering" data
- Admin A: Validation finds programs but shows format errors (correct)
- Admin B: Validation shows "not found in database" errors (WRONG)
- **Same data should produce same results for all users**

## Root Cause

Line 76 (now 134) in `app/api/learners/validate-bulk-upload-preview/route.ts`:

```typescript
institutionId: profile.institution_id || undefined  // Bug: overrides Excel institutions
```

This prevented the service from cascading validation from Excel institutions, causing user-dependent (instead of data-dependent) validation results.

## Solution

### 1. Removed Profile Institution Override (PRIMARY FIX)

```typescript
// BEFORE (BUGGY):
const validationInput: BatchValidationInput = {
  institutionId: profile.institution_id || undefined,  // Wrong: uses user's profile
  uniqueValues
};

// AFTER (FIXED):
const validationInput: BatchValidationInput = {
  institutionId: undefined,  // Correct: lets service cascade from Excel
  uniqueValues
};
```

### 2. Added Security Check for Regular Users

Added institution access verification to prevent regular users from uploading to institutions they don't have access to. Super admins bypass this check and can validate any institution.

```typescript
if (!profile.is_super_admin && uniqueValues.institutions && uniqueValues.institutions.length > 0) {
  // Verify user has access to institutions in Excel
  // Returns 403 if unauthorized
}
```

### 3. Updated Documentation

Updated file header to clarify:
- Fix date: 2026-01-06
- Security: Super admins can validate any institution, regular users limited to their own
- Design: Service cascades validation (Institution→Department→Program→Semester→Section)

## How It Works Now

**Cascading Validation Flow:**
```
Step 1: Validate institutions from Excel → resolve names to IDs
   ↓
Step 2: Validate departments using institution IDs from Step 1
   ↓
Step 3: Validate programs using department IDs from Step 2
   ↓
Step 4: Validate semesters using program IDs from Step 3
   ↓
Step 5: Validate sections using semester IDs from Step 4
```

**For Super Admins:**
- Can validate learners for ANY institution
- Excel file can contain multiple institutions
- Validation cascades from Excel institutions, NOT user's profile
- Same Excel → identical results for all super admins

**For Regular Users:**
- Can only validate learners for their OWN institution
- Excel must match user's institution (case-insensitive)
- Attempting cross-institution upload returns HTTP 403

## Testing

✓ Super admins get identical results for same Excel
✓ Super admins can validate any institution
✓ Regular users restricted to own institution
✓ Cascade validation works correctly (Institution→Dept→Prog→Sem→Sec)
✓ TypeScript compilation successful
✓ No existing functionality broken

## Files Changed

- `app/api/learners/validate-bulk-upload-preview/route.ts`
  - Lines 1-10: Updated header documentation
  - Lines 77-127: Added institution access security check
  - Lines 129-136: Removed profile institution override (PRIMARY FIX)

## Impact

### Positive Changes
- ✓ Cross-institution validation now works correctly for super admins
- ✓ Validation results are now data-dependent, not user-dependent
- ✓ Security: Regular users prevented from unauthorized cross-institution uploads
- ✓ Clear error messages guide users when access is denied

### No Breaking Changes
- ✓ Existing functionality preserved
- ✓ All user types work as expected
- ✓ Performance unchanged
- ✓ Template format unchanged

## Evidence

**Before Fix:**
- User 1 (profile: JKKN Engineering) + Excel (JKKN Engineering) = 3 format errors ✓
- User 2 (profile: JKKN Pharmacy) + Excel (JKKN Engineering) = "not found" errors ✗

**After Fix:**
- User 1 (profile: JKKN Engineering) + Excel (JKKN Engineering) = 3 format errors ✓
- User 2 (profile: JKKN Pharmacy) + Excel (JKKN Engineering) = 3 format errors ✓
- **Same Excel → Same Results for ALL users** ✓

## Rollback Procedure

If issues occur, revert lines 129-136 to:

```typescript
const validationInput: BatchValidationInput = {
  institutionId: profile.institution_id || undefined,  // Reverted
  uniqueValues
};
```

And remove security check (lines 77-127).

## Related Documentation

- Service design: `lib/services/bulk-validation-batch-service.ts` (line 134 comment)
- Client extraction: `lib/utils/bulk-upload-validation.ts` (lines 836-839)
- Name resolver: `lib/services/name-to-id-resolver.ts` (cascading queries)
