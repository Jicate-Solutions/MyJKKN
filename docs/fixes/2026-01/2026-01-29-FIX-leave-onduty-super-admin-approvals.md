# Fix: Leave/OnDuty Approvals Page - Super Admin Error

**Date**: 2026-01-29
**Issue**: Super admin cannot load approvals page
**Error**: `column institutions_1.institution_name does not exist`
**Severity**: High (blocks super admin functionality)

---

## Problem

Super admin users received error "Failed to load approvals. Please try again." when accessing `/academic/leave-onduty/approvals`.

### Root Cause

The `getAllPendingApplicationsForSuperAdmin()` service method was querying for a non-existent column:

```typescript
// WRONG ❌
institution:institution_id(id, institution_name)
```

The `institutions` table has column `name`, not `institution_name`.

### Impact

- ❌ Super admin could not view pending leave/onduty applications
- ❌ Super admin could not approve/reject applications
- ✅ Regular approvers (faculty, HOD, principal) were unaffected

---

## Investigation Process

### Phase 1: Root Cause Investigation

1. **Added diagnostic logging** to trace the error:
   - Service layer: `lib/services/academic/leave-onduty-approval-service.ts`
   - Hook layer: `hooks/academic/use-leave-onduty.ts`
   - Component layer: `app/(routes)/academic/leave-onduty/approvals/page.tsx`

2. **Error captured**:
   ```
   Failed to fetch pending applications: column institutions_1.institution_name does not exist
   ```

3. **Schema verification** (`supabase/setup/01_tables.sql`):
   ```sql
   CREATE TABLE institutions (
       id UUID PRIMARY KEY,
       name VARCHAR(255) NOT NULL,  -- ✅ Column is 'name'
       -- ... other fields
   );
   ```

### Phase 2: Pattern Analysis

**Comparison with working code:**
- Regular approver query works (doesn't select institution)
- TypeScript types already correct: `institution?: { id: string; name: string; }`
- Only super admin query had the bug

**Verified all tables:**
- ✅ `learners_profiles` - correct fields: `first_name`, `last_name`, `roll_number`, `register_number`, `student_email`
- ✅ `sections` - correct field: `section_name`
- ❌ `institutions` - used wrong field: `institution_name` (should be `name`)

### Phase 3: Hypothesis and Testing

**Hypothesis**: Query uses wrong column name `institution_name` instead of `name`.

**Minimal fix**: Change only the column name in the query.

---

## Solution

### Files Modified (3 files)

#### 1. Service Query (`lib/services/academic/leave-onduty-approval-service.ts:377`)

```diff
  institution:institution_id(
    id,
-   institution_name
+   name
  ),
```

#### 2. Display Code - List View (`app/(routes)/academic/leave-onduty/approvals/page.tsx:333`)

```diff
  {isSuperAdmin && application.institution && (
    <Badge variant="outline" className="text-xs">
-     {application.institution.institution_name}
+     {application.institution.name}
    </Badge>
  )}
```

#### 3. Display Code - Detail View (`app/(routes)/academic/leave-onduty/approvals/page.tsx:505`)

```diff
  {isSuperAdmin && selectedApplication.institution && (
    <p className="text-sm text-gray-500 mt-1">
-     Institution: {selectedApplication.institution.institution_name}
+     Institution: {selectedApplication.institution.name}
    </p>
  )}
```

---

## Verification

### Before Fix
```
❌ Error: column institutions_1.institution_name does not exist
❌ Super admin cannot view approvals
```

### After Fix
```
✅ Query succeeds
✅ Super admin can view all pending applications across institutions
✅ Institution names display correctly
```

### Test Cases
1. ✅ Super admin can load approvals page
2. ✅ Applications from all institutions are visible
3. ✅ Institution badge displays correct name in list view
4. ✅ Institution name displays correct in detail modal
5. ✅ Regular approvers still work (no regression)

---

## Type Safety

The TypeScript types were **already correct**:

```typescript
// types/leave-onduty.ts:64-67
institution?: {
  id: string;
  name: string;  // ✅ Correct
};
```

This prevented the bug from spreading to other parts of the codebase.

---

## Lessons Learned

1. **Always verify column names** against actual database schema
2. **TypeScript types don't catch runtime field name errors** in Supabase queries
3. **Diagnostic logging** is crucial for tracking down query errors
4. **Check display code** after fixing query - both need to use correct field names

---

## Related Files

- Service: `lib/services/academic/leave-onduty-approval-service.ts`
- Hook: `hooks/academic/use-leave-onduty.ts`
- Page: `app/(routes)/academic/leave-onduty/approvals/page.tsx`
- Types: `types/leave-onduty.ts` (already correct)
- Schema: `supabase/setup/01_tables.sql` (institutions table)

---

## Prevention

**Future safeguards:**

1. Add schema validation tests for Supabase queries
2. Consider using Supabase type generation for compile-time checks
3. Add integration tests for super admin approval flows
4. Document all foreign key column names in schema reference

---

**Status**: ✅ Fixed and verified
**Testing**: Manual testing by super admin user
**Deployment**: Ready for production
