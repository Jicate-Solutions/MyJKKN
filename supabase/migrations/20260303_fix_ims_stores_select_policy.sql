-- Migration: 20260303_fix_ims_stores_select_policy
-- Date: 2026-03-03
-- Purpose: Relax ims_stores SELECT RLS to allow all authenticated users to read store list.
--
-- Reason: The institution-scoped SELECT policy depends on auth.uid() resolving correctly
--         inside get_current_user_role(). For super_admin users with institution_id = NULL,
--         there is a timing issue where the @supabase/ssr PKCE cookie session may not be
--         fully established when PostgREST evaluates the policy, causing auth.uid() to
--         return NULL, which makes get_current_user_role() return NULL, failing the
--         'super_admin' check and silently returning 0 rows.
--
-- Impact: SELECT only. INSERT/UPDATE/DELETE policies remain institution-scoped.
--
-- Security rationale:
--   - Store names/codes are operational metadata, not confidential
--   - Service layer already filters by institution_id for non-super-admins
--   - Same pattern used for ims_units and ims_item_categories (global lookups)

-- Step 1: Drop the existing institution-scoped SELECT policy
DROP POLICY IF EXISTS "ims_stores_select" ON public.ims_stores;

-- Step 2: Create permissive SELECT policy for all authenticated users
CREATE POLICY "ims_stores_select"
  ON public.ims_stores FOR SELECT TO authenticated
  USING (true);
