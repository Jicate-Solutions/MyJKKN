-- =====================================================================
-- Course Events — role grants, participant role, external-profile flag
-- =====================================================================
-- Declaring a key in lib/constants/permissions.ts grants nothing. A key
-- only exists for a role once it is in that role's custom_roles.permissions
-- JSONB. Without this migration every /courses page renders empty.
-- =====================================================================

-- 1. Hard discriminator for an external participant --------------------
-- NOT inferred from institution_id IS NULL. This codebase has a
-- documented antipattern where a missing institution is coerced into a
-- real-looking parameter, and several places branch on institution scope
-- to decide visibility. A profile that can log in and has no institution
-- is a shape this app has never had; it gets an explicit flag.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_external_participant boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_external_participant
  ON public.profiles (is_external_participant)
  WHERE is_external_participant;

COMMENT ON COLUMN public.profiles.is_external_participant IS
  'TRUE for a person provisioned solely to take a paid course. They have institution_id NULL, hold only courses.participant.self, and are confined to the /my-courses portal.';

-- 2. Administration keys onto existing roles ---------------------------
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'courses.view',                 true,
         'courses.create',               true,
         'courses.edit',                 true,
         'courses.packages.manage',      true,
         'courses.forms.manage',         true,
         'courses.sessions.manage',      true,
         'courses.applications.view',    true,
         'courses.applications.decide',  true,
         'courses.enrollments.manage',   true,
         'courses.billing.view',         true,
         'courses.billing.manage',       true,
         'courses.attendance.mark',      true,
         'courses.certificates.issue',   true,
         -- Approval issues a permanent JKKN ID, so the deciding role
         -- needs the issuer's own gate too. Granted here rather than by
         -- widening fn_issue_jkkn_id, which stays admin-gated.
         'users.jkkn_id.issue',          true
       ),
       updated_at = now()
 WHERE role_key = ANY (ARRAY['administrator','coo']);

-- courses.delete is deliberately NOT bundled above. It cascades packages,
-- sessions, forms, applications and enrollments; grant it from Role
-- Management deliberately, per role. Super admins pass via
-- user_has_permission()'s own bypass.

-- 3. The Course Participant role ---------------------------------------
-- Exactly ONE key. This role is assigned to every externally provisioned
-- participant, so anything added here is granted to every outside person
-- holding a login.
INSERT INTO public.custom_roles
  (role_key, role_name, description, is_system_role, is_active,
   institution_scope, permissions, module_scopes)
-- institution_scope='own' (not 'none' — the CHECK constraint on
-- custom_roles only admits 'all'/'own'). Verified inert here:
-- role_has_institution_access() special-cases only institution_scope='all';
-- every other branch falls through to institution_id equality, the CAS
-- sibling check, or user_institution_access, all of which fail for an
-- external participant with institution_id NULL. 'own' confines exactly
-- as 'none' was intended to.
VALUES
  ('course_participant',
   'Course Participant',
   'A person enrolled on a paid course. Sees only their own enrollment, bills and receipts, and is confined to the /my-courses portal. Assigned automatically at application approval.',
   true, true, 'own',
   jsonb_build_object('courses.participant.self', true),
   '{}'::jsonb)
ON CONFLICT (role_key) DO UPDATE
   SET permissions = jsonb_build_object('courses.participant.self', true),
       institution_scope = 'own',
       is_active   = true,
       updated_at  = now();
