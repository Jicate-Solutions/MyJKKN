-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260506_fix_consultant_stats_security_definer
-- Purpose:   education_consultants.total_leads_referred was being overwritten
--            with RLS-scoped counts because update_consultant_stats() ran as
--            SECURITY INVOKER. The inner SELECT COUNT(*) inside the trigger
--            was filtered by the inserting user's RLS policy on
--            consultant_lead_attributions, so each insert ratcheted the stored
--            counter to whatever the last inserter could see (often 0).
--
-- Audit:     Pre-fix snapshot (2026-05-06): total stored counter = 14,
--            actual attributions = 85 (83% under-counted across 28 consultants).
--
-- Fix:       (1) update_consultant_stats() → SECURITY DEFINER + search_path
--            (2) Add UPDATE-side handler so re-attributions recompute both
--                the old and the new consultant.
--            (3) One-time backfill of the existing wrong counters.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Re-create function as SECURITY DEFINER with hardened search_path
CREATE OR REPLACE FUNCTION public.update_consultant_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE education_consultants SET
    total_leads_referred = COALESCE((
      SELECT COUNT(*) FROM consultant_lead_attributions
      WHERE consultant_id = COALESCE(NEW.consultant_id, OLD.consultant_id)
    ), 0)
  WHERE id = COALESCE(NEW.consultant_id, OLD.consultant_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 2. Add UPDATE-side handler so re-attributions (changing consultant_id on an
--    existing row) recompute stats for BOTH the old and new consultant.
CREATE OR REPLACE FUNCTION public.update_consultant_stats_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.consultant_id IS DISTINCT FROM OLD.consultant_id THEN
    UPDATE education_consultants SET
      total_leads_referred = COALESCE((
        SELECT COUNT(*) FROM consultant_lead_attributions
        WHERE consultant_id = OLD.consultant_id
      ), 0)
    WHERE id = OLD.consultant_id;
  END IF;
  UPDATE education_consultants SET
    total_leads_referred = COALESCE((
      SELECT COUNT(*) FROM consultant_lead_attributions
      WHERE consultant_id = NEW.consultant_id
    ), 0)
  WHERE id = NEW.consultant_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_update_consultant_lead_stats_on_update ON consultant_lead_attributions;
CREATE TRIGGER trg_update_consultant_lead_stats_on_update
AFTER UPDATE ON consultant_lead_attributions
FOR EACH ROW EXECUTE FUNCTION update_consultant_stats_on_update();

-- 3. One-time backfill of existing wrong counters
UPDATE education_consultants ec
SET total_leads_referred = COALESCE(sub.cnt, 0)
FROM (
  SELECT consultant_id, COUNT(*) AS cnt
  FROM consultant_lead_attributions
  WHERE consultant_id IS NOT NULL
  GROUP BY consultant_id
) sub
WHERE ec.id = sub.consultant_id
  AND ec.total_leads_referred IS DISTINCT FROM sub.cnt;

-- Zero out consultants with stale non-zero counters but no attribution rows
UPDATE education_consultants
SET total_leads_referred = 0
WHERE total_leads_referred <> 0
  AND id NOT IN (
    SELECT DISTINCT consultant_id
    FROM consultant_lead_attributions
    WHERE consultant_id IS NOT NULL
  );
