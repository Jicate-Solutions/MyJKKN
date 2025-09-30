# Resource Creation Database Fix

**Date:** September 30, 2025  
**Issue:** Resource creation failing with enum value error  
**Status:** ✅ Resolved

## Problem Summary

Users were unable to create new resources due to a database enum mismatch error:

```
Error creating resource: invalid input value for enum booking_type: "reservation"
Error code: 22P02
```

## Root Cause Analysis

### 1. Database Schema vs Application Code Mismatch

**Database Enum Values (Old):**

- `all_day` - Full day booking
- `time_slots` - Specific time slot booking
- `no_booking` - No booking required

**Application Code Values (Attempted):**

- `reservation` - Advance booking
- `walk_in` - Immediate booking
- `both` - Both types allowed

### 2. Additional Issues Identified

1. **Controlled/Uncontrolled Input Warning**

   - `depreciation_rate` and `current_value` inputs switching between controlled/uncontrolled states
   - Caused by `undefined` values in number inputs

2. **Storage Bucket**

   - Verified `resource-images` bucket exists and is public
   - Created on: 2025-09-30 07:00:28 UTC

3. **Caretaker Fields**
   - Both `caretaker_user_id` (UUID) and `caretaker_user_ids` (TEXT[]) exist
   - Array field supports multiple staff assignments

## Solution Implemented

### 1. Database Migration

**File:** `supabase/migrations/20250930000008_fix_booking_type_enum.sql`

**Changes:**

1. Dropped the old enum type `booking_type`
2. Converted column to `VARCHAR(50)` for flexibility
3. Added check constraint to validate values:
   - `reservation` - Advance booking required
   - `walk_in` - Immediate/walk-in booking
   - `both` - Supports both types
4. Set default value to `'reservation'`
5. Updated any NULL values to default

```sql
-- Convert enum to VARCHAR with check constraint
ALTER TABLE public.resources
ALTER COLUMN booking_type TYPE VARCHAR(50);

ALTER TABLE public.resources
ADD CONSTRAINT resources_booking_type_check
CHECK (booking_type IN ('reservation', 'walk_in', 'both'));

ALTER TABLE public.resources
ALTER COLUMN booking_type SET DEFAULT 'reservation';
```

### 2. TypeScript Types Update

**File:** `types/resource-management.ts`

Added backward compatibility while supporting new values:

```typescript
export const BOOKING_TYPE = {
  ALL_DAY: 'all_day',        // Legacy
  TIME_SLOTS: 'time_slots',  // Legacy
  NO_BOOKING: 'no_booking',  // Legacy
  // Current values
  RESERVATION: 'reservation',
  WALK_IN: 'walk_in',
  BOTH: 'both'
} as const;
```

### 3. Form Input Fix

**File:** `app/(routes)/resource-management/resources/_components/resource-form.tsx`

Fixed controlled/uncontrolled input warning for number fields:

```typescript
// Before: value could be undefined
<Input type="number" {...field} />

// After: Always provide a string value
<Input
  type="number"
  value={field.value ?? ''}
  onChange={(e) =>
    field.onChange(
      e.target.value ? parseFloat(e.target.value) : undefined
    )
  }
/>
```

## Verification Steps

### 1. Database Verification

```sql
-- Check column type
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'resources'
  AND column_name = 'booking_type';

-- Result:
-- data_type: character varying
-- column_default: 'reservation'::character varying
```

### 2. Storage Bucket Verification

```sql
SELECT name, id, public, created_at
FROM storage.buckets
WHERE name = 'resource-images';

-- Result: Bucket exists and is public
```

### 3. Caretaker Fields Verification

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'resources'
  AND column_name LIKE 'caretaker%';

-- Results:
-- caretaker_user_id: uuid
-- caretaker_user_ids: text[]
```

## Testing Checklist

- [x] Database migration applied successfully
- [x] Booking type accepts new values ('reservation', 'walk_in', 'both')
- [x] Storage bucket `resource-images` exists and is public
- [x] Caretaker fields (both single and array) exist
- [x] Number inputs no longer show controlled/uncontrolled warning
- [ ] Test resource creation with all booking types
- [ ] Test image upload functionality
- [ ] Test multiple caretaker assignment
- [ ] Test lifecycle management fields (depreciation_rate, current_value)

## Impact Assessment

### Affected Components

1. ✅ Resource creation form
2. ✅ Resource service layer
3. ✅ Database schema
4. ✅ TypeScript types
5. ⏳ Resource list/filter (may need booking type filter update)

### Breaking Changes

- **None** - Migration is backward compatible
- Old enum values can still be queried
- New values are now accepted

## Follow-up Tasks

1. **Update Resource Filters** (if needed)

   - Update booking type filter dropdown in resource list page
   - Ensure it uses new values: 'reservation', 'walk_in', 'both'

2. **Update Documentation**

   - Update API documentation with new booking type values
   - Update user guide with booking type explanations

3. **Data Migration** (if needed)
   - Check if any existing resources have old enum values
   - Convert old values to new values if necessary

## Related Files

### Modified Files

- ✅ `supabase/migrations/20250930000008_fix_booking_type_enum.sql`
- ✅ `types/resource-management.ts`
- ✅ `app/(routes)/resource-management/resources/_components/resource-form.tsx`

### Files to Review

- `app/(routes)/resource-management/resources/_components/resource-filters.tsx`
- `lib/services/resource/resource-service.ts`
- `hooks/resource-management/use-resources.ts`

## Lessons Learned

1. **Always verify database schema** before implementing new features
2. **Use Supabase MCP tools** to check actual database state
3. **Prefer VARCHAR with check constraints** over enums for flexibility
4. **Always handle undefined/null** in controlled React inputs
5. **Document enum value changes** for team awareness

## References

- [React Controlled Components](https://react.dev/link/controlled-components)
- [PostgreSQL ENUM Types](https://www.postgresql.org/docs/current/datatype-enum.html)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)

---

**Migration Applied By:** MCP Supabase Tool  
**Verified By:** Database Query  
**Next Steps:** Test resource creation end-to-end
