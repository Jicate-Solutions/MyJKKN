-- ============================================================================
-- Schools Network — program_partner_schools (per-school participation + status)
-- File:  20260706193000_program_partner_schools.sql
-- Date:  2026-07-06
--
-- WHY:
--   Program partners (HP CSR ALFA, Yi Thalir, …) run a project across many
--   schools. Until now a school could be OWNED under a partner
--   (school_jkkn_owners.program_partner_id) but there was no structured,
--   updatable record of WHERE each school is in that project — the status
--   lived only in an external spreadsheet as free-text notes.
--
--   This table gives each (partner, school) a typed membership row with two
--   status dropdowns the field team maintains going forward, plus the concrete
--   deliverable facts (website domain, branding, Nan-Mudhalvan flag). It also
--   backs the partner-detail "Member Schools" list.
--
-- WHAT:
--   - 2 enums: sn_ai_session_status, sn_website_status
--   - table public.program_partner_schools  (UNIQUE per partner+school)
--   - RLS mirroring the sibling school_* tables (super/admin OR
--     schools_network.schools.{view,edit} AND owns-school-or-leads-partner)
--   - REVOKE anon + GRANT authenticated + updated_at bump trigger
--
--   Additive + idempotent. No data changes here (data loaded separately).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums (CREATE TYPE has no IF NOT EXISTS — guard with DO blocks)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sn_ai_session_status') THEN
    CREATE TYPE public.sn_ai_session_status AS ENUM
      ('not_started', 'interested', 'scheduled', 'conducted', 'declined');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sn_website_status') THEN
    CREATE TYPE public.sn_website_status AS ENUM
      ('not_started', 'in_progress', 'live');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_partner_schools (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_partner_id UUID NOT NULL REFERENCES public.program_partners(id) ON DELETE CASCADE,
  school_id          UUID NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  ai_session_status  public.sn_ai_session_status NOT NULL DEFAULT 'not_started',
  website_status     public.sn_website_status    NOT NULL DEFAULT 'not_started',
  domain_url         TEXT,
  branding_done      BOOLEAN NOT NULL DEFAULT FALSE,
  nan_mudhalvan      BOOLEAN NOT NULL DEFAULT FALSE,
  metadata           JSONB   NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_partner_id, school_id)
);
CREATE INDEX IF NOT EXISTS program_partner_schools_partner_idx
  ON public.program_partner_schools (program_partner_id);
CREATE INDEX IF NOT EXISTS program_partner_schools_school_idx
  ON public.program_partner_schools (school_id);

ALTER TABLE public.program_partner_schools ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. RLS — identical shape to school_contributions (ownership / partner-lead
--    scoped; super/admin bypass). Read = schools.view, write = schools.edit.
-- ----------------------------------------------------------------------------
-- SELECT is ORG-WIDE (like the worklist / scoreboard / feeder panel — Director
-- ruling for schools-network outreach views): any schools.view holder sees the
-- full member-school list. No PII (school name + project status only). Writes
-- below stay owner / partner-lead / admin scoped.
DROP POLICY IF EXISTS program_partner_schools_select ON public.program_partner_schools;
CREATE POLICY program_partner_schools_select ON public.program_partner_schools
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.schools.view')
  );

DROP POLICY IF EXISTS program_partner_schools_insert ON public.program_partner_schools;
CREATE POLICY program_partner_schools_insert ON public.program_partner_schools
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );

DROP POLICY IF EXISTS program_partner_schools_update ON public.program_partner_schools;
CREATE POLICY program_partner_schools_update ON public.program_partner_schools
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );

DROP POLICY IF EXISTS program_partner_schools_delete ON public.program_partner_schools;
CREATE POLICY program_partner_schools_delete ON public.program_partner_schools
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );

-- ----------------------------------------------------------------------------
-- 4. Grants — anon locked out, authenticated goes through RLS
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.program_partner_schools FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_partner_schools TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. updated_at bump trigger (canonical repo function)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.program_partner_schools;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.program_partner_schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
