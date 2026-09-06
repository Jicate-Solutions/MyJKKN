-- Campus Walk — who is permitted to file an observation.
--
-- D2 locked "Director only for v1". That was implemented as a hardcoded email
-- compared in five separate places, which had three costs worth naming:
--   1. No seeded test.* account could ever reach the capture screen or the
--      approval queue, so the happy path was untestable by the standard
--      harness by construction.
--   2. Delegating capture while the Director travels was a code change.
--   3. If his address ever changed the feature broke and needed a developer.
--
-- Director ruling (2026-08-21): same behaviour — exactly one permitted person
-- — but expressed as configuration an admin can change, not a release.
--
-- This seeds that configuration on the existing platform_policies substrate
-- (20260429000002) rather than introducing a parallel mechanism. Reads go
-- through fn_get_policy, exactly as lib/policies/get-policy.ts already does.
--
-- SAFETY: lib/campus-walk/reporters.ts falls back to the hardcoded Director
-- address whenever this row is absent, unreadable or empty. The gate therefore
-- fails CLOSED, never open. That matters more than it looks: project_* RLS is
-- `auth.uid() IS NOT NULL` for read AND write, so a gate that failed open would
-- let any authenticated account file tickets and approve its own closures.
--
-- Idempotent: safe to re-run, and re-running will NOT clobber an admin's edit.

INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  is_system
) VALUES (
  'campus_walk.reporters.allowed_emails',
  'global',
  NULL,
  '["director@jkkn.ac.in"]'::jsonb,
  'Email addresses permitted to file Campus Walk observations and decide approvals (D2). Editable by an admin without a deploy. If this row is removed or emptied the code falls back to the Director only — it never opens up.',
  'array',
  false
)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;
