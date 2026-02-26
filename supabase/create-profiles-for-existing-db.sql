-- =====================================================
-- CREATE PROFILES TABLE FOR EXISTING DATABASE
-- =====================================================
-- This creates a profiles table that works alongside
-- your existing users table without breaking anything
-- =====================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. CREATE PROFILES TABLE (for authentication)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    -- Core authentication fields
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    full_name TEXT,
    phone_number TEXT,
    avatar_url TEXT,

    -- Role and permissions
    role TEXT NOT NULL DEFAULT 'student',

    -- Optional: Reference to existing users table
    legacy_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

    -- Institution linkage (for MyJKKN IMS)
    institution_id UUID,
    department_id UUID,

    -- Profile completion tracking
    profile_completed BOOLEAN DEFAULT false,

    -- Additional contact info
    date_of_birth DATE,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',
    postal_code TEXT,

    -- Emergency contact
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_institution_id ON public.profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_legacy_user_id ON public.profiles(legacy_user_id);

-- =====================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role has full access to profiles" ON public.profiles;

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

-- Policy: Service role has full access (for server-side operations)
CREATE POLICY "Service role has full access to profiles"
ON public.profiles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- 4. CREATE TRIGGER FOR AUTO-UPDATE TIMESTAMP
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on profiles table
DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- 5. CREATE FUNCTION TO AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 6. OPTIONAL: SYNC EXISTING USERS TO PROFILES
-- =====================================================

-- This will copy your 2 existing users to profiles table
-- Only if they have matching auth.users entries
-- Uncomment if you want to sync existing data:

-- INSERT INTO public.profiles (
--   id,
--   email,
--   full_name,
--   phone_number,
--   avatar_url,
--   role,
--   department_id,
--   legacy_user_id,
--   is_active,
--   created_at,
--   updated_at
-- )
-- SELECT
--   u.id,
--   u.email,
--   u.full_name,
--   u.phone,
--   u.avatar_url,
--   u.role,
--   u.department_id,
--   u.id as legacy_user_id,
--   u.is_active,
--   u.created_at,
--   u.updated_at
-- FROM public.users u
-- WHERE EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
-- ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- =====================================================
-- 8. REFRESH POSTGREST SCHEMA CACHE
-- =====================================================

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- =====================================================
-- 9. VERIFICATION
-- =====================================================

-- Check if profiles table was created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = 'profiles' AND columns.table_schema = 'public') as column_count,
  '✅ Profiles table created successfully!' as status
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
  '✅ Policy active' as status
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd;

-- Count profiles
SELECT
  COUNT(*) as profile_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ Table ready for new users'
    ELSE '✅ Table has ' || COUNT(*) || ' profiles'
  END as status
FROM public.profiles;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

SELECT '🎉 Success! Profiles table created and configured!' as result;
SELECT '🔄 Schema cache refreshed - PostgREST will now recognize the table' as cache_status;
SELECT '🔐 RLS policies applied - Users can only access their own data' as security;
SELECT '⚡ Auto-trigger configured - New users will auto-create profiles' as automation;
SELECT '🔗 Legacy users table preserved - No data lost' as compatibility;
SELECT '' as blank_line;
SELECT '📋 NEXT STEPS:' as instructions;
SELECT '1. Refresh your browser (F5)' as step1;
SELECT '2. Go to http://localhost:3000/auth/login' as step2;
SELECT '3. Click "Continue with Google"' as step3;
SELECT '4. Sign in and complete your profile' as step4;
SELECT '5. You should now be redirected to dashboard! ✅' as step5;
