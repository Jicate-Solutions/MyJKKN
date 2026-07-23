-- 2026-07-01 — CDC Employer Requirement Intake (substrate).
--
-- Problem: when a company approaches JKKN with a job vacancy + skills
-- requirement (e.g. an emailed .docx with several roles), the CDC module had
-- nowhere structured to hold it. Coordinators had to flatten it into fresher
-- campus drives (wrong shape) or free-text bulletin posts (skills lost).
--
-- This adds an intake that sits ON TOP of the existing recruiter + bulletin +
-- drive machinery:
--   cdc_employer_requirements       — one company submission (header + contacts)
--   cdc_employer_requirement_roles  — N roles per submission, each with skills[]
-- A role can later be PUBLISHED to the Bulletin (cdc_external_opportunities) or
-- CONVERTED to a formal Drive (cdc_drives). A skills-match RPC ranks learners by
-- overlap of a role's skills against their self-attributed IDP skills.
--
-- Two entry paths (Director decision 2026-07-01):
--   * public self-submit portal  → status='pending_review' (moderation gate)
--   * CDC staff direct entry      → staff-trusted
-- The PUBLIC path writes via a server-side service-role API route, so these
-- tables carry NO anon grants (RLS stays CDC-staff-only).
--
-- RLS uses is_cdc_staff() (multi-role aware — recognises cdc_head /
-- cdc_coordinator via user_roles, not just legacy profiles.role) so multi-role
-- coordinators are not locked out. Writes are additionally institution-scoped.

-- ===========================================================================
-- 1. Header table — one row per company submission
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.cdc_employer_requirements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id           uuid REFERENCES public.cdc_recruiters(id) ON DELETE SET NULL,
  company_name           text NOT NULL,
  company_website        text,
  industry_sector_id     uuid REFERENCES public.cdc_industry_sectors(id) ON DELETE SET NULL,
  hq_city                text,
  hq_state               text,
  primary_contact_name   text,
  primary_contact_email  text,
  primary_contact_phone  text,
  secondary_contact_name text,           -- the sample doc carried two contacts
  secondary_contact_phone text,
  source                 text NOT NULL DEFAULT 'cdc_staff'
                           CHECK (source IN ('public_portal','cdc_staff','email','walk_in')),
  source_document_url    text,           -- optional upload of the original .docx/email
  institution_id         uuid REFERENCES public.institutions(id) ON DELETE SET NULL,  -- NULL = org-wide
  status                 text NOT NULL DEFAULT 'pending_review'
                           CHECK (status IN ('pending_review','approved','published','rejected','closed')),
  review_notes           text,
  reviewed_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cdc_emp_req_status      ON public.cdc_employer_requirements (status);
CREATE INDEX IF NOT EXISTS idx_cdc_emp_req_recruiter   ON public.cdc_employer_requirements (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_cdc_emp_req_institution ON public.cdc_employer_requirements (institution_id);
CREATE INDEX IF NOT EXISTS idx_cdc_emp_req_created     ON public.cdc_employer_requirements (created_at DESC);

-- ===========================================================================
-- 2. Roles table — N roles per submission, each carrying structured skills
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.cdc_employer_requirement_roles (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id            uuid NOT NULL REFERENCES public.cdc_employer_requirements(id) ON DELETE CASCADE,
  role_title                text NOT NULL,
  description               text,
  skills                    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of strings
  experience_level          text DEFAULT 'any'
                              CHECK (experience_level IN ('fresher','experienced','any')),
  experience_min_years      integer CHECK (experience_min_years IS NULL OR experience_min_years >= 0),
  education_text            text,
  package_lpa               numeric,
  benefits                  text,
  work_mode                 text CHECK (work_mode IS NULL OR work_mode IN ('in_person','remote','hybrid')),
  location                  text,
  openings_count            integer NOT NULL DEFAULT 1 CHECK (openings_count > 0),
  status                    text NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','published_bulletin','converted_drive','closed')),
  published_opportunity_id  uuid REFERENCES public.cdc_external_opportunities(id) ON DELETE SET NULL,
  drive_id                  uuid REFERENCES public.cdc_drives(id) ON DELETE SET NULL,
  display_order             integer NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- Skills must be a JSON array (guards against object/scalar being stored).
  CONSTRAINT cdc_emp_req_roles_skills_is_array CHECK (jsonb_typeof(skills) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_cdc_emp_req_roles_req    ON public.cdc_employer_requirement_roles (requirement_id);
CREATE INDEX IF NOT EXISTS idx_cdc_emp_req_roles_status ON public.cdc_employer_requirement_roles (status);
CREATE INDEX IF NOT EXISTS idx_cdc_emp_req_roles_skills ON public.cdc_employer_requirement_roles USING gin (skills);

-- updated_at touch triggers (house convention: public._touch_updated_at())
DROP TRIGGER IF EXISTS trg_cdc_emp_req_touch ON public.cdc_employer_requirements;
CREATE TRIGGER trg_cdc_emp_req_touch
  BEFORE UPDATE ON public.cdc_employer_requirements
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_cdc_emp_req_roles_touch ON public.cdc_employer_requirement_roles;
CREATE TRIGGER trg_cdc_emp_req_roles_touch
  BEFORE UPDATE ON public.cdc_employer_requirement_roles
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ===========================================================================
-- 3. Institution-scope helper for the roles table.
--    Roles have no institution_id of their own; their owning college is the
--    parent requirement's. SECURITY DEFINER so the lookup bypasses the parent's
--    RLS (otherwise a scoped subquery would return NULL and mis-scope). NULL
--    parent institution = org-wide (role_has_institution_access(NULL) is TRUE).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_cdc_emp_req_institution(p_requirement_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institution_id FROM public.cdc_employer_requirements WHERE id = p_requirement_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cdc_emp_req_institution(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_emp_req_institution(uuid) TO authenticated;

-- ===========================================================================
-- 4. RLS — CDC staff only (multi-role aware via is_cdc_staff()). No anon grants;
--    the public submit path writes through a service-role API route.
-- ===========================================================================
ALTER TABLE public.cdc_employer_requirements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_employer_requirement_roles ENABLE ROW LEVEL SECURITY;

-- Requirements: read = any CDC staff (org-level inbound queue, cross-college view
-- like mentor pairings). Write/moderate = CDC staff + institution scope.
DROP POLICY IF EXISTS "cdc_emp_req_select" ON public.cdc_employer_requirements;
CREATE POLICY "cdc_emp_req_select" ON public.cdc_employer_requirements
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR is_cdc_staff()
  );

DROP POLICY IF EXISTS "cdc_emp_req_write" ON public.cdc_employer_requirements;
CREATE POLICY "cdc_emp_req_write" ON public.cdc_employer_requirements
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (is_cdc_staff() AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (is_cdc_staff() AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  );

-- Roles: read = any CDC staff. Write = CDC staff scoped by the PARENT's institution.
DROP POLICY IF EXISTS "cdc_emp_req_roles_select" ON public.cdc_employer_requirement_roles;
CREATE POLICY "cdc_emp_req_roles_select" ON public.cdc_employer_requirement_roles
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR is_cdc_staff()
  );

DROP POLICY IF EXISTS "cdc_emp_req_roles_write" ON public.cdc_employer_requirement_roles;
CREATE POLICY "cdc_emp_req_roles_write" ON public.cdc_employer_requirement_roles
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (is_cdc_staff() AND role_has_institution_access(fn_cdc_emp_req_institution(requirement_id)))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (is_cdc_staff() AND role_has_institution_access(fn_cdc_emp_req_institution(requirement_id)))
  );

-- ===========================================================================
-- 5. Skills-match RPC — rank learners by overlap of a role's skills against
--    their self-attributed IDP skills (cdc_idp_responses.skills_self_attribution).
--    SECURITY DEFINER (CDC staff hold cdc.* but not learners.*/idp reads); guarded
--    to CDC staff and scoped to institutions the CALLER can access. Returns empty
--    while no learner has IDP skills yet (currently 0) — no fabricated matches.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_cdc_match_learners_for_role(
  p_role_id uuid,
  p_limit   integer DEFAULT 25
)
RETURNS TABLE (
  learner_id       uuid,
  learner_name     text,
  register_number  text,
  institution_id   uuid,
  institution_name text,
  matched_skills   text[],
  match_count      integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_skills text[];
BEGIN
  -- Gate: CDC staff only (super_admin/admin included in is_cdc_staff()).
  IF NOT is_cdc_staff() THEN
    RETURN;
  END IF;

  -- Role's required skills, lower-cased + trimmed, de-duped.
  SELECT ARRAY(
    SELECT DISTINCT lower(btrim(s))
    FROM public.cdc_employer_requirement_roles r,
         jsonb_array_elements_text(r.skills) AS s
    WHERE r.id = p_role_id AND btrim(s) <> ''
  ) INTO v_role_skills;

  IF v_role_skills IS NULL OR array_length(v_role_skills, 1) IS NULL THEN
    RETURN;  -- role has no skills listed → nothing to match
  END IF;

  RETURN QUERY
  WITH learner_skills AS (
    SELECT
      lp.id                 AS learner_id,
      lp.institution_id     AS institution_id,
      ARRAY(
        SELECT DISTINCT lower(btrim(ls))
        FROM jsonb_array_elements_text(idp.skills_self_attribution) AS ls
        WHERE btrim(ls) <> ''
      )                     AS skills
    FROM public.cdc_idp_responses idp
    JOIN public.learners_profiles lp ON lp.id = idp.learner_id
    WHERE jsonb_typeof(idp.skills_self_attribution) = 'array'
      AND jsonb_array_length(idp.skills_self_attribution) > 0
      -- scope to institutions the CALLING user can access (evaluated vs auth.uid())
      AND role_has_institution_access(lp.institution_id)
  ),
  scored AS (
    SELECT
      lsk.learner_id,
      lsk.institution_id,
      ARRAY(SELECT unnest(lsk.skills) INTERSECT SELECT unnest(v_role_skills)) AS matched,
      lp.first_name, lp.last_name, lp.register_number
    FROM learner_skills lsk
    JOIN public.learners_profiles lp ON lp.id = lsk.learner_id
  )
  SELECT
    s.learner_id,
    btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,''))::text AS learner_name,
    s.register_number::text,
    s.institution_id,
    i.name::text AS institution_name,   -- institutions.name is varchar(255); cast to declared text
    s.matched AS matched_skills,
    coalesce(array_length(s.matched, 1), 0) AS match_count
  FROM scored s
  LEFT JOIN public.institutions i ON i.id = s.institution_id
  WHERE array_length(s.matched, 1) > 0
  ORDER BY coalesce(array_length(s.matched, 1), 0) DESC, learner_name ASC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cdc_match_learners_for_role(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_match_learners_for_role(uuid, integer) TO authenticated;
