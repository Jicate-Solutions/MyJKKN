-- supabase/migrations/20260808210200_iqac_cac_metric_map_config.sql
-- ===========================================================================
-- IQAC — the 48 -> 107 mapping register, as configuration.
--
-- NOT APPLIED TO ANY DATABASE. Applying a migration is Director-gated in this
-- repository. This file is the reviewed proposal; /accreditation/iqac reads the
-- table when it exists and states plainly that the register is not provisioned
-- when it does not.
--
-- WHY A TABLE AND NOT A TYPESCRIPT CONSTANT
-- ---------------------------------------------------------------------------
-- docs/architecture/config-table-pattern.md, locked 2026-04-29: "Every
-- threshold, MAPPING, flag, schedule, or routing rule that a super-admin might
-- tweak - even once - gets a database row, a function that reads it at runtime,
-- and a super-admin UI to edit it." Mappings are named in that rule's own DOES
-- list. Which of the 107 master framework metrics a given CAC dimension
-- summarises is a judgement the IQAC makes and revises; it is not algorithm.
--
-- WHY IT SHIPS EMPTY
-- ---------------------------------------------------------------------------
-- Deliberately no seed rows. No verified correspondence between the CEO's 48 CAC
-- dimensions and these 107 rubric metrics exists today - establishing one is the
-- IQAC's work, not a developer's. Seeding a plausible guess would close an open
-- question by pretending it was answered, and every downstream reader would
-- inherit the guess as fact. An empty register renders as "not examined yet",
-- which is true and which invites the work.
--
-- WRITES NO LEARNER DATA. Creates one table, one audit table, one trigger
-- function and its trigger. Touches no existing object.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- The register.
--
-- One row per claimed correspondence. `config_key` is the CAC dimension slug -
-- CacMetric.id in app/(routes)/accreditation/cac/_lib/cac-metric-catalog.ts
-- (for example 'attendance', 'pass-percentage'). A dimension summarising two
-- framework metrics gets two rows.
--
-- No foreign key to sh_accreditation_metrics: the target is the PAIR
-- (metric_type, metric_code), and that pair carries no unique constraint on
-- that table today. Adding one is a change to the framework table itself and
-- belongs in its own reviewed migration, not smuggled in beneath this feature.
-- Validation therefore lives in the service layer, and the page shows a mapping
-- that points at nothing as unmapped rather than inventing a target.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iqac_cac_metric_map (
  -- Shared config mixin, verbatim from config-table-pattern.md
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES public.profiles(id),
  change_reason TEXT,

  -- Typed columns for this register
  body_code    TEXT,
  metric_code  TEXT,
  relationship TEXT NOT NULL DEFAULT 'contributes-to',

  -- Half a mapping is not a mapping. Either both target columns are set (a
  -- correspondence) or neither is (a recorded finding that the dimension has no
  -- counterpart in the 107). A row naming a body with no metric would render as
  -- mapped while pointing nowhere.
  CONSTRAINT iqac_cac_metric_map_target_complete
    CHECK ((body_code IS NULL) = (metric_code IS NULL)),

  CONSTRAINT iqac_cac_metric_map_relationship_valid
    CHECK (relationship IN ('same-measure', 'contributes-to', 'evidence-for')),

  CONSTRAINT iqac_cac_metric_map_body_valid
    CHECK (
      body_code IS NULL
      OR body_code IN ('NAAC','NIRF','NBA','QS','DCI','PCI','INC','NCTE','AICTE','UGC')
    )
);

COMMENT ON TABLE public.iqac_cac_metric_map IS
  'IQAC: which master framework metric (sh_accreditation_metrics) each CAC dimension summarises. Config row per the config-table pattern; read by /accreditation/iqac. Ships empty on purpose - no correspondence has been established yet and a guess would be worse than a blank.';

COMMENT ON COLUMN public.iqac_cac_metric_map.config_key IS
  'CAC dimension slug - CacMetric.id from cac/_lib/cac-metric-catalog.ts.';

COMMENT ON COLUMN public.iqac_cac_metric_map.body_code IS
  'Awarding body of the target metric. Matches sh_accreditation_metrics.metric_type - that column holds the body; there is no accreditation_body column. NULL together with metric_code means reviewed and found to have no counterpart.';

-- One active claim per (dimension, target). Superseded claims stay as history
-- with is_active = false rather than being deleted.
CREATE UNIQUE INDEX IF NOT EXISTS iqac_cac_metric_map_active_unique
  ON public.iqac_cac_metric_map (config_key, body_code, metric_code)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS iqac_cac_metric_map_config_key_idx
  ON public.iqac_cac_metric_map (config_key)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Grants.
--
-- ORDER IS LOAD-BEARING. Supabase runs
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
--     TO anon, authenticated, service_role
-- so this table is born with anon=arwdDxt AND authenticated=arwdDxt. A bare
-- GRANT SELECT would be a silent no-op that leaves INSERT/UPDATE/DELETE in
-- place. Revoke both roles first, then grant back only what is wanted.
--
-- DELETE is never granted: a superseded mapping is deactivated, not destroyed,
-- so the record of what the IQAC once believed survives.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.iqac_cac_metric_map FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.iqac_cac_metric_map TO authenticated;

ALTER TABLE public.iqac_cac_metric_map ENABLE ROW LEVEL SECURITY;

-- Reads follow the same key that gates the page.
DROP POLICY IF EXISTS iqac_cac_metric_map_select ON public.iqac_cac_metric_map;
CREATE POLICY iqac_cac_metric_map_select ON public.iqac_cac_metric_map
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.metrics.view'), false)
  );

-- Writes need the catalog-management key, which is the same key that lets
-- somebody add a metric to the framework in the first place.
DROP POLICY IF EXISTS iqac_cac_metric_map_insert ON public.iqac_cac_metric_map;
CREATE POLICY iqac_cac_metric_map_insert ON public.iqac_cac_metric_map
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.metrics.manage'), false)
  );

DROP POLICY IF EXISTS iqac_cac_metric_map_update ON public.iqac_cac_metric_map;
CREATE POLICY iqac_cac_metric_map_update ON public.iqac_cac_metric_map
  FOR UPDATE TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.metrics.manage'), false)
  )
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.metrics.manage'), false)
  );

-- ---------------------------------------------------------------------------
-- Audit log. Required by the config-table pattern: a mapping that changed with
-- no record of who changed it or why is a mapping nobody can defend to an
-- assessor.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iqac_cac_metric_map_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     UUID NOT NULL REFERENCES public.iqac_cac_metric_map(id) ON DELETE CASCADE,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by    UUID REFERENCES public.profiles(id),
  old_value     JSONB,
  new_value     JSONB,
  change_reason TEXT
);

-- Same grant discipline. The log is read-only to everybody; only the trigger,
-- which is SECURITY DEFINER, writes it.
REVOKE ALL ON TABLE public.iqac_cac_metric_map_audit FROM anon, PUBLIC, authenticated;
GRANT SELECT ON TABLE public.iqac_cac_metric_map_audit TO authenticated;

ALTER TABLE public.iqac_cac_metric_map_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iqac_cac_metric_map_audit_select ON public.iqac_cac_metric_map_audit;
CREATE POLICY iqac_cac_metric_map_audit_select ON public.iqac_cac_metric_map_audit
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.metrics.view'), false)
  );

CREATE OR REPLACE FUNCTION public.fn_iqac_cac_metric_map_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.iqac_cac_metric_map_audit (
    config_id, changed_by, old_value, new_value, change_reason
  )
  VALUES (
    NEW.id,
    auth.uid(),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    NEW.change_reason
  );
  RETURN NEW;
END;
$$;

-- A trigger function is exempt from the anon-EXECUTE guard (PostgreSQL does not
-- check EXECUTE when a trigger fires, and PostgREST cannot RPC it). The revoke
-- is written anyway: Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every
-- new function to anon, and a function that is a no-op for anon today is one
-- signature change away from not being one.
REVOKE EXECUTE ON FUNCTION public.fn_iqac_cac_metric_map_audit() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS iqac_cac_metric_map_audit_trg ON public.iqac_cac_metric_map;
CREATE TRIGGER iqac_cac_metric_map_audit_trg
  AFTER INSERT OR UPDATE ON public.iqac_cac_metric_map
  FOR EACH ROW EXECUTE FUNCTION public.fn_iqac_cac_metric_map_audit();

COMMIT;
