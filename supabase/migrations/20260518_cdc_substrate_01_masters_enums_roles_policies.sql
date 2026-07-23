-- =====================================================================
-- CDC (Career Development Centre) — Substrate Migration 1 / 3
-- =====================================================================
-- Date: 2026-05-18
-- Source spec: specs/myjkkn-cdc-module-2026-05-18.md
-- Source audit: docs/audits/cdc-module-audit-2026-05-17.html
-- Source signal: Google Chat space AAAA01oZdOo (87 members, 26 months active)
--
-- This file establishes the FOUNDATION layer before any domain tables:
--   1. Enums for protocol state machines (drive_status, willingness_status,
--      placement_status, internship_status, drive_round_type)
--   2. Five CRUDable master tables (drive_types, industry_sectors,
--      offer_types, workshop_types, training_types) — platform-global,
--      extending the existing `internship_site_types`-style pattern.
--   3. Two custom roles (cdc_head, cdc_coordinator) — extending the
--      existing `custom_roles` table per Director's Round 1.1 access-model
--      decision (Central CDC HQ).
--   4. Thirteen platform_policies seed rows for CDC — making every
--      threshold, toggle, deadline, and column-mapping editable via the
--      Director's-view admin UI WITHOUT a deploy (Round 3.5.2/3.5.3).
--
-- Why this lives before the domain tables:
--   - Enums and master tables are referenced by FKs in the domain layer.
--   - platform_policies seeds let the domain layer pull defaults at
--     runtime (e.g. cdc_drives.coordinator_approval_deadline_hours nulls
--     fall back to cdc.coordinator_willingness_approval_deadline_hours).
--   - Custom roles must exist before RLS policies reference them.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS — protocol state machines (per skill rule 15: protocol enums
--    are valid; value lists become master tables instead).
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_drive_status') THEN
    CREATE TYPE public.cdc_drive_status AS ENUM (
      'draft',
      'announced',
      'willingness_open',
      'eligibility_locked',
      'attendance_day',
      'results_announced',
      'closed',
      'cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_willingness_status') THEN
    CREATE TYPE public.cdc_willingness_status AS ENUM (
      'willing',
      'confirmed',
      'withdrawn',
      'no_show'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_placement_status') THEN
    CREATE TYPE public.cdc_placement_status AS ENUM (
      'offered',
      'accepted',
      'declined',
      'rescinded'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_internship_status') THEN
    CREATE TYPE public.cdc_internship_status AS ENUM (
      'pending_start',
      'in_progress',
      'completed',
      'dropped_out',
      'cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_drive_round_type') THEN
    CREATE TYPE public.cdc_drive_round_type AS ENUM (
      'pre_placement_talk',
      'technical',
      'aptitude',
      'group_discussion',
      'hr',
      'final'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_internship_type') THEN
    -- Extends the existing internship_* family per Round 0.1.
    -- The internship_external_sites + internship_assignments tables get
    -- ALTER ADD COLUMN internship_type in M3 of this substrate batch.
    CREATE TYPE public.cdc_internship_type AS ENUM (
      'clinical_posting',
      'teaching_practice',
      'pharmacy_practice',
      'corporate_internship'
    );
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- 2. MASTER TABLES — 5 CRUDable value-list tables per Round 3.5.1
--    Shape mirrors the existing internship_site_types pattern so the
--    super-admin UI generator can reuse its row editor.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cdc_drive_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  -- Skip-state flag: drives of this type bypass the full 7-state machine
  -- (used by walk-in / immersion per Round 3.2).
  skip_states   jsonb DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_drive_types_config_key_unique UNIQUE (config_key)
);

CREATE TABLE IF NOT EXISTS public.cdc_industry_sectors (
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
  CONSTRAINT cdc_industry_sectors_config_key_unique UNIQUE (config_key)
);

CREATE TABLE IF NOT EXISTS public.cdc_offer_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  -- counts_toward_placement: whether this offer-type counts in NAAC/AICTE
  -- placement statistics (e.g. internship_only might be excluded).
  counts_toward_placement boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_offer_types_config_key_unique UNIQUE (config_key)
);

-- Empty for v1; phase-2 school workshop feature will seed.
CREATE TABLE IF NOT EXISTS public.cdc_workshop_types (
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
  CONSTRAINT cdc_workshop_types_config_key_unique UNIQUE (config_key)
);

-- Empty for v1; Unnati/MRB/Springboard seeds land when training programmes ship.
CREATE TABLE IF NOT EXISTS public.cdc_training_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  -- default_total_hours: used as a sensible pre-fill in the training-programme form.
  default_total_hours integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_training_types_config_key_unique UNIQUE (config_key)
);

-- Attach the canonical updated_at trigger to all 5 master tables.
DROP TRIGGER IF EXISTS trg_cdc_drive_types_touch       ON public.cdc_drive_types;
DROP TRIGGER IF EXISTS trg_cdc_industry_sectors_touch  ON public.cdc_industry_sectors;
DROP TRIGGER IF EXISTS trg_cdc_offer_types_touch       ON public.cdc_offer_types;
DROP TRIGGER IF EXISTS trg_cdc_workshop_types_touch    ON public.cdc_workshop_types;
DROP TRIGGER IF EXISTS trg_cdc_training_types_touch    ON public.cdc_training_types;

CREATE TRIGGER trg_cdc_drive_types_touch       BEFORE UPDATE ON public.cdc_drive_types       FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_industry_sectors_touch  BEFORE UPDATE ON public.cdc_industry_sectors  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_offer_types_touch       BEFORE UPDATE ON public.cdc_offer_types       FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_workshop_types_touch    BEFORE UPDATE ON public.cdc_workshop_types    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_training_types_touch    BEFORE UPDATE ON public.cdc_training_types    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();


-- ---------------------------------------------------------------------
-- 3. SEED — populate the three master tables actually used in v1.
--    workshop_types and training_types stay EMPTY (phase-2 ships them).
-- ---------------------------------------------------------------------

INSERT INTO public.cdc_drive_types (config_key, display_name, description, is_system, sort_order, skip_states) VALUES
  ('on_campus',          'On-Campus Drive',         'Standard on-campus recruitment drive — full 7-state lifecycle.',            true, 10, '[]'::jsonb),
  ('off_campus',         'Off-Campus Drive',        'Drive held at recruiter premises or external venue.',                       true, 20, '[]'::jsonb),
  ('walk_in',            'Walk-In Placement',       'Urgent walk-in — bypasses willingness + attendance states (Round 3.2).',   true, 30, '["willingness_open","eligibility_locked","attendance_day"]'::jsonb),
  ('industry_immersion', 'Industry Immersion',      'MathWorks-style observation visits — non-recruiting, awareness only.',     true, 40, '["willingness_open","eligibility_locked","results_announced"]'::jsonb),
  ('virtual',            'Virtual Drive',           'Fully remote drive — same 7-state machine, venue is a meeting URL.',       true, 50, '[]'::jsonb)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.cdc_industry_sectors (config_key, display_name, is_system, sort_order) VALUES
  ('it_services',         'IT Services',             true, 10),
  ('it_product',          'IT Product / SaaS',       true, 20),
  ('manufacturing',       'Manufacturing',           true, 30),
  ('healthcare',          'Healthcare & Hospitals',  true, 40),
  ('fmcg',                'FMCG / Retail',           true, 50),
  ('bfsi',                'BFSI (Banking / NBFC / Insurance)', true, 60),
  ('edtech',              'EdTech',                  true, 70),
  ('consulting',          'Consulting',              true, 80),
  ('government',          'Government / PSU',        true, 90),
  ('textile_apparel',     'Textile & Apparel',       true, 100),  -- e.g. Premier Fine Linens
  ('automotive',          'Automotive',              true, 110),  -- e.g. Sakthi Auto, L.G. Balakrishnan
  ('pharma_chemicals',    'Pharma & Chemicals',      true, 120),
  ('hospitality_tourism', 'Hospitality & Tourism',   true, 130),
  ('other',               'Other',                   true, 999)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.cdc_offer_types (config_key, display_name, description, is_system, sort_order, counts_toward_placement) VALUES
  ('full_time',         'Full-Time Employment',       'Permanent / probation hire on graduation.',                 true, 10, true),
  ('internship',        'Internship Only',            'Paid internship with no offer of conversion.',              true, 20, false),
  ('ppo',               'Pre-Placement Offer (PPO)',  'Offer made during / after internship — converts on grad.',  true, 30, true),
  ('intern_with_offer', 'Internship + Offer Bundle',  'Combined internship+offer (Sakthi Auto pattern).',          true, 40, true)
ON CONFLICT (config_key) DO NOTHING;


-- ---------------------------------------------------------------------
-- 4. CUSTOM ROLES — two CDC-specific roles per Round 1.1.
--    cdc_head: platform-global (institution_scope='all')
--    cdc_coordinator: institution-scoped (institution_scope='own')
-- ---------------------------------------------------------------------

INSERT INTO public.custom_roles (role_key, role_name, description, is_system_role, institution_scope, is_active, module_scopes, permissions) VALUES
  (
    'cdc_head',
    'CDC Head',
    'Central Career Development Centre head. Full CRUD on CDC tables across all institutions; can edit both major and operational CDC platform_policies.',
    true,
    'all',
    true,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    'cdc_coordinator',
    'CDC Coordinator',
    'Per-institution CDC coordinator. Manages drives where own institution is in cdc_drives.institutions[]; can edit operational policies only.',
    true,
    'own',
    true,
    '{}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (role_key) DO NOTHING;


-- ---------------------------------------------------------------------
-- 5. PLATFORM_POLICIES SEED — 13 CDC policy rows.
--    classification: 'major' = Director-only edit; 'operational' = CDC Head + Director.
--    data_type drives the UI editor widget (int / numeric / bool / jsonb).
--    Defaults below match the assumption-thrash decisions; super-admin UI
--    can change values without a deploy.
-- ---------------------------------------------------------------------

-- Note on platform_policies allowed values (verified against live constraints 2026-05-18):
--   scope_type ∈ {global, institution, role, user}   — CDC platform-wide rules use 'global'
--   data_type  ∈ {number, string, boolean, array, object, enum}
--   publication_state ∈ {draft_only, published, draft_pending}
-- ON CONFLICT must target the existing composite unique index uq_platform_policies_key_scope
-- which is on (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')).
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, data_type, description, classification, is_system, is_active, publication_state)
VALUES
  -- ---------- OPERATIONAL (CDC Head + Director editable) ----------
  ('cdc.coordinator_willingness_approval_deadline_hours', 'global', NULL,
   to_jsonb(48), 'number',
   'Hours after a drive announcement before the per-institution coordinator must finalise the willingness list. If they don''t, the system auto-escalates to the CDC Head. Default 48hrs.',
   'operational', true, true, 'published'),

  ('cdc.default_willingness_window_hours', 'global', NULL,
   to_jsonb(168), 'number',
   'Default number of hours between "willingness_open" and "eligibility_locked" states. 168 = 7 days. Per-drive override allowed.',
   'operational', true, true, 'published'),

  ('cdc.default_min_cgpa', 'global', NULL,
   to_jsonb(6.5), 'number',
   'Default minimum CGPA pre-fill when creating a new drive. Coordinators can override per drive.',
   'operational', true, true, 'published'),

  ('cdc.default_max_arrears', 'global', NULL,
   to_jsonb(0), 'number',
   'Default maximum number of academic arrears allowed for drive eligibility. Coordinators can override per drive.',
   'operational', true, true, 'published'),

  ('cdc.default_internship_skip_weekends', 'global', NULL,
   to_jsonb(true), 'boolean',
   'For corporate internships, whether weekends count toward the total internship-duration target by default. Factories / hospitals that work weekends can override per-recruiter.',
   'operational', true, true, 'published'),

  ('cdc.required_attachments_by_state', 'global', NULL,
   '{"announced": ["campus_circular_url"], "results_announced": ["selection_list_url"]}'::jsonb,
   'object',
   'Which attachment fields are mandatory at each drive-state transition. Director can add/remove requirements without a deploy.',
   'operational', true, true, 'published'),

  ('cdc.naac_export_column_mapping', 'global', NULL,
   '{"version": "5.2.1", "columns": ["student_name", "course", "company_name", "package_lpa", "year_of_placement"]}'::jsonb,
   'object',
   'NAAC Criterion 5.2.1 placement export column mapping. Update when NAAC publishes new template — zero deploys.',
   'operational', true, true, 'published'),

  ('cdc.aicte_export_column_mapping', 'global', NULL,
   '{"version": "annual_return_2025_26", "columns": ["student_name", "program", "company_name", "package_inr", "offer_date"]}'::jsonb,
   'object',
   'AICTE Annual Return placement export column mapping. Update when AICTE publishes new template — zero deploys.',
   'operational', true, true, 'published'),

  ('cdc.quarterly_snapshot_enabled', 'global', NULL,
   to_jsonb(true), 'boolean',
   'Whether the quarterly placement-snapshot cron job is active. Disable temporarily during data migration.',
   'operational', true, true, 'published'),

  -- ---------- MAJOR (Director-only edit; affects placement narrative) ----------
  ('cdc.allow_multiple_active_offers', 'global', NULL,
   to_jsonb(true), 'boolean',
   'Whether a learner can hold multiple "offered" placement records simultaneously and choose which to accept. Director-only toggle. When false, first offer auto-closes learner from further drives.',
   'major', true, true, 'published'),

  ('cdc.parent_consent_required_under_age', 'global', NULL,
   to_jsonb(18), 'number',
   'Age threshold below which parent_consent_url is mandatory on internship willingness. Set to 0 to disable; set to 21 for stricter compliance.',
   'major', true, true, 'published'),

  ('cdc.min_attendance_pct_for_internship_certificate', 'global', NULL,
   to_jsonb(75), 'number',
   'Minimum attendance percentage a learner must achieve to receive an internship completion certificate. Affects compliance and accreditation reporting.',
   'major', true, true, 'published'),

  ('cdc.aicte_include_internal_placements', 'global', NULL,
   to_jsonb(false), 'boolean',
   'Whether JKKN-internal placements (e.g. JICATE Solutions) count toward AICTE-reported placement %. NAAC includes them by default; AICTE typically excludes intra-group hires.',
   'major', true, true, 'published')
-- Match the expression-index uq_platform_policies_key_scope by repeating the COALESCE expression.
-- (ON CONSTRAINT doesn't work because uq_platform_policies_key_scope is a unique INDEX, not a CONSTRAINT.)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;


-- ---------------------------------------------------------------------
-- 6. ROLE-CHECK HELPER — single CDC-specific function reused by all
--    CDC tables' RLS policies. Extends the existing is_super_admin()
--    pattern (which reads profiles.is_super_admin).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_cdc_head_or_super()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.is_super_admin()
    OR (SELECT role = 'cdc_head' FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_cdc_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Any CDC role: head or per-institution coordinator. Used by domain tables in M2.
  SELECT COALESCE(
    public.is_super_admin()
    OR (SELECT role IN ('cdc_head','cdc_coordinator') FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;


-- ---------------------------------------------------------------------
-- 7. RLS — master tables: read-open for authenticated users; write
--    restricted to super_admin / cdc_head via the helper above.
-- ---------------------------------------------------------------------

ALTER TABLE public.cdc_drive_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_industry_sectors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_offer_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_workshop_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_training_types    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdc_drive_types_read"       ON public.cdc_drive_types;
DROP POLICY IF EXISTS "cdc_industry_sectors_read"  ON public.cdc_industry_sectors;
DROP POLICY IF EXISTS "cdc_offer_types_read"       ON public.cdc_offer_types;
DROP POLICY IF EXISTS "cdc_workshop_types_read"    ON public.cdc_workshop_types;
DROP POLICY IF EXISTS "cdc_training_types_read"    ON public.cdc_training_types;
DROP POLICY IF EXISTS "cdc_drive_types_write"      ON public.cdc_drive_types;
DROP POLICY IF EXISTS "cdc_industry_sectors_write" ON public.cdc_industry_sectors;
DROP POLICY IF EXISTS "cdc_offer_types_write"      ON public.cdc_offer_types;
DROP POLICY IF EXISTS "cdc_workshop_types_write"   ON public.cdc_workshop_types;
DROP POLICY IF EXISTS "cdc_training_types_write"   ON public.cdc_training_types;

CREATE POLICY "cdc_drive_types_read"       ON public.cdc_drive_types       FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_industry_sectors_read"  ON public.cdc_industry_sectors  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_offer_types_read"       ON public.cdc_offer_types       FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_workshop_types_read"    ON public.cdc_workshop_types    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_training_types_read"    ON public.cdc_training_types    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cdc_drive_types_write"      ON public.cdc_drive_types       FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_industry_sectors_write" ON public.cdc_industry_sectors  FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_offer_types_write"      ON public.cdc_offer_types       FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_workshop_types_write"   ON public.cdc_workshop_types    FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_training_types_write"   ON public.cdc_training_types    FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());


COMMIT;
