# Bulk Upload Issues - Fix Implementation Plan

**Date**: December 30, 2025
**Status**: ⏳ **READY FOR IMPLEMENTATION**

---

## Issues Reported

### Issue 1: Hierarchy Validation Not Showing Errors
**Problem**: Institution - Degree - Department - Programs - Semester - Section fields are mismatched but validation errors are not displayed.

### Issue 2: Progress Bar Stuck at 90%
**Problem**: Upload progress bar shows simulated progress (default 90%) instead of actual data-count-based progress.

---

## Issue 1 Analysis: Hierarchy Validation

### Current Implementation

**✅ Validation Logic EXISTS and WORKS**

The validation correctly checks hierarchy relationships:

1. **Institution** → validated independently
2. **Degree** → validated with `institution_id` filter
3. **Department** → validated with `institution_id` filter
4. **Program** → validated with `institution_id` filter
5. **Semester** → validated with `program_id` + `institution_id` (composite key: `PROGRAM|SEMESTER`)
6. **Section** → validated with `semester_id` + `program_id` + `institution_id` (composite key: `PROGRAM|SEMESTER|SECTION`)

**Files:**
- `lib/services/bulk-validation-batch-service.ts` (lines 162-227)
- `lib/utils/bulk-upload-validation.ts` (lines 736-758)

### Problem Diagnosis

**Why errors might not be showing:**

#### Root Cause 1: Database Validation Not Triggered
The database validation is called on line 620 in the enhanced dialog:
```typescript
const dbValidationResult = await validateDatabaseFields(parsedRows);
```

**BUT**: This is wrapped in a try-catch and might be failing silently!

#### Root Cause 2: Missing Error Display for Some Fields
Checking the `getDatabaseValidationErrors` function (lines 705-781):
- ✅ Institution errors: YES
- ✅ Program errors: YES
- ✅ Semester errors: YES (composite key)
- ✅ Section errors: YES (composite key)
- ✅ Degree errors: YES
- ✅ Department errors: YES

**BUT**: The error display shows only the FIRST 2 errors per row (line 130):
```typescript
{Object.entries(databaseValidationErrors!).slice(0, 2).map(...)}
```

If a row has errors in:
1. Institution (shown)
2. Program (shown)
3. Semester (hidden)
4. Section (hidden)
5. Department (hidden)

**Users only see the first 2 errors!**

---

## Issue 1: Proposed Fixes

### Fix 1.1: Show All Database Validation Errors

**File**: `app/(routes)/learners/profiles/_components/bulk-upload-profiles-dialog-enhanced.tsx`

**Lines 130-148**: Replace error display limit

**Current**:
```typescript
{Object.entries(databaseValidationErrors!).slice(0, 2).map(...)}
```

**Fixed**:
```typescript
{Object.entries(databaseValidationErrors!).map(...)}
// Remove .slice(0, 2) to show ALL errors, not just first 2
```

Also remove the "+X more database errors" message since we're showing all.

### Fix 1.2: Add Error Logging for Database Validation

**File**: `app/(routes)/learners/profiles/_components/bulk-upload-profiles-dialog-enhanced.tsx`

**Lines 619-625**: Add error logging

**Add**:
```typescript
try {
  const dbValidationResult = await validateDatabaseFields(parsedRows);

  // Log validation results for debugging
  console.log('[bulk-upload] Database validation complete:', {
    institutions: Object.entries(dbValidationResult.institutions).filter(([_, v]) => !v.found),
    programs: Object.entries(dbValidationResult.programs).filter(([_, v]) => !v.found),
    semesters: Object.entries(dbValidationResult.semesters).filter(([_, v]) => !v.found),
    sections: Object.entries(dbValidationResult.sections).filter(([_, v]) => !v.found),
    degrees: Object.entries(dbValidationResult.degrees).filter(([_, v]) => !v.found),
    departments: Object.entries(dbValidationResult.departments).filter(([_, v]) => !v.found),
  });

  // ... rest of code
} catch (error) {
  console.error('[bulk-upload] Database validation FAILED:', error);
  throw error; // Re-throw to show error to user
}
```

### Fix 1.3: Better Error Categorization Display

**File**: `app/(routes)/learners/profiles/_components/bulk-upload-profiles-dialog-enhanced.tsx`

**Lines 128-150**: Group errors by hierarchy level

**Add** hierarchical error display:
```typescript
{/* DATABASE VALIDATION ERRORS - Hierarchical Display */}
{hasDbErrors && (
  <div className="space-y-1">
    {/* Organizational Hierarchy Errors */}
    {(databaseValidationErrors!.institution ||
      databaseValidationErrors!.degree ||
      databaseValidationErrors!.department) && (
      <div className="text-xs font-semibold text-amber-700">
        🏛️ Organizational Structure Errors:
      </div>
    )}

    {databaseValidationErrors!.institution && (
      <div className="text-xs text-red-600 pl-4">
        ❌ Institution: {databaseValidationErrors!.institution.error}
        {databaseValidationErrors!.institution.suggestions && (
          <div className="text-blue-600">
            💡 Try: {databaseValidationErrors!.institution.suggestions.join(', ')}
          </div>
        )}
      </div>
    )}

    {/* Similar for degree, department */}

    {/* Academic Hierarchy Errors */}
    {(databaseValidationErrors!.program ||
      databaseValidationErrors!.semester ||
      databaseValidationErrors!.section) && (
      <div className="text-xs font-semibold text-amber-700 mt-2">
        📚 Academic Hierarchy Errors:
      </div>
    )}

    {databaseValidationErrors!.program && (
      <div className="text-xs text-red-600 pl-4">
        ❌ Program: {databaseValidationErrors!.program.error}
      </div>
    )}

    {/* Hierarchy mismatch indicator */}
    {databaseValidationErrors!.semester && (
      <div className="text-xs text-red-600 pl-4">
        ❌ Semester: {databaseValidationErrors!.semester.error}
        <div className="text-amber-600 font-semibold">
          ⚠️ This semester doesn't belong to the selected program
        </div>
      </div>
    )}

    {databaseValidationErrors!.section && (
      <div className="text-xs text-red-600 pl-4">
        ❌ Section: {databaseValidationErrors!.section.error}
        <div className="text-amber-600 font-semibold">
          ⚠️ This section doesn't belong to the selected program/semester
        </div>
      </div>
    )}
  </div>
)}
```

---

## Issue 2 Analysis: Progress Bar

### Current Implementation

**Lines 746-761** in `bulk-upload-profiles-dialog-enhanced.tsx`:

```typescript
// Simulate progress
const progressInterval = setInterval(() => {
  setState(prev => ({
    ...prev,
    uploadProgress: Math.min(prev.uploadProgress + 10, 90)
  }));
}, 500);

// Upload to API
const response = await fetch('/api/learners/bulk-upload-profiles', {
  method: 'POST',
  body: formData
});

clearInterval(progressInterval);
setState(prev => ({ ...prev, uploadProgress: 100 }));
```

**Problem**:
- Progress increments by 10% every 500ms
- Reaches 90% regardless of actual upload progress
- Jumps to 100% when complete
- **NOT based on actual data count**

---

## Issue 2: Proposed Fix

### Fix 2.1: Stream Progress from API

The API route processes data in batches. We need to stream progress back to the client.

**Option A: Use Server-Sent Events (SSE)**

Modify the API to stream progress updates:

**File**: `app/api/learners/bulk-upload-profiles/route.ts`

**Add streaming response**:
```typescript
export async function POST(request: NextRequest) {
  // ... existing auth code ...

  // Create streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (current: number, total: number) => {
        const progress = Math.round((current / total) * 100);
        const data = `data: ${JSON.stringify({ progress, current, total })}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      try {
        // Process bulk upload with progress callbacks
        const result = await BulkLearnerUploadService.processBulkUpload(
          rows,
          sendProgress // Pass callback
        );

        // Send final result
        const data = `data: ${JSON.stringify({ type: 'complete', result })}\n\n`;
        controller.enqueue(encoder.encode(data));
        controller.close();
      } catch (error) {
        const data = `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`;
        controller.enqueue(encoder.encode(data));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

**Option B: Simpler - Calculate Progress Based on Batch Count**

Modify the bulk upload service to return progress updates.

**File**: `lib/services/bulk-learner-upload-service.ts`

**Lines 178-224**: Add progress reporting

**Add**:
```typescript
static async processValidRows(
  rows: BulkUploadRow[],
  result: BulkUploadResult,
  onProgress?: (current: number, total: number) => void // Add callback
): Promise<void> {
  const BATCH_SIZE = 75;
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const currentBatch = Math.floor(i / BATCH_SIZE) + 1;

    // Report progress
    if (onProgress) {
      onProgress(currentBatch, totalBatches);
    }

    try {
      // ... existing batch processing code ...
    } catch (error) {
      // ... error handling ...
    }
  }
}
```

### Fix 2.2: Update Client to Use Real Progress

**File**: `app/(routes)/learners/profiles/_components/bulk-upload-profiles-dialog-enhanced.tsx`

**Lines 718-796**: Replace simulated progress

**Remove**:
```typescript
// Simulate progress
const progressInterval = setInterval(() => {
  setState(prev => ({
    ...prev,
    uploadProgress: Math.min(prev.uploadProgress + 10, 90)
  }));
}, 500);
```

**Replace with**:
```typescript
// OPTION A: SSE Progress Streaming
const response = await fetch('/api/learners/bulk-upload-profiles', {
  method: 'POST',
  body: formData
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader!.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));

      if (data.progress !== undefined) {
        setState(prev => ({ ...prev, uploadProgress: data.progress }));
      }

      if (data.type === 'complete') {
        setState(prev => ({ ...prev, result: data.result, step: 'results' }));
      }
    }
  }
}
```

**OR OPTION B: Simple Polling with Upload Count**

```typescript
// Calculate expected progress based on row count
const totalRows = selectedRows.length;
const BATCH_SIZE = 75;
const estimatedBatches = Math.ceil(totalRows / BATCH_SIZE);
const timePerBatch = 2000; // 2 seconds per batch estimate

let currentProgress = 0;
const progressInterval = setInterval(() => {
  currentProgress += (100 / estimatedBatches);
  setState(prev => ({
    ...prev,
    uploadProgress: Math.min(Math.round(currentProgress), 95)
  }));
}, timePerBatch);

const response = await fetch('/api/learners/bulk-upload-profiles', {
  method: 'POST',
  body: formData
});

clearInterval(progressInterval);
setState(prev => ({ ...prev, uploadProgress: 100 }));
```

---

## Recommended Approach

### For Issue 1 (Hierarchy Validation):
1. ✅ **Fix 1.1**: Remove error limit (show ALL errors) - **EASY, HIGH IMPACT**
2. ✅ **Fix 1.2**: Add error logging - **EASY, HELPS DEBUGGING**
3. ⚠️ **Fix 1.3**: Better error categorization - **OPTIONAL, NICE-TO-HAVE**

### For Issue 2 (Progress Bar):
1. ✅ **Option B (Simple)**: Calculate progress based on row count and batch size - **EASY, GOOD ENOUGH**
2. ⚠️ **Option A (Advanced)**: SSE streaming - **COMPLEX, MOST ACCURATE**

---

## Implementation Priority

### High Priority (Implement Now):
1. **Fix 1.1**: Show all database validation errors (remove slice limit)
2. **Fix 1.2**: Add database validation error logging
3. **Fix 2 (Option B)**: Count-based progress bar

### Medium Priority (Implement Later):
1. **Fix 1.3**: Better error categorization UI
2. **Fix 2 (Option A)**: SSE streaming progress

---

## Testing Checklist

### Issue 1 - Hierarchy Validation:
- [ ] Upload file with mismatched institution/department
- [ ] Upload file with program/semester mismatch
- [ ] Upload file with semester/section mismatch
- [ ] Verify ALL errors are displayed (not just first 2)
- [ ] Check console logs show validation results
- [ ] Verify suggestions are shown for mismatches

### Issue 2 - Progress Bar:
- [ ] Upload 50 rows → Progress should reflect 1 batch
- [ ] Upload 100 rows → Progress should reflect 2 batches
- [ ] Upload 200 rows → Progress should reflect 3 batches
- [ ] Verify progress doesn't stuck at 90%
- [ ] Verify smooth progress based on batch count

---

## Summary

**Issue 1**: Validation IS working, but errors are LIMITED to first 2. Fix: Show ALL errors + add logging.

**Issue 2**: Progress is SIMULATED (fake 90%). Fix: Calculate progress based on row count / batch size.

**Files to Modify**:
1. `app/(routes)/learners/profiles/_components/bulk-upload-profiles-dialog-enhanced.tsx` (both issues)
2. `lib/services/bulk-learner-upload-service.ts` (optional for advanced progress)

**Estimated Time**: 2-3 hours for high-priority fixes

---

**Status**: Ready for approval and implementation
**Developer**: Claude Code
**Priority**: HIGH (user-blocking issues)
