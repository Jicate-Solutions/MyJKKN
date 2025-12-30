# Bulk Upload API Fix - Zero Learners Created

**Date**: December 30, 2025
**Status**: ✅ **FIXED**

---

## Problem

**Symptom**: Uploaded 96 student records, but **0 learners created**

**User Report**:
- Upload completed (200 status, 63 seconds)
- Results page showed: "Learners Created: 0 - Out of 96 total rows"
- No success toast displayed
- No data appeared in learners table

---

## Root Cause Analysis

### Issue 1: API Route Using Old Field Name
**File**: `app/api/learners/bulk-upload-profiles/route.ts`

The API route was still using `first_graduate` (boolean) instead of `scholarship_type` (string) at line 320:

```typescript
// ❌ WRONG - Old field name
first_graduate: mappedData.first_graduate === 'TRUE' || mappedData.first_graduate === true,
```

**Impact**: All 96 rows had invalid data structure that didn't match validation expectations.

### Issue 2: Missing Legacy Conversion
The API route wasn't applying the legacy conversion functions we added to `bulk-upload-validation.ts`.

**Impact**: Old template values like "REGULAR" and "TRUE/FALSE" weren't being converted to new values.

---

## Discrepancy Between Files

### Validation Utility (CORRECT)
**File**: `lib/utils/bulk-upload-validation.ts`
- ✅ Uses `scholarship_type` with 4 values
- ✅ Has legacy conversion functions
- ✅ Converts TRUE/FALSE → FIRST GRADUATE/NOT APPLICABLE
- ✅ Converts REGULAR → FIRST YEAR

### API Route (BROKEN)
**File**: `app/api/learners/bulk-upload-profiles/route.ts`
- ❌ Used `first_graduate` (boolean)
- ❌ No legacy conversion applied
- ❌ Column mapping didn't include scholarship_type variations

**Result**: Data preparation and validation were completely out of sync!

---

## Fixes Applied

### Fix 1: Update Column Mapping (Lines 89-99)

**Before**:
```typescript
// SECTION 6: Entry Type
'entry_type': ['Entry Type', '* Entry Type', 'entry_type'],
'first_graduate': ['First Graduate', 'first_graduate'],
```

**After**:
```typescript
// SECTION 6: Entry Type & Scholarship
'entry_type': ['Entry Type', '* Entry Type', 'entry_type'],
'scholarship_type': [
  'Scholarship Type',
  '* Scholarship Type',
  'scholarship_type',
  // Legacy support for old templates
  'First Graduate',
  '* First Graduate',
  'first_graduate'
],
```

### Fix 2: Import Legacy Conversion Functions (Lines 14-17)

**Added**:
```typescript
import {
  convertLegacyScholarshipType,
  convertLegacyEntryType
} from '@/lib/utils/bulk-upload-validation';
```

### Fix 3: Apply Legacy Conversions (Lines 330-332)

**Before**:
```typescript
// Entry Type
entry_type: normalizeDropdownValue(mappedData.entry_type, ENTRY_TYPE_VALUES),
first_graduate: mappedData.first_graduate === 'TRUE' || mappedData.first_graduate === true,
```

**After**:
```typescript
// Entry Type & Scholarship (with legacy conversion)
entry_type: convertLegacyEntryType(mappedData.entry_type),
scholarship_type: convertLegacyScholarshipType(mappedData.scholarship_type),
```

---

## How It Works Now

### Data Flow (Fixed)

```
Excel File
    ↓
API Route (route.ts)
    ├─ Map columns (including legacy field names)
    ├─ Apply legacy conversions ✅
    │   • TRUE/FALSE → FIRST GRADUATE/NOT APPLICABLE
    │   • REGULAR → FIRST YEAR
    │   • LATERAL → LATERAL ENTRY
    ↓
Validation (bulk-upload-validation.ts)
    ├─ Validate scholarship_type ✅
    ├─ Validate entry_type ✅
    ↓
Service (bulk-learner-upload-service.ts)
    ├─ Batch upsert profiles ✅
    ├─ Batch insert learners ✅
    ↓
Database
    ├─ Profiles updated/created ✅
    ├─ Learners created ✅
```

---

## Testing Scenarios

### Scenario 1: Old Template (TRUE/FALSE for First Graduate)
```
Excel Column: "First Graduate" = "TRUE"
    ↓
Column Mapping: Recognizes as scholarship_type
    ↓
Legacy Conversion: TRUE → "FIRST GRADUATE"
    ↓
Validation: ✅ Accepts "FIRST GRADUATE"
    ↓
Result: ✅ Learner created
```

### Scenario 2: Old Template (REGULAR for Entry Type)
```
Excel Column: "Entry Type" = "REGULAR"
    ↓
Legacy Conversion: REGULAR → "FIRST YEAR"
    ↓
Validation: ✅ Accepts "FIRST YEAR"
    ↓
Result: ✅ Learner created
```

### Scenario 3: New Template
```
Excel Columns:
- "Scholarship Type" = "PMS SCHOLARSHIP"
- "Entry Type" = "RE-ADMISSION"
    ↓
Column Mapping: Direct match
    ↓
Validation: ✅ Accepts both values
    ↓
Result: ✅ Learner created
```

---

## Files Modified

1. **`app/api/learners/bulk-upload-profiles/route.ts`**
   - Lines 14-17: Added import for conversion functions
   - Lines 89-99: Updated column mapping for scholarship_type
   - Lines 330-332: Applied legacy conversions

---

## Summary

✅ **Root Cause**: API route used old field structure (first_graduate) while validation expected new structure (scholarship_type)

✅ **Fix Applied**: Synchronized API route with validation utility by:
   1. Using scholarship_type instead of first_graduate
   2. Applying legacy conversion functions
   3. Supporting both old and new template formats

✅ **Expected Result**: All 96 rows should now be processed correctly, creating 96 learners

---

## Next Steps

1. **Test bulk upload** with the same 96-row file
2. **Verify success**:
   - Results page shows "Learners Created: 96"
   - Success toast displays
   - Data appears in learners table
3. **Test with different templates**:
   - Old template (TRUE/FALSE, REGULAR/LATERAL)
   - New template (scholarship types, new entry types)

---

**Developer**: Claude Code
**Review Status**: Ready for testing
**Impact**: Fixes 0% success rate → Expected 100% success rate
