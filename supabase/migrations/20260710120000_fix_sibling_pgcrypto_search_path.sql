-- Migration: 20260710120000_fix_sibling_pgcrypto_search_path
-- Date: 2026-07-10
-- Purpose: Fix pgcrypto search_path bug in 4 SECURITY DEFINER functions (5 instances incl.
--          both generate_api_key overloads). Each was defined with a bare
--          `SET search_path = public`, but they call pgcrypto primitives
--          (gen_random_bytes / digest / encode / crypt) which live in the
--          `extensions` schema. With `public` only, those calls fail at runtime
--          with SQLSTATE 42883 (function ... does not exist).
--
--          Same bug class already fixed for the cal-api-key / razorpay vault fns.
--          The minimal safe fix is `ALTER FUNCTION ... SET search_path = public, extensions`
--          which adds the extensions schema WITHOUT rewriting the function body
--          (no logic change, no risk of dropping the existing definition).
--
-- Idempotent: CREATE EXTENSION IF NOT EXISTS + ALTER FUNCTION are both safe to re-run.
-- NOTE: This migration intentionally does NOT touch the already-correct
--       cal-api-key / razorpay / bulk_sync_user functions.

-- Ensure pgcrypto is installed in the extensions schema (idempotent).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- create_api_key(p_user_id uuid, p_name varchar, p_scopes text[])
ALTER FUNCTION public.create_api_key(p_user_id uuid, p_name character varying, p_scopes text[])
  SET search_path = public, extensions;

-- generate_api_key()  -- no-arg overload
ALTER FUNCTION public.generate_api_key()
  SET search_path = public, extensions;

-- generate_api_key(length integer)  -- parameterised overload
ALTER FUNCTION public.generate_api_key(length integer)
  SET search_path = public, extensions;

-- create_staff_auth_profile(staff_email text, staff_full_name text, staff_phone text, staff_institution_id uuid)
ALTER FUNCTION public.create_staff_auth_profile(staff_email text, staff_full_name text, staff_phone text, staff_institution_id uuid)
  SET search_path = public, extensions;

-- bulk_sync_applications_to_auth_server()  -- no-arg
ALTER FUNCTION public.bulk_sync_applications_to_auth_server()
  SET search_path = public, extensions;

NOTIFY pgrst, 'reload schema';
