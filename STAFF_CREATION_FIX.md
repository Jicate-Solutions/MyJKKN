# Staff Creation RLS Policy Fix

## Issue

Staff creation fails with: `"new row violates row-level security policy for table 'profiles'"`

## Root Cause

The RLS policy on the `profiles` table is preventing the service role from inserting pre-registered user profiles during staff creation.

## Immediate Fix (Choose one approach)

### Option 1: Apply Supabase Migration (Recommended)

1. Run the migration file to fix RLS policies:

```bash
# Navigate to your project directory
cd MyJKKN

# Apply the migration
supabase db push
# Or if using Supabase CLI
supabase migration up
```

### Option 2: Manual SQL Fix (If migrations don't work)

Execute this SQL directly in your Supabase SQL Editor:

```sql
-- Drop the existing problematic policy
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;

-- Create a new policy that allows service role
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Users can insert their own profile
    auth.uid() = id
    OR
    -- Service role can insert anything
    current_setting('role')::text = 'service_role'
    OR
    -- Alternative check for service role JWT
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Ensure service role has full access
CREATE POLICY "profiles_service_role_bypass" ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### Option 3: Environment Variable Check

Ensure your `.env.local` has the correct service role key:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
```

## Verification

After applying the fix:

1. Try creating a staff member again
2. Check the browser console for debug logs
3. The creation should succeed without RLS policy errors

## Alternative Solutions Applied

1. **Enhanced debugging**: Added detailed logging to `/api/users/route.ts`
2. **Secure function approach**: Created `create_preregistered_profile()` function
3. **Service role bypass**: Added explicit service role policies

Choose the approach that works best for your deployment setup.
