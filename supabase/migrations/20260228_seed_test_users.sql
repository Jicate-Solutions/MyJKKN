-- =============================================================
-- Seed: Test Users for Quick Login (Dev/Staging)
-- Created: 2026-02-28
-- Purpose: Creates demo institution + 9 test accounts for
--          ENABLE_DEV_AUTH quick login panel
--
-- Fix (applied same day): confirmation_token, recovery_token,
-- email_change_token_new, email_change must be '' not NULL — GoTrue's
-- Go code scans these into non-pointer string fields; NULL crashes scan.
-- phone stays NULL (GoTrue uses *string; unique constraint blocks '' for N rows).
-- =============================================================

-- 1. Extend profiles.role CHECK constraint to include principal + parent
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'student','staff','admin','super_admin','administrator',
    'faculty','hod','guest','driver','store_admin',
    'principal','parent'
  ));

-- 2. Create demo institution + all 9 users atomically
DO $$
DECLARE
  inst_id    UUID := gen_random_uuid();
  uid_sa     UUID := gen_random_uuid();
  uid_admin  UUID := gen_random_uuid();
  uid_prin   UUID := gen_random_uuid();
  uid_hod    UUID := gen_random_uuid();
  uid_fac    UUID := gen_random_uuid();
  uid_staff  UUID := gen_random_uuid();
  uid_stu1   UUID := gen_random_uuid();
  uid_stu2   UUID := gen_random_uuid();
  uid_par    UUID := gen_random_uuid();
  pw_std     TEXT := crypt('Test@123',       gen_salt('bf'));
  pw_sa      TEXT := crypt('SuperAdmin@123', gen_salt('bf'));
BEGIN

  -- Demo institution
  INSERT INTO public.institutions (id, name, email, city, state, is_active)
  VALUES (inst_id, 'JKKN College of Engineering & Technology',
          'info@jkkn.ac.in', 'Komarapalayam', 'Tamil Nadu', true);

  -- Auth users
  -- IMPORTANT: These varchar columns have no DEFAULT and GoTrue reads them into
  -- non-pointer Go strings — NULL causes "Scan error: converting NULL to string
  -- is unsupported" (HTTP 500). Must be explicitly set to '':
  --   confirmation_token, recovery_token, email_change_token_new, email_change
  -- NOTE: phone is intentionally omitted (stays NULL) — GoTrue uses *string for
  -- phone so NULL is safe, and auth.users has a unique constraint on phone
  -- preventing multiple rows from holding ''.
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', uid_sa,    'authenticated','authenticated','test-superadmin@jkkn.local', pw_sa,  NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Super Admin"}',   '','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_admin, 'authenticated','authenticated','test.admin2@jkkn.local',      pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Admin"}',         '','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_prin,  'authenticated','authenticated','test.principal@jkkn.local',   pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Principal"}',     '','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_hod,   'authenticated','authenticated','test.hod@jkkn.local',         pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test HOD"}',           '','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_fac,   'authenticated','authenticated','test.faculty@jkkn.local',     pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Faculty"}',       '','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_staff, 'authenticated','authenticated','test.staff@jkkn.local',       pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Staff"}',         '','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_stu1,  'authenticated','authenticated','test.student@jkkn.local',     pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Hostel Student"}','','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_stu2,  'authenticated','authenticated','test.dayscholars@jkkn.local', pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Day Scholar"}',   '','','','',NOW(),NOW()),
    ('00000000-0000-0000-0000-000000000000', uid_par,   'authenticated','authenticated','test.parent@jkkn.local',      pw_std, NOW(),'{"provider":"email","providers":["email"]}','{"full_name":"Test Parent"}',        '','','','',NOW(),NOW());

  -- Auth identities (required for email/password sign-in to work)
  INSERT INTO auth.identities
    (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), uid_sa,    'test-superadmin@jkkn.local', jsonb_build_object('sub',uid_sa::text,   'email','test-superadmin@jkkn.local'), 'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_admin, 'test.admin2@jkkn.local',      jsonb_build_object('sub',uid_admin::text,'email','test.admin2@jkkn.local'),      'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_prin,  'test.principal@jkkn.local',   jsonb_build_object('sub',uid_prin::text, 'email','test.principal@jkkn.local'),   'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_hod,   'test.hod@jkkn.local',         jsonb_build_object('sub',uid_hod::text,  'email','test.hod@jkkn.local'),         'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_fac,   'test.faculty@jkkn.local',     jsonb_build_object('sub',uid_fac::text,  'email','test.faculty@jkkn.local'),     'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_staff, 'test.staff@jkkn.local',       jsonb_build_object('sub',uid_staff::text,'email','test.staff@jkkn.local'),       'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_stu1,  'test.student@jkkn.local',     jsonb_build_object('sub',uid_stu1::text, 'email','test.student@jkkn.local'),     'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_stu2,  'test.dayscholars@jkkn.local', jsonb_build_object('sub',uid_stu2::text, 'email','test.dayscholars@jkkn.local'), 'email', NOW(),NOW(),NOW()),
    (gen_random_uuid(), uid_par,   'test.parent@jkkn.local',      jsonb_build_object('sub',uid_par::text,  'email','test.parent@jkkn.local'),      'email', NOW(),NOW(),NOW());

  -- Update profile stubs (auto-created by on_auth_user_created trigger)
  -- Note: profiles table has no is_super_admin column; role='super_admin' is the signal
  UPDATE public.profiles SET role='super_admin',   profile_completed=true, institution_id=NULL    WHERE id=uid_sa;
  UPDATE public.profiles SET role='administrator', profile_completed=true, institution_id=inst_id WHERE id=uid_admin;
  UPDATE public.profiles SET role='principal',     profile_completed=true, institution_id=inst_id WHERE id=uid_prin;
  UPDATE public.profiles SET role='hod',           profile_completed=true, institution_id=inst_id WHERE id=uid_hod;
  UPDATE public.profiles SET role='faculty',       profile_completed=true, institution_id=inst_id WHERE id=uid_fac;
  UPDATE public.profiles SET role='staff',         profile_completed=true, institution_id=inst_id WHERE id=uid_staff;
  UPDATE public.profiles SET role='student',       profile_completed=true, institution_id=inst_id WHERE id=uid_stu1;
  UPDATE public.profiles SET role='student',       profile_completed=true, institution_id=inst_id WHERE id=uid_stu2;
  UPDATE public.profiles SET role='parent',        profile_completed=true, institution_id=inst_id WHERE id=uid_par;

END $$;
