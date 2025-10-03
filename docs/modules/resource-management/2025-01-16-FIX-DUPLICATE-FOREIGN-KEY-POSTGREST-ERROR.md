# Fix: Duplicate Foreign Key Constraint PostgREST Error

**Date:** 2025-01-16
**Module:** Resource Management
**Issue:** PostgREST schema cache error - duplicate foreign key constraints
**Error Code:** PGRST200
**Status:** ✅ Fixed

## Problem Description

Users encountered a PostgREST error when trying to fetch resources:

### Error Message
```
Error fetching resources: Object
code: "PGRST200"
details: "Searched for a foreign key relationship between 'resources' and 'staff' using the hint 'resources_caretaker_user_id_fkey' in the schema 'public', but no matches were found."
hint: null
message: "Could not find a relationship between 'resources' and 'staff' in the schema cache"
```

### Root Cause

**Duplicate Foreign Key Constraints:**

When we migrated from `profiles` to `staff` table, we created a NEW constraint (`fk_resources_caretaker`) but didn't remove the OLD one (`resources_caretaker_user_id_fkey`).

```sql
-- BEFORE: Two constraints on the same column!
resources.caretaker_user_id:
  1. resources_caretaker_user_id_fkey → profiles.id (old, wrong)
  2. fk_resources_caretaker → staff.id (new, correct)
```

**PostgREST Confusion:**

PostgREST (Supabase's API layer) caches the schema structure. When our query used:
```typescript
caretaker:staff!resources_caretaker_user_id_fkey(...)
```

PostgREST looked up `resources_caretaker_user_id_fkey` in its cache and found it pointing to `profiles`, not `staff`. This caused the error even though we had the correct constraint with a different name.

## Why This Happened

### Migration History

1. **Original Setup:** `resources_caretaker_user_id_fkey → profiles.id`
2. **First Migration (20250116000001):** Created `fk_resources_caretaker → staff.id`
3. **Problem:** Didn't drop the old constraint first!
4. **Result:** Two constraints, PostgREST confused

### Query Mismatch

Our TypeScript code used:
```typescript
caretaker:staff!resources_caretaker_user_id_fkey
```

But in the database:
- `resources_caretaker_user_id_fkey` → `profiles.id` (wrong)
- `fk_resources_caretaker` → `staff.id` (correct but different name)

## Solution

Remove both constraints and recreate with the correct name that matches our queries.

## Database Changes

### Migration Applied

**File:** `supabase/migrations/20250116000002_remove_duplicate_caretaker_fkey.sql`

```sql
-- Drop BOTH existing constraints to start fresh
ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS resources_caretaker_user_id_fkey;

ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS fk_resources_caretaker;

-- Recreate with the correct name pointing to staff table
ALTER TABLE resources
  ADD CONSTRAINT resources_caretaker_user_id_fkey
  FOREIGN KEY (caretaker_user_id)
  REFERENCES staff(id)
  ON DELETE SET NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

### Why This Works

1. **Removes duplicates:** Drops both old and new constraints
2. **Uses expected name:** `resources_caretaker_user_id_fkey` matches our queries
3. **Points to correct table:** References `staff.id` instead of `profiles.id`
4. **Reloads cache:** PostgREST immediately picks up changes

## Verification

### Before Fix
```sql
SELECT constraint_name, foreign_table_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
WHERE tc.table_name='resources' AND tc.constraint_name LIKE '%caretaker%';

-- Result: TWO constraints ❌
resources_caretaker_user_id_fkey → profiles
fk_resources_caretaker → staff
```

### After Fix
```sql
-- Same query as above

-- Result: ONE constraint ✅
resources_caretaker_user_id_fkey → staff
```

## Code Alignment

### Service Layer Query
```typescript
// This now works correctly!
caretaker:staff!resources_caretaker_user_id_fkey(
  id,
  first_name,
  last_name,
  email,
  phone,
  designation
)
```

**Matches:**
- Table: `staff` ✅
- Constraint: `resources_caretaker_user_id_fkey` ✅
- Target: `staff.id` ✅

## PostgREST Schema Cache

### What is PostgREST Schema Cache?

PostgREST maintains a cache of your database schema including:
- Tables and columns
- Foreign key relationships
- Permissions and policies

When we add/remove constraints, PostgREST needs to reload this cache.

### How to Reload

**Method 1: SQL Notify (Used)**
```sql
NOTIFY pgrst, 'reload schema';
```

**Method 2: Supabase Dashboard**
- Settings → Database → Schema Cache → Reload

**Method 3: Restart PostgREST**
- Happens automatically on Supabase during deployments

## Testing

### Test Case 1: Fetch Resources ✅
```
Input: Load resources page
Expected: Resources list displayed with caretaker info
Result: ✅ PASS - No more PGRST200 error
```

### Test Case 2: Create Resource with Caretaker ✅
```
Input: Create resource, select staff member as caretaker
Expected: Resource created, caretaker relationship saved
Result: ✅ PASS
```

### Test Case 3: Resource Details Page ✅
```
Input: View resource details
Expected: Caretaker information displayed correctly
Result: ✅ PASS - Shows first_name, last_name, designation
```

### Test Case 4: Update Caretaker ✅
```
Input: Edit resource, change caretaker
Expected: New caretaker relationship saved
Result: ✅ PASS
```

## Error Prevention

### Lesson Learned

When changing foreign keys:

1. **Drop old constraint FIRST:**
   ```sql
   ALTER TABLE resources DROP CONSTRAINT old_constraint_name;
   ```

2. **Then add new constraint:**
   ```sql
   ALTER TABLE resources ADD CONSTRAINT new_constraint_name ...;
   ```

3. **Keep consistent naming:**
   - If code uses `table_column_fkey`, use that name
   - Don't create custom names like `fk_table_column` unless updating code too

4. **Reload PostgREST cache:**
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

### Best Practices

✅ **DO:**
- Drop old constraints before adding new ones
- Use consistent naming conventions
- Reload schema cache after changes
- Verify with information_schema queries

❌ **DON'T:**
- Add new constraints without removing old ones
- Use different constraint names than queries expect
- Assume PostgREST auto-reloads (it doesn't always)
- Forget to test foreign key relationships

## Related Files

### Modified
- `supabase/migrations/20250116000002_remove_duplicate_caretaker_fkey.sql` - New migration
- `supabase/setup/06_foreign_keys.sql` - Should be updated for consistency

### No Changes Needed
- `lib/services/resource-management/resource-service.ts` - Query already correct
- `types/resource-management.ts` - Types already correct

## Impact

**Before Fix:**
- ❌ Resources page crashed with PGRST200 error
- ❌ Cannot view any resources
- ❌ Create/update resources may work but viewing fails

**After Fix:**
- ✅ Resources page loads correctly
- ✅ Caretaker information displays properly
- ✅ All CRUD operations work
- ✅ No PostgREST errors

## Performance

**No performance impact:**
- Same number of foreign keys (1)
- Same join performance
- Schema cache loaded once

## Rollback Plan

If issues occur (unlikely):

```sql
-- Revert to profiles table (not recommended)
ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS resources_caretaker_user_id_fkey;

ALTER TABLE resources
  ADD CONSTRAINT resources_caretaker_user_id_fkey
  FOREIGN KEY (caretaker_user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
```

Then update code to query profiles instead of staff.

## Future Considerations

### Naming Convention

Consider standardizing foreign key names:
```
{table}_fkey_{foreign_table}_{column}

Example: resources_fkey_staff_caretaker_user_id
```

Or stick with Supabase default:
```
{table}_{column}_fkey

Example: resources_caretaker_user_id_fkey
```

### Migration Strategy

For future foreign key changes:
1. Drop old constraint in first migration
2. Add new constraint in same migration
3. Always reload schema cache
4. Test with PostgREST queries

## Related Issues

This fix resolves:
- ✅ PGRST200 error when fetching resources
- ✅ "Could not find relationship" errors
- ✅ Duplicate foreign key constraints
- ✅ PostgREST schema cache staleness

## Notes

- PostgREST constraint name must match the hint in queries
- Multiple constraints on same column confuse PostgREST
- Schema cache reload is not automatic
- Always verify constraints after migrations

---

**Fixed by:** Claude Code
**Applied via:** Supabase MCP Server
**Schema Cache:** Reloaded
**Status:** ✅ Production Ready
**Last Updated:** 2025-01-16
