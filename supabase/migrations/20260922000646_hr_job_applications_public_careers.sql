-- Public careers API (2026-09-21) — external candidates apply from jkkn.ac.in.
-- Spec: docs/superpowers/specs/2026-09-21-public-careers-api-design.md
--
-- 1) Where an application came from. Default 'internal' back-fills the existing
--    rows (all keyed in through the logged-in /hr/recruitment/submit).
ALTER TABLE public.hr_job_applications
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal'
    CHECK (source IN ('internal', 'external_website')),
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_email_error text;

-- 2) One website application per (job, email). PARTIAL: prod already holds an
--    internal duplicate (job 91f6a2b9…, same email twice) and HR must stay able
--    to re-key internally. The route pre-checks across ALL sources; this index
--    only closes the concurrent-submit race between website rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_job_applications_external_job_email
  ON public.hr_job_applications (job_id, lower(email))
  WHERE source = 'external_website';

-- 3) Who is told about a new website application. Recipients must be a SUBSET of
--    the users who can read the row (hr_job_applications SELECT policy:
--    hr.recruitment.view AND role_has_institution_access). We narrow to
--    hr.recruitment.EDIT — the people who actually screen (1-2 per college) —
--    and exclude super admins (they would get every college's applicants).
--    Role membership from user_roles AND the legacy profiles.role path, exactly
--    as user_has_permission(uuid,text) resolves it.
--    Institution access mirrors role_has_institution_access(): home institution,
--    CAS sibling (non-blank counselling_code), active user_institution_access.
--    Empty set (e.g. Main Office has no scoped screener) → fall back to holders
--    whose role has institution_scope = 'all'.
CREATE OR REPLACE FUNCTION public.hr_recruitment_application_recipient_ids(p_institution_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH editor_roles AS (
    SELECT p.id AS user_id, p.institution_id, cr.institution_scope
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE (cr.permissions->>'hr.recruitment.edit')::boolean = true
    UNION
    SELECT p.id, p.institution_id, cr.institution_scope
    FROM profiles p
    JOIN custom_roles cr ON cr.role_key = p.role
    WHERE (cr.permissions->>'hr.recruitment.edit')::boolean = true
  ),
  eligible AS (
    SELECT e.*
    FROM editor_roles e
    JOIN profiles p ON p.id = e.user_id
    WHERE p.is_active = true
      AND COALESCE(p.is_login_disabled, false) = false
      AND COALESCE(p.is_super_admin, false) = false
      AND COALESCE(p.role, '') <> 'super_admin'
  ),
  scoped AS (
    SELECT DISTINCT e.user_id
    FROM eligible e
    WHERE COALESCE(e.institution_scope, '') <> 'all'
      AND (
        e.institution_id = p_institution_id
        OR EXISTS (
          SELECT 1 FROM institutions i_self
          JOIN institutions i_sib ON i_sib.counselling_code = i_self.counselling_code
          WHERE i_self.id = e.institution_id
            AND i_sib.id = p_institution_id
            AND i_self.counselling_code IS NOT NULL
            AND btrim(i_self.counselling_code) <> ''
        )
        OR EXISTS (
          SELECT 1 FROM user_institution_access uia
          WHERE uia.user_id = e.user_id
            AND uia.institution_id = p_institution_id
            AND uia.is_active = true
        )
      )
  )
  SELECT s.user_id FROM scoped s
  UNION ALL
  SELECT DISTINCT e.user_id FROM eligible e
  WHERE e.institution_scope = 'all'
    AND NOT EXISTS (SELECT 1 FROM scoped);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_recruitment_application_recipient_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_recruitment_application_recipient_ids(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_recruitment_application_recipient_ids(uuid) IS
  'Screeners (hr.recruitment.edit) with access to the institution; falls back to all-scope editors. Subset of the hr_job_applications SELECT set. Public careers API notifications only.';
