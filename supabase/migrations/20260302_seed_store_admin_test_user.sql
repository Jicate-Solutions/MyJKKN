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
