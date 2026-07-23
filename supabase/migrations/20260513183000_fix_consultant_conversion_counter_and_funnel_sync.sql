-- ============================================================================
-- Fix: consultant conversion counter never increments + funnel_stage doesn't
-- propagate to consultant_lead_attributions.current_stage
-- ============================================================================
-- Created: 2026-05-13
--
-- Background: end-to-end workflow test on prod (2026-05-12) exercised the
-- commission lifecycle for the first time and surfaced two coupled gaps:
--
--   Bug #1: education_consultants.total_conversions never increments even
--           after a consultant's referred lead reaches funnel_stage='enrolled'
--           AND a commission row reaches status='paid'. The Conversion Rate
--           KPI shows 0.0% on every consultant detail page regardless of
--           actual activity. Affects all 16 active consultants on prod.
--
--   Bug #2: When admission_leads.funnel_stage is updated, the related
--           consultant_lead_attributions.current_stage is NOT updated. All
--           227 prod attribution rows are stuck at 'lead_registered' even
--           when their underlying leads have advanced through funnel.
--
-- These bugs are coupled: Bug #2 means attribution.current_stage never
-- changes, which means Bug #1's counter (when fixed to compute from
-- current_stage) would still be wrong without Bug #2's trigger.
--
-- Together they block the consultant_commission_trigger_config substrate
-- from PR #874 — toggling creates_commission=true on an auto-trigger row
-- would be a no-op because attribution.current_stage never advances.
--
-- This migration:
--   1. Adds a new AFTER UPDATE trigger on admission_leads that propagates
--      funnel_stage changes to the related consultant_lead_attributions row.
--   2. Extends update_consultant_stats and update_consultant_stats_on_update
--      to also compute total_conversions + conversion_rate from
--      attribution.current_stage in ('enrolled','confirmed').
--   3. Backfills all 227 attribution rows to match their lead's current
--      funnel_stage + recomputes counters on all consultants.
--
-- Reversibility: triggers and functions are CREATE OR REPLACE / DROP IF
-- EXISTS. To revert, re-apply prior migration's function bodies and DROP
-- the new trigger. The backfill writes are recoverable via stage_history
-- jsonb (each modified row records its 'backfill_2026_05_13' source).
-- ============================================================================

BEGIN;

-- ─── Part 1: New trigger sync_lead_funnel_stage_to_attribution ──────────────

CREATE OR REPLACE FUNCTION public.sync_lead_funnel_stage_to_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire when funnel_stage actually changed (defensive — also enforced by WHEN clause)
  IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage THEN
    UPDATE consultant_lead_attributions
    SET current_stage = NEW.funnel_stage::text,
        stage_history = COALESCE(stage_history, '[]'::jsonb) || jsonb_build_object(
          'stage', NEW.funnel_stage::text,
          'at', now()::text,
          'previous', OLD.funnel_stage::text,
          'source', 'auto_sync_funnel_stage'
        )
    WHERE admission_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_lead_funnel_stage_to_attribution ON admission_leads;

CREATE TRIGGER trg_sync_lead_funnel_stage_to_attribution
  AFTER UPDATE OF funnel_stage ON admission_leads
  FOR EACH ROW
  WHEN (OLD.funnel_stage IS DISTINCT FROM NEW.funnel_stage)
  EXECUTE FUNCTION public.sync_lead_funnel_stage_to_attribution();

-- ─── Part 2: Extend update_consultant_stats to count conversions ────────────
-- Fires on attribution INSERT + DELETE.

CREATE OR REPLACE FUNCTION public.update_consultant_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_consultant_id UUID := COALESCE(NEW.consultant_id, OLD.consultant_id);
  v_total_leads INT;
  v_total_conversions INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE current_stage IN ('enrolled', 'confirmed'))
  INTO v_total_leads, v_total_conversions
  FROM consultant_lead_attributions
  WHERE consultant_id = v_consultant_id;

  UPDATE education_consultants
  SET total_leads_referred = COALESCE(v_total_leads, 0),
      total_conversions = COALESCE(v_total_conversions, 0),
      conversion_rate = CASE WHEN COALESCE(v_total_leads, 0) > 0
        THEN ROUND((COALESCE(v_total_conversions, 0)::numeric / v_total_leads) * 100, 2)
        ELSE 0
      END
  WHERE id = v_consultant_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ─── Part 3: Extend update_consultant_stats_on_update ───────────────────────
-- Fires on attribution UPDATE. Handles both branches (consultant_id change
-- + stage change) by recomputing both consultants if applicable.

CREATE OR REPLACE FUNCTION public.update_consultant_stats_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_leads INT;
  v_total_conversions INT;
BEGIN
  -- If consultant changed, recompute the OLD consultant's stats too
  IF NEW.consultant_id IS DISTINCT FROM OLD.consultant_id THEN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE current_stage IN ('enrolled', 'confirmed'))
    INTO v_total_leads, v_total_conversions
    FROM consultant_lead_attributions
    WHERE consultant_id = OLD.consultant_id;

    UPDATE education_consultants
    SET total_leads_referred = COALESCE(v_total_leads, 0),
        total_conversions = COALESCE(v_total_conversions, 0),
        conversion_rate = CASE WHEN COALESCE(v_total_leads, 0) > 0
          THEN ROUND((COALESCE(v_total_conversions, 0)::numeric / v_total_leads) * 100, 2)
          ELSE 0
        END
    WHERE id = OLD.consultant_id;
  END IF;

  -- Always recompute NEW consultant's stats (handles stage changes too)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE current_stage IN ('enrolled', 'confirmed'))
  INTO v_total_leads, v_total_conversions
  FROM consultant_lead_attributions
  WHERE consultant_id = NEW.consultant_id;

  UPDATE education_consultants
  SET total_leads_referred = COALESCE(v_total_leads, 0),
      total_conversions = COALESCE(v_total_conversions, 0),
      conversion_rate = CASE WHEN COALESCE(v_total_leads, 0) > 0
        THEN ROUND((COALESCE(v_total_conversions, 0)::numeric / v_total_leads) * 100, 2)
        ELSE 0
      END
  WHERE id = NEW.consultant_id;

  RETURN NEW;
END;
$function$;

-- ─── Part 4: Backfill — sync existing attributions to their lead's stage ────
-- Affects ~227 rows; only writes where attribution.current_stage diverges
-- from admission_leads.funnel_stage.

UPDATE consultant_lead_attributions cla
SET current_stage = al.funnel_stage::text,
    stage_history = COALESCE(cla.stage_history, '[]'::jsonb) || jsonb_build_object(
      'stage', al.funnel_stage::text,
      'at', now()::text,
      'previous', cla.current_stage,
      'source', 'backfill_2026_05_13'
    )
FROM admission_leads al
WHERE cla.admission_id = al.id
  AND cla.current_stage IS DISTINCT FROM al.funnel_stage::text;

-- ─── Part 5: Backfill — recompute counters on all consultants ───────────────
-- Computes total_leads_referred + total_conversions + conversion_rate from
-- the (now-corrected) attribution rows. Touches all consultants that have
-- attributions; consultants with zero attributions stay at zero.

UPDATE education_consultants ec
SET total_leads_referred = COALESCE(sub.total_leads, 0),
    total_conversions = COALESCE(sub.total_conversions, 0),
    conversion_rate = CASE WHEN COALESCE(sub.total_leads, 0) > 0
      THEN ROUND((COALESCE(sub.total_conversions, 0)::numeric / sub.total_leads) * 100, 2)
      ELSE 0
    END
FROM (
  SELECT
    consultant_id,
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE current_stage IN ('enrolled', 'confirmed')) AS total_conversions
  FROM consultant_lead_attributions
  GROUP BY consultant_id
) sub
WHERE ec.id = sub.consultant_id;

COMMIT;
