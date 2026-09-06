-- =====================================================================
-- CDC Config Masters — 4 new CRUDable value-list tables
-- =====================================================================
-- Date: 2026-06-21
-- Bugs: BUG-004059, BUG-004094, BUG-004039, BUG-004060
--
-- Adds four config-master tables to the CDC module, extending the
-- existing generic master-data system established in
-- 20260518_cdc_substrate_01_masters_enums_roles_policies.sql
-- (cdc_drive_types / cdc_offer_types / cdc_workshop_types / …).
--
-- Each table follows the EXACT shape of cdc_offer_types:
--   - same columns (id, config_key, display_name, description,
--     is_system, is_active, sort_order, created_at/updated_at,
--     created_by/updated_by, UNIQUE(config_key))
--   - same _touch_updated_at trigger
--   - same RLS: authenticated read (auth.uid() IS NOT NULL),
--     write restricted to public.is_cdc_head_or_super()
--   - same idempotent seed pattern (ON CONFLICT (config_key) DO NOTHING)
--
-- The four tables:
--   cdc_mentor_categories       — kinds of industry/guest mentor
--   cdc_mentorship_categories   — domains a mentorship engagement covers
--   cdc_internship_types        — config-row mirror of the cdc_internship_type
--                                  ENUM; config_keys MUST match the enum values
--                                  exactly (the 0101Z FK migration joins on them)
--   cdc_expertise_areas         — starter expertise tags the CDC head curates
--
-- These power the generic /api/admin/cdc/masters/[table] CRUD route and
-- the MasterTablePage admin UI once registered (admin pages + form
-- wiring land in Phase 2).
--
-- This migration is idempotent (CREATE TABLE IF NOT EXISTS,
-- INSERT … ON CONFLICT DO NOTHING) and is NOT applied to prod here.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TABLES — 4 CRUDable masters, shape mirrors cdc_offer_types.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cdc_mentor_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_mentor_categories_config_key_unique UNIQUE (config_key)
);

CREATE TABLE IF NOT EXISTS public.cdc_mentorship_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_mentorship_categories_config_key_unique UNIQUE (config_key)
);

-- config_key values MUST match the public.cdc_internship_type enum labels
-- exactly — the 0101Z FK migration backfills internship_assignments by
-- joining a.internship_type::text = t.config_key.
CREATE TABLE IF NOT EXISTS public.cdc_internship_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_internship_types_config_key_unique UNIQUE (config_key)
);

CREATE TABLE IF NOT EXISTS public.cdc_expertise_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_expertise_areas_config_key_unique UNIQUE (config_key)
);

-- ---------------------------------------------------------------------
-- 2. TRIGGERS — canonical updated_at touch on each table.
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_cdc_mentor_categories_touch      ON public.cdc_mentor_categories;
DROP TRIGGER IF EXISTS trg_cdc_mentorship_categories_touch  ON public.cdc_mentorship_categories;
DROP TRIGGER IF EXISTS trg_cdc_internship_types_touch       ON public.cdc_internship_types;
DROP TRIGGER IF EXISTS trg_cdc_expertise_areas_touch        ON public.cdc_expertise_areas;

CREATE TRIGGER trg_cdc_mentor_categories_touch      BEFORE UPDATE ON public.cdc_mentor_categories      FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_mentorship_categories_touch  BEFORE UPDATE ON public.cdc_mentorship_categories  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_internship_types_touch       BEFORE UPDATE ON public.cdc_internship_types       FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_expertise_areas_touch        BEFORE UPDATE ON public.cdc_expertise_areas        FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. SEED — idempotent. config_keys are stable; display_names editable.
-- ---------------------------------------------------------------------

INSERT INTO public.cdc_mentor_categories (config_key, display_name, is_system, sort_order) VALUES
  ('guest_lecturer',  'Guest Lecturer',  true, 10),
  ('project_mentor',  'Project Mentor',  true, 20),
  ('placement_mentor','Placement Mentor',true, 30),
  ('advisory_board',  'Advisory Board',  true, 40)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.cdc_mentorship_categories (config_key, display_name, is_system, sort_order) VALUES
  ('academic',        'Academic',        true, 10),
  ('career',          'Career',          true, 20),
  ('technical',       'Technical',       true, 30),
  ('entrepreneurship','Entrepreneurship',true, 40)
ON CONFLICT (config_key) DO NOTHING;

-- config_keys match public.cdc_internship_type enum labels exactly.
INSERT INTO public.cdc_internship_types (config_key, display_name, is_system, sort_order) VALUES
  ('clinical_posting',     'Clinical Posting',     true, 10),
  ('teaching_practice',    'Teaching Practice',    true, 20),
  ('pharmacy_practice',    'Pharmacy Practice',    true, 30),
  ('corporate_internship', 'Corporate Internship', true, 40)
ON CONFLICT (config_key) DO NOTHING;

-- Starter set the CDC head will curate/extend via the admin UI.
INSERT INTO public.cdc_expertise_areas (config_key, display_name, is_system, sort_order) VALUES
  ('ai_ml',             'AI/ML',                    true, 10),
  ('cloud',             'Cloud',                    true, 20),
  ('cybersecurity',     'Cybersecurity',            true, 30),
  ('data_science',      'Data Science',             true, 40),
  ('web_development',   'Web Development',          true, 50),
  ('embedded_systems',  'Embedded Systems',         true, 60),
  ('finance',           'Finance',                  true, 70),
  ('marketing',         'Marketing',                true, 80),
  ('mechanical',        'Mechanical Engineering',   true, 90),
  ('electrical',        'Electrical & Electronics', true, 100)
ON CONFLICT (config_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. RLS — authenticated read, write restricted to CDC Head / super-admin.
--    Mirrors the cdc_offer_types policy pattern exactly. The
--    `auth.uid() IS NOT NULL` read predicate inherently excludes anon
--    (anon sessions have no auth.uid()), matching the existing masters.
-- ---------------------------------------------------------------------

ALTER TABLE public.cdc_mentor_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_mentorship_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_internship_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_expertise_areas        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdc_mentor_categories_read"      ON public.cdc_mentor_categories;
DROP POLICY IF EXISTS "cdc_mentorship_categories_read"  ON public.cdc_mentorship_categories;
DROP POLICY IF EXISTS "cdc_internship_types_read"       ON public.cdc_internship_types;
DROP POLICY IF EXISTS "cdc_expertise_areas_read"        ON public.cdc_expertise_areas;
DROP POLICY IF EXISTS "cdc_mentor_categories_write"     ON public.cdc_mentor_categories;
DROP POLICY IF EXISTS "cdc_mentorship_categories_write" ON public.cdc_mentorship_categories;
DROP POLICY IF EXISTS "cdc_internship_types_write"      ON public.cdc_internship_types;
DROP POLICY IF EXISTS "cdc_expertise_areas_write"       ON public.cdc_expertise_areas;

CREATE POLICY "cdc_mentor_categories_read"      ON public.cdc_mentor_categories      FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_mentorship_categories_read"  ON public.cdc_mentorship_categories  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_internship_types_read"       ON public.cdc_internship_types       FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_expertise_areas_read"        ON public.cdc_expertise_areas        FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cdc_mentor_categories_write"     ON public.cdc_mentor_categories      FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_mentorship_categories_write" ON public.cdc_mentorship_categories  FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_internship_types_write"      ON public.cdc_internship_types       FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_expertise_areas_write"       ON public.cdc_expertise_areas        FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());

COMMIT;
