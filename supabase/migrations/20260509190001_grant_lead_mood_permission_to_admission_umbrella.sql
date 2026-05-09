-- Migration: Backfill admission.counselors.lead_mood permission to existing admission roles
--
-- BACKGROUND:
-- PR #779 (2026-05-08) shipped the Lead Mood Digest feature at
-- /admission/counselors/lead-mood and registered a new permission key
-- admission.counselors.lead_mood in lib/constants/permissions.ts +
-- mapped it in lib/sidebarMenuLink.ts MENU_PERMISSIONS. The PR itself
-- did not seed the new key into existing custom_roles.permissions, so
-- non-super-admin roles that legitimately need admission CRM access
-- are missing it.
--
-- RESOLUTION (Path B per Director directive 2026-05-09):
-- For every active custom_role that already holds AT LEAST ONE
-- admission.counselors.* key set to true, grant the new lead_mood key
-- with value=true. This mirrors the umbrella-admission grant pattern
-- already used by admission.counselors.team.view (which IS seeded
-- across 11 roles).
--
-- IDEMPOTENT: Uses jsonb_set with concat semantics. If the key is
-- already present (true or false), this UPDATE will not change rows
-- where the resulting permissions value is identical to the input
-- (Postgres compares the row image, but to be extra-safe we filter
-- out roles already at lead_mood=true via the WHERE clause).
--
-- REVERSIBLE:
--   UPDATE custom_roles
--   SET permissions = permissions - 'admission.counselors.lead_mood'
--   WHERE permissions ? 'admission.counselors.lead_mood';
--
-- AFFECTED ROLES (verified 2026-05-09 via dry-run query):
--   admission, admission_staff, ceo, coo, executive_admin_officer,
--   admission_counselor, expo_counselor, health_counselor,
--   learner_counselor, registrar, staff_counselor (11 roles total)

UPDATE custom_roles
SET 
  permissions = permissions || jsonb_build_object('admission.counselors.lead_mood', true),
  updated_at = NOW()
WHERE 
  jsonb_typeof(permissions) = 'object'
  AND COALESCE((permissions->>'admission.counselors.lead_mood')::boolean, false) = false
  AND (
    SELECT COUNT(*) 
    FROM jsonb_each(permissions) 
    WHERE key LIKE 'admission.counselors.%' AND value::text = 'true'
  ) > 0;

-- Verification: log post-update state for audit trail
DO $$
DECLARE
  granted_count INT;
BEGIN
  SELECT COUNT(*) INTO granted_count
  FROM custom_roles
  WHERE COALESCE((permissions->>'admission.counselors.lead_mood')::boolean, false) = true;
  
  RAISE NOTICE 'lead_mood permission now granted to % role(s)', granted_count;
END $$;
