-- Migration: Fix get_user_accessible_institutions() to honor custom_roles.institution_scope='all'.
--
-- Bug: Service-layer institution filters in billing/organization modules use this SQL
-- function to compute "what institutions can this user see". The function only
-- returned the user's primary institution + explicit user_institution_access grants —
-- it had no awareness of custom_roles.institution_scope='all'. This caused users with
-- scope='all' roles (admission, admission_staff, counselor) to be silently restricted
-- to a single institution (or zero, if profiles.institution_id was NULL), even though
-- Role Management granted them cross-institution access and the DB RLS policies (via
-- role_has_institution_access()) would have allowed them through.
--
-- Symptom: admission user granted billing.categories.* permissions could not see ANY
-- billing categories. Root cause path: useBillingParentCategories hook routes
-- non-super-admins to getBillingParentCategoriesForUser → calls this function →
-- returned [primary_institution_only] (or [] for users with NULL primary inst) →
-- service did query.in('institution_id', restricted_ids) → empty result.
--
-- Fix: Add a third UNION ALL branch that mirrors role_has_institution_access()
-- semantics (multi-role check via user_roles + legacy profiles.role -> custom_roles
-- fallback). Branches 1/2 are unchanged. Branch 3 is gated by NOT EXISTS clauses
-- against branches 1 and 2 to avoid duplicate institution rows.
--
-- Blast radius: function is used by 17 callers (all of lib/services/organization/*,
-- billing categories, staff form, dashboard, lib/auth/api-institution-filter.ts).
-- All callers use the function for "what can I show this user", never for
-- "what should I hide" — so widening the result set is safe.
--
-- Verified after apply (2026-04-27):
--   • test.admission@jkkn.ac.in (scope='all', primary inst set):    1 → 13 ✓
--   • admission@jkkn.ac.in       (scope='all', NULL primary inst):  0 → 13 ✓
--   • test.admission_staff@jkkn  (scope='all'):                       → 13 ✓
--   • test.faculty@jkkn (counselor, scope='all'):                     → 13 ✓
--   • test.hod@jkkn.ac.in (scope='own'):                            1 → 1  ✓ (unchanged — bystander)

CREATE OR REPLACE FUNCTION public.get_user_accessible_institutions(target_user_id uuid)
RETURNS TABLE(
    institution_id uuid,
    institution_name varchar,
    counselling_code varchar,
    access_type varchar,
    is_primary_institution boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    -- Branch 1: user's primary institution from profiles
    SELECT
        i.id,
        i.name::varchar,
        i.counselling_code::varchar,
        'primary'::varchar,
        true
    FROM profiles p
    JOIN institutions i ON i.id = p.institution_id
    WHERE p.id = target_user_id
      AND p.institution_id IS NOT NULL
      AND i.is_active = true

    UNION ALL

    -- Branch 2: explicit cross-institution grants (skipping primary to avoid dupes)
    SELECT
        i.id,
        i.name::varchar,
        i.counselling_code::varchar,
        uia.access_type::varchar,
        false
    FROM institutions i
    JOIN user_institution_access uia ON i.id = uia.institution_id
    WHERE uia.user_id = target_user_id
      AND uia.is_active = true
      AND i.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = target_user_id
            AND p.institution_id = i.id
      )

    UNION ALL

    -- Branch 3 (NEW): if user has any role with institution_scope='all', include
    -- every active institution. Mirrors role_has_institution_access() — checks both
    -- user_roles (multi-role) and legacy profiles.role -> custom_roles fallback.
    SELECT
        i.id,
        i.name::varchar,
        i.counselling_code::varchar,
        'role_scope_all'::varchar,
        false
    FROM institutions i
    WHERE i.is_active = true
      AND (
          EXISTS (
              SELECT 1
              FROM user_roles ur
              JOIN custom_roles cr ON cr.id = ur.role_id
              WHERE ur.user_id = target_user_id
                AND cr.institution_scope = 'all'
          )
          OR EXISTS (
              SELECT 1
              FROM profiles p
              JOIN custom_roles cr ON p.role = cr.role_key
              WHERE p.id = target_user_id
                AND cr.institution_scope = 'all'
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = target_user_id
            AND p.institution_id = i.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM user_institution_access uia
          WHERE uia.user_id = target_user_id
            AND uia.institution_id = i.id
            AND uia.is_active = true
      );
END;
$$;
