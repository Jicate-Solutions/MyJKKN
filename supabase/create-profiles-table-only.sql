-- =====================================================
-- CREATE PROFILES TABLE ONLY (Quick Fix)
-- =====================================================
-- Use this if you need to get auth working quickly
-- without running all setup files
-- =====================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT,
    full_name TEXT,
    phone_number TEXT,
    role TEXT NOT NULL DEFAULT 'student'::text,
    institution_id UUID,
    department_id UUID,
    profile_completed BOOLEAN DEFAULT false,
    avatar_url TEXT,
    date_of_birth DATE,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',
    postal_code TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for profiles

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Grant permissions
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- Verify table was created
SELECT
  table_name,
  table_schema,
  '✅ Table created successfully!' as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'profiles';

-- Check RLS is enabled
SELECT
  tablename,
  rowsecurity as rls_enabled,
  CASE
    WHEN rowsecurity THEN '✅ RLS is enabled'
    ELSE '⚠️ RLS is not enabled'
  END as security_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'profiles';

-- List RLS policies
SELECT
  policyname,
  cmd as operation,
  '✅ Policy created' as status
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd;

-- Success message
SELECT '✅ Profiles table created and schema cache refreshed!' as result;
SELECT '🔄 Please refresh your browser and try logging in again' as next_step;
