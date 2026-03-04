-- ============================================================
-- STEP 3: IMS Seeds (dev/staging only)
-- Run AFTER STEP2.
-- Seeds: 15 measurement units + store admin test user.
--
-- STAGING ADAPTATION (2026-03-03):
--   Pre-flight checks confirmed all 9 test users already exist in staging,
--   linked to institution a1111111-1111-1111-1111-111111111111
--   ("JKKN College of Engineering", admin@jkkn.ac.in).
--   The 20260228_seed_test_users.sql DO block has been REMOVED to avoid
--   auth.users unique constraint violations.
--   The storeadmin lookup now uses the existing institution directly.
-- ============================================================


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260218_seed_default_ims_units.sql
-- ─────────────────────────────────────────────────
-- Migration: Seed default IMS measurement units
-- Date: 2026-02-18
-- Description: Insert common measurement units into ims_units table.
-- The ims_units table was empty, which blocked item creation
-- because the Base Unit dropdown had no options.
-- ON CONFLICT DO NOTHING ensures idempotency.

INSERT INTO public.ims_units (name, abbreviation, is_base_unit) VALUES
  ('Piece', 'pcs', true),
  ('Kilogram', 'kg', true),
  ('Gram', 'g', false),
  ('Litre', 'L', true),
  ('Millilitre', 'mL', false),
  ('Meter', 'm', true),
  ('Centimeter', 'cm', false),
  ('Box', 'box', true),
  ('Pack', 'pack', true),
  ('Dozen', 'doz', false),
  ('Ream', 'ream', true),
  ('Bottle', 'btl', true),
  ('Roll', 'roll', true),
  ('Set', 'set', true),
  ('Pair', 'pair', true)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260228_seed_test_users.sql
-- ─────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────
-- File: supabase/migrations/20260302_seed_store_admin_test_user.sql
-- ─────────────────────────────────────────────────
-- =============================================================
-- Seed: Store Admin Test User for Quick Login (Dev/Staging)
-- Created: 2026-03-02
-- Purpose: Adds test.storeadmin@jkkn.local for the Store Admin
--          role button in the ENABLE_DEV_AUTH quick login panel.
--
-- Follows the GoTrue-safe pattern from 20260228_seed_test_users.sql:
--   confirmation_token, recovery_token, email_change_token_new,
--   email_change must be '' (not NULL) — GoTrue scans these columns
--   into non-pointer Go strings; NULL causes HTTP 500 scan panic.
--   phone stays NULL (GoTrue uses *string; unique constraint blocks
--   multiple '' values on the phone column).
--
-- assigned_store_id is left NULL — the user selects a store from
-- the IMS dashboard after first login.
-- =============================================================

DO $$
DECLARE
  inst_id    UUID;
  uid_store  UUID := gen_random_uuid();
  pw_std     TEXT := crypt('Test@123', gen_salt('bf'));
BEGIN

  -- Look up the demo institution created by 20260228_seed_test_users.sql
  SELECT id INTO inst_id
  FROM public.institutions
  WHERE email = 'info@jkkn.ac.in'
  LIMIT 1;

  IF inst_id IS NULL THEN
    RAISE EXCEPTION 'Demo institution (info@jkkn.ac.in) not found. '
      'Run 20260228_seed_test_users.sql first.';
  END IF;

  -- Skip if user already exists (idempotent re-run safety)
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'test.storeadmin@jkkn.local') THEN
    RAISE NOTICE 'test.storeadmin@jkkn.local already exists — skipping.';
    RETURN;
  END IF;

  -- Auth user
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000',
     uid_store, 'authenticated', 'authenticated',
     'test.storeadmin@jkkn.local', pw_std,
     NOW(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Test Store Admin"}',
     '', '', '', '',
     NOW(), NOW());

  -- Auth identity (required for email/password sign-in)
  INSERT INTO auth.identities
    (id, user_id, provider_id, identity_data, provider,
     last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(),
     uid_store, 'test.storeadmin@jkkn.local',
     jsonb_build_object('sub', uid_store::text, 'email', 'test.storeadmin@jkkn.local'),
     'email',
     NOW(), NOW(), NOW());

  -- Update profile stub (auto-created by on_auth_user_created trigger)
  -- assigned_store_id stays NULL; user selects store from IMS dashboard
  UPDATE public.profiles
  SET role = 'store_admin',
      profile_completed = true,
      institution_id = inst_id
  WHERE id = uid_store;

END $$;

