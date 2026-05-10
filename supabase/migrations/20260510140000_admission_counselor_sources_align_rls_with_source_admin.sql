-- ============================================================================
-- Align admission_counselor_sources RLS with the page-level authority that
-- already manages sources. The previous policies (from 20260427) gated
-- read/write on `admission.counselors.team.{view,manage}` — perms scoped per
-- spec to Principal/HOD only. The Assign-Counselor button on
-- /admission/settings/sources/[id] is gated on the UI side by
-- `admission.settings.sources.manage`, which the admission-office role holds.
--
-- The mismatch caused 42501 "new row violates row-level security policy" on
-- bulk-attach for admission-office users. This migration broadens the
-- policies to ALSO accept the source-management permission pair, matching
-- the UI's authority surface exactly.
--
-- Institution scoping is preserved on SELECT via the existing
-- role_has_institution_access(c.institution_id) join through
-- admission_counselors.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "counselor_sources_select" ON admission_counselor_sources;
CREATE POLICY "counselor_sources_select" ON admission_counselor_sources
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    (
      user_has_permission('admission.counselors.team.view')
      OR user_has_permission('admission.settings.sources.view')
    )
    AND EXISTS (
      SELECT 1 FROM admission_counselors c
      WHERE c.id = admission_counselor_sources.counselor_id
        AND role_has_institution_access(c.institution_id)
    )
  )
);

DROP POLICY IF EXISTS "counselor_sources_modify" ON admission_counselor_sources;
CREATE POLICY "counselor_sources_modify" ON admission_counselor_sources
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.manage')
  OR user_has_permission('admission.settings.sources.manage')
);

COMMENT ON POLICY "counselor_sources_select" ON admission_counselor_sources IS
  'Read access for super_admin, admin, or anyone holding either admission.counselors.team.view OR admission.settings.sources.view AND having institution access via the parent counselor. Source-mgmt branch added 2026-05-10 to fix admission-office users getting blank counselor lists on /admission/settings/sources/[id].';

COMMENT ON POLICY "counselor_sources_modify" ON admission_counselor_sources IS
  'Write access for super_admin, admin, or anyone holding admission.counselors.team.manage OR admission.settings.sources.manage. Source-mgmt branch added 2026-05-10 to fix 42501 on bulk-attach from the source-detail page.';

COMMIT;
