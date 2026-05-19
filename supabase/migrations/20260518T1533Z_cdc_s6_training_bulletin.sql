-- Migration: 20260518T1533Z_cdc_s6_training_bulletin
-- Sprint 6: Training programmes seed + bulletin view + auto-expire
-- Additive only — no table alterations

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Seed cdc_training_types (Unnati / MRB / Springboard + core set)
--    IDEMPOTENT: ON CONFLICT DO NOTHING
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO cdc_training_types (config_key, display_name, description, is_system, is_active, sort_order)
VALUES
  ('unnati',      'Unnati',       'NSDC / TCS-iON government skill-development programme',          true,  true,  10),
  ('mrb',         'MRB',          'Maharashtra Rojgar Bureau training initiative',                   true,  true,  20),
  ('springboard', 'Springboard',  'Industry-aligned technical upskilling (Springboard / Infosys)',  true,  true,  30),
  ('corporate',   'Corporate',    'Corporate-sponsored or company-specific training',                true,  true,  40),
  ('aicte',       'AICTE',        'AICTE-mandated training (FDP / ATAL / NEAT)',                    true,  true,  50),
  ('internal',    'Internal',     'In-house training organised by the institution',                  false, true, 100)
ON CONFLICT (config_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. View: cdc_training_programmes_with_counts
--    Adds enrollment_count column so list pages don't need a sub-query
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW cdc_training_programmes_with_counts AS
SELECT
  tp.*,
  COALESCE(ec.enrollment_count, 0) AS enrollment_count
FROM cdc_training_programmes tp
LEFT JOIN (
  SELECT programme_id, COUNT(*) AS enrollment_count
  FROM cdc_training_enrollments
  GROUP BY programme_id
) ec ON ec.programme_id = tp.id;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Function: fn_cdc_expire_stale_opportunities
--    Sets is_active=false when deadline_date has passed and is_active is still true.
--    Called by pg_cron (see comment below) or on-demand.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_cdc_expire_stale_opportunities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE cdc_external_opportunities
  SET
    is_active   = false,
    archived_at = NOW(),
    updated_at  = NOW()
  WHERE
    is_active      = true
    AND archived_at IS NULL
    AND deadline_date < CURRENT_DATE;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- Note: Schedule with pg_cron once extension is confirmed available:
--   SELECT cron.schedule('cdc-expire-opportunities', '0 1 * * *',
--     'SELECT fn_cdc_expire_stale_opportunities()');

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Verify (SELECT-only — no INSERT smoke test)
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  type_count  integer;
  view_exists boolean;
  fn_exists   boolean;
BEGIN
  SELECT COUNT(*) INTO type_count FROM cdc_training_types WHERE config_key IN ('unnati','mrb','springboard');
  SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_name = 'cdc_training_programmes_with_counts') INTO view_exists;
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'fn_cdc_expire_stale_opportunities') INTO fn_exists;

  IF type_count < 3 THEN
    RAISE EXCEPTION 'Training type seed incomplete (found %, need >= 3)', type_count;
  END IF;
  IF NOT view_exists THEN
    RAISE EXCEPTION 'View cdc_training_programmes_with_counts not found';
  END IF;
  IF NOT fn_exists THEN
    RAISE EXCEPTION 'Function fn_cdc_expire_stale_opportunities not found';
  END IF;

  RAISE NOTICE 'Sprint 6 migration verified: % training types, view OK, fn OK', type_count;
END;
$$;
