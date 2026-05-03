-- ============================================================================
-- Activity-writer audit fix for admission_leads
-- ============================================================================
-- Verdict: Writer artifact (Verdict A from triage doc 2026-05-03)
--
-- Empirical observation (30-day window at apply time):
--   * 711 distinct leads have real activity in admission_call_logs +
--     admission_whatsapp_logs + admission_lead_activities
--   * 689 of those 711 (97%) had last_activity_at = NULL
--   * 595 of those 711 (84%) had first_touch_at = NULL
--   * Counselor outcome metric (fn_dashboard_streak / fn_compute_ohs_for_institution
--     / fn_dashboard_morning_brief) reads first_touch_at to compute SLA compliance.
--     With first_touch_at structurally NULL, that metric is artificially deflated.
--
-- Root cause:
--   * trg_lead_first_touch_fn fires only on admission_lead_activities INSERT.
--   * Production code paths (call-pipeline, WhatsApp logs) write to
--     admission_call_logs / admission_whatsapp_logs and DO NOT also insert
--     a corresponding admission_lead_activities row.
--   * Result: counselor touches via call/WhatsApp never propagate to the
--     timestamp columns that drive dashboards.
--
-- Fix shape (additive only):
--   1. Generic trigger fn fn_admission_leads_touch_from_log() that updates
--      first_touch_at (only when NULL) and last_activity_at (always to
--      MAX of existing/incoming).
--   2. AFTER INSERT triggers on admission_call_logs and admission_whatsapp_logs
--      that fire when NEW.lead_id IS NOT NULL.
--   3. One-time backfill that uses GREATEST/COALESCE so we NEVER overwrite
--      a non-NULL first_touch_at and never regress last_activity_at.
--
-- Backfill safety (per memory feedback_admission_leads_counselor_id_fk_drift.md):
--   * COALESCE guards prevent overwriting any existing non-NULL value.
--   * Joins are explicit; no implicit role/taxonomy assumptions.
--   * Limited to leads with at least one real activity record (no synthetic
--     timestamps for leads that have genuinely never been touched).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Generic touch-propagator function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_admission_leads_touch_from_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE admission_leads l
  SET
    first_touch_at = COALESCE(l.first_touch_at, NEW.created_at),
    last_activity_at = GREATEST(COALESCE(l.last_activity_at, NEW.created_at), NEW.created_at)
  WHERE l.id = NEW.lead_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_admission_leads_touch_from_log() IS
  'Propagates activity from log tables (calls, whatsapp, etc.) to admission_leads.first_touch_at + last_activity_at. Additive only — never overwrites non-NULL first_touch_at, never regresses last_activity_at.';

-- ----------------------------------------------------------------------------
-- 2. Triggers on log tables
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_admission_call_logs_touch_lead ON public.admission_call_logs;
CREATE TRIGGER trg_admission_call_logs_touch_lead
  AFTER INSERT ON public.admission_call_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admission_leads_touch_from_log();

DROP TRIGGER IF EXISTS trg_admission_whatsapp_logs_touch_lead ON public.admission_whatsapp_logs;
CREATE TRIGGER trg_admission_whatsapp_logs_touch_lead
  AFTER INSERT ON public.admission_whatsapp_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admission_leads_touch_from_log();

-- ----------------------------------------------------------------------------
-- 3. One-time backfill (safe — COALESCE/GREATEST guarded)
-- ----------------------------------------------------------------------------
WITH lead_first_touch AS (
  SELECT lead_id, MIN(created_at) AS first_at
  FROM (
    SELECT lead_id, created_at FROM admission_lead_activities WHERE lead_id IS NOT NULL
    UNION ALL
    SELECT lead_id, created_at FROM admission_call_logs WHERE lead_id IS NOT NULL
    UNION ALL
    SELECT lead_id, created_at FROM admission_whatsapp_logs WHERE lead_id IS NOT NULL
  ) all_activity
  GROUP BY lead_id
),
lead_last_activity AS (
  SELECT lead_id, MAX(created_at) AS last_at
  FROM (
    SELECT lead_id, created_at FROM admission_lead_activities WHERE lead_id IS NOT NULL
    UNION ALL
    SELECT lead_id, created_at FROM admission_call_logs WHERE lead_id IS NOT NULL
    UNION ALL
    SELECT lead_id, created_at FROM admission_whatsapp_logs WHERE lead_id IS NOT NULL
  ) all_activity
  GROUP BY lead_id
)
UPDATE admission_leads l
SET
  first_touch_at = COALESCE(l.first_touch_at, lft.first_at),
  last_activity_at = GREATEST(
    COALESCE(l.last_activity_at, lla.last_at),
    COALESCE(lla.last_at, l.last_activity_at)
  )
FROM lead_first_touch lft
LEFT JOIN lead_last_activity lla ON lla.lead_id = lft.lead_id
WHERE l.id = lft.lead_id
  AND (l.first_touch_at IS NULL OR l.last_activity_at IS NULL);

COMMIT;
