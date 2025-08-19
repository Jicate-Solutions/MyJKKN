# Bug Reports Infinite Recursion Fix

## Problem

When submitting a bug report, you get an error:

```
infinite recursion detected in policy for relation "bug_report_participants"
```

## Root Cause

The issue occurs due to a circular dependency in Supabase RLS policies:

1. When a bug report is created, a trigger automatically tries to add the reporter as a participant
2. The `participants_insert_admin` RLS policy checks if the user is the reporter by querying the `bug_reports` table
3. This can create infinite recursion between the two tables

## Solution

### Step 1: Apply Database Migrations

Run these SQL migrations in your Supabase dashboard (SQL Editor):

**Migration 1: Add missing columns**

```sql
-- Execute the contents of: supabase/migrations/add_missing_bug_participant_columns.sql
```

**Migration 2: Fix RLS policies**

```sql
-- Execute the contents of: supabase/migrations/fix_bug_report_participants_rls.sql
```

### Step 2: Verify the Fix

1. **Check that the trigger function uses SECURITY DEFINER:**

   ```sql
   SELECT routine_name, security_type
   FROM information_schema.routines
   WHERE routine_name = 'add_bug_reporter_as_participant';
   ```

   Should return `DEFINER` for `security_type`.

2. **Check that the new RLS policy exists:**

   ```sql
   SELECT policyname, cmd, qual
   FROM pg_policies
   WHERE tablename = 'bug_report_participants'
   AND policyname = 'participants_insert_simple';
   ```

3. **Test bug report submission:**
   - Try submitting a bug report through the widget
   - Should succeed without infinite recursion error

### Step 3: Alternative Manual Fix (if migrations don't work)

If you prefer to apply the fixes manually in Supabase dashboard:

1. **Update the trigger function:**

   ```sql
   CREATE OR REPLACE FUNCTION public.add_bug_reporter_as_participant()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   BEGIN
       INSERT INTO public.bug_report_participants (
           bug_report_id, user_id, role, can_view_internal, is_active, joined_at
       )
       VALUES (
           NEW.id, NEW.reporter_user_id, 'reporter', false, true, now()
       )
       ON CONFLICT (bug_report_id, user_id) DO NOTHING;

       RETURN NEW;
   END;
   $$;
   ```

2. **Drop the old policy:**

   ```sql
   DROP POLICY IF EXISTS "participants_insert_admin" ON bug_report_participants;
   ```

3. **Create the new policy:**

   ```sql
   CREATE POLICY "participants_insert_simple" ON bug_report_participants
       FOR INSERT WITH CHECK (
           is_super_admin() OR
           user_id = auth.uid()
       );
   ```

4. **Add unique constraint:**
   ```sql
   ALTER TABLE public.bug_report_participants
   ADD CONSTRAINT bug_report_participants_unique_user_report
   UNIQUE (bug_report_id, user_id);
   ```

## Key Changes Made

1. **SECURITY DEFINER**: The trigger function now runs with elevated privileges, bypassing RLS
2. **Simplified RLS Policy**: Removed circular dependency by simplifying the insert policy
3. **Unique Constraint**: Prevents duplicate participants
4. **API Fallback**: Added manual participant creation in the API as a safety net
5. **Missing Columns**: Added `can_view_internal`, `is_active`, and `joined_at` columns

## Testing

After applying the fix, test by:

1. Opening the bug report widget
2. Filling out a bug report with description
3. Taking a screenshot (optional)
4. Submitting the report
5. Should receive success message and redirect to bug reports page

## Files Modified

- `app/api/bug-reports/route.ts` - Added fallback participant creation
- `supabase/migrations/fix_bug_report_participants_rls.sql` - Main RLS fix
- `supabase/migrations/add_missing_bug_participant_columns.sql` - Schema updates

The fix ensures that bug reports can be submitted successfully without infinite recursion errors while maintaining proper security through RLS policies.
