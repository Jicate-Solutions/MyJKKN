-- 2026-04-22 - Fix: staff INSERT fails with "permission denied for table users" (42501)
-- for non-super-admin staff.create callers (HOD, administrator, etc.).
--
-- Root cause
-- ----------
-- The BEFORE INSERT trigger sync_staff_to_profiles() on public.staff performs a
-- fallback profile lookup whose ORDER BY references auth.users:
--     ORDER BY (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) DESC,
--              p.updated_at DESC
-- The function was LANGUAGE plpgsql (no SECURITY clause) = SECURITY INVOKER, so
-- it executes as the caller (service_role when POST /api/staff uses supabaseAdmin).
-- auth.users grants SELECT only to postgres — not to service_role/authenticated/
-- anon — so every staff insert whose email has no pre-existing profile trips
-- ERRCODE 42501 "permission denied for table users".
--
-- Fix
-- ---
-- Recreate the function with SECURITY DEFINER so it runs as its owner (postgres),
-- which has SELECT on auth.users. search_path is locked to public to prevent the
-- classic definer-function hijack risk. No behaviour change — only the privilege
-- context the trigger body runs in.
--
-- This migration also mirrors the current live function body back to source
-- control: the live version diverged from supabase/setup/02_functions.sql
-- (profile_id-first lookup + auth-linked-first tiebreaker) and was never
-- committed. The canonical file is updated in the same PR.

CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_profile_id UUID;
BEGIN
    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        -- Priority 1: use the durable FK (staff.profile_id). Survives email rename.
        IF NEW.profile_id IS NOT NULL THEN
            SELECT id INTO existing_profile_id
            FROM profiles WHERE id = NEW.profile_id;
        END IF;

        -- Priority 2: fall back to email lookup with deterministic ordering
        -- (auth-linked first, then newest). Requires SELECT on auth.users, which
        -- is why this function must be SECURITY DEFINER.
        IF existing_profile_id IS NULL THEN
            SELECT p.id INTO existing_profile_id
            FROM profiles p
            WHERE p.email = NEW.institution_email
            ORDER BY
                (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) DESC,
                p.updated_at DESC
            LIMIT 1;
        END IF;

        IF existing_profile_id IS NOT NULL THEN
            UPDATE profiles
            SET email          = NEW.institution_email,
                full_name      = CONCAT(NEW.first_name, ' ', NEW.last_name),
                phone_number   = NEW.phone,
                avatar_url     = COALESCE(NEW.profile_picture, avatar_url),
                institution_id = NEW.institution_id,
                department_id  = NEW.department_id,
                gender         = NEW.gender,
                designation    = NEW.designation,
                role           = NEW.role_key,
                is_active      = NEW.is_active,
                updated_at     = NOW()
            WHERE id = existing_profile_id;
            NEW.profile_id := existing_profile_id;
        ELSE
            existing_profile_id := gen_random_uuid();
            INSERT INTO profiles (
                id, email, full_name, phone_number, avatar_url,
                institution_id, department_id, gender, designation,
                role, is_pre_registered, is_active
            ) VALUES (
                existing_profile_id,
                NEW.institution_email,
                CONCAT(NEW.first_name, ' ', NEW.last_name),
                NEW.phone,
                NEW.profile_picture,
                NEW.institution_id,
                NEW.department_id,
                NEW.gender,
                NEW.designation,
                NEW.role_key,
                true,
                NEW.is_active
            );
            NEW.profile_id := existing_profile_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
