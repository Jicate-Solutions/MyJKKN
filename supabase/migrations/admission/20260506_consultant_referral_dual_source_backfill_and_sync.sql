-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260506_consultant_referral_dual_source_backfill_and_sync
--
-- Purpose:   Two parallel referral mechanisms had drifted apart —
--              (A) consultant_lead_attributions table (rich attribution rows
--                  created by the lead-detail "Link Consultant" dialog)
--              (B) referred_by_id columns on admission_leads + learners_profiles
--                  (set by every other entry-point: new-lead form, expo bulk
--                  capture, enquiries module, lead→learner conversion bridge)
--            update_consultant_stats() only counted (A), so 44 of 129 real
--            referrals (~34 %) were invisible.
--
-- Audit:     Pre-fix snapshot (2026-05-06 after SECURITY DEFINER fix):
--              - 85 attribution rows (all from "Link" dialog)
--              - 44 leads with referred_by_id pointing at a real consultant
--                but no attribution row
--              - 28 learners with referred_by_id, all upstream-of leads with
--                same referred_by_id (so 0 learner-only backfills required)
--              - Total displayed: 85, true total: 129
--
-- This migration:
--   1. Adds partial unique indexes for idempotent backfill / upsert
--   2. Propagates learner_profile_id onto existing dialog-created attribution
--      rows whose lead has since been converted (so commission/verification
--      flows can join from either side)
--   3. Backfills 44 missing attribution rows from admission_leads
--   4. (No-op for learners — every learner referral is already covered upstream
--      by its source lead row, verified pre-flight)
--   5. Adds AFTER INSERT/UPDATE triggers on both source tables to keep
--      consultant_lead_attributions in sync going forward
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Partial unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attribution_consultant_admission
  ON public.consultant_lead_attributions (consultant_id, admission_id)
  WHERE admission_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_attribution_consultant_learner
  ON public.consultant_lead_attributions (consultant_id, learner_profile_id)
  WHERE learner_profile_id IS NOT NULL;

-- 2. Propagate learner_profile_id onto existing dialog-created rows
UPDATE public.consultant_lead_attributions a
SET learner_profile_id = al.learner_profile_id,
    updated_at = now()
FROM public.admission_leads al
WHERE a.admission_id = al.id
  AND al.learner_profile_id IS NOT NULL
  AND a.learner_profile_id IS NULL;

-- 3. Backfill from admission_leads.referred_by_id
INSERT INTO public.consultant_lead_attributions (
  institution_id, consultant_id, admission_id, learner_profile_id,
  attribution_type, attribution_percentage, is_verified, referral_source
)
SELECT
  al.institution_id,
  al.referred_by_id,
  al.id,
  al.learner_profile_id,
  'primary',
  100,
  false,
  'backfill_referred_by_id'
FROM public.admission_leads al
WHERE al.referred_by_id IN (SELECT id FROM public.education_consultants)
ON CONFLICT (consultant_id, admission_id) WHERE admission_id IS NOT NULL DO NOTHING;

-- 4. Backfill from learners_profiles.referred_by_id (only the not-already-covered)
INSERT INTO public.consultant_lead_attributions (
  institution_id, consultant_id, learner_profile_id,
  attribution_type, attribution_percentage, is_verified, referral_source
)
SELECT
  lp.institution_id,
  lp.referred_by_id,
  lp.id,
  'primary',
  100,
  false,
  'backfill_referred_by_id'
FROM public.learners_profiles lp
WHERE lp.referred_by_id IN (SELECT id FROM public.education_consultants)
  AND NOT EXISTS (
    SELECT 1 FROM public.admission_leads al
    WHERE al.learner_profile_id = lp.id
      AND al.referred_by_id = lp.referred_by_id
  )
ON CONFLICT (consultant_id, learner_profile_id) WHERE learner_profile_id IS NOT NULL DO NOTHING;

-- 5. Auto-sync function for admission_leads
CREATE OR REPLACE FUNCTION public.sync_lead_referral_to_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.referred_by_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM education_consultants WHERE id = NEW.referred_by_id) THEN
    INSERT INTO consultant_lead_attributions (
      institution_id, consultant_id, admission_id, learner_profile_id,
      attribution_type, attribution_percentage, is_verified, referral_source
    ) VALUES (
      NEW.institution_id, NEW.referred_by_id, NEW.id, NEW.learner_profile_id,
      'primary', 100, false, 'auto_sync_lead'
    )
    ON CONFLICT (consultant_id, admission_id) WHERE admission_id IS NOT NULL DO UPDATE
    SET learner_profile_id = COALESCE(EXCLUDED.learner_profile_id, consultant_lead_attributions.learner_profile_id),
        updated_at = now();
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.referred_by_id IS NOT NULL
     AND OLD.referred_by_id IS DISTINCT FROM NEW.referred_by_id THEN
    DELETE FROM consultant_lead_attributions
    WHERE admission_id = NEW.id
      AND consultant_id = OLD.referred_by_id
      AND referral_source = 'auto_sync_lead';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_lead_referral_to_attribution ON public.admission_leads;
CREATE TRIGGER trg_sync_lead_referral_to_attribution
AFTER INSERT OR UPDATE OF referred_by_id, learner_profile_id, institution_id
ON public.admission_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_referral_to_attribution();

-- 6. Auto-sync function for learners_profiles
CREATE OR REPLACE FUNCTION public.sync_learner_referral_to_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.referred_by_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM education_consultants WHERE id = NEW.referred_by_id)
     AND NOT EXISTS (
       SELECT 1 FROM admission_leads al
       WHERE al.learner_profile_id = NEW.id
         AND al.referred_by_id = NEW.referred_by_id
     ) THEN
    INSERT INTO consultant_lead_attributions (
      institution_id, consultant_id, learner_profile_id,
      attribution_type, attribution_percentage, is_verified, referral_source
    ) VALUES (
      NEW.institution_id, NEW.referred_by_id, NEW.id,
      'primary', 100, false, 'auto_sync_learner'
    )
    ON CONFLICT (consultant_id, learner_profile_id) WHERE learner_profile_id IS NOT NULL DO NOTHING;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.referred_by_id IS NOT NULL
     AND OLD.referred_by_id IS DISTINCT FROM NEW.referred_by_id THEN
    DELETE FROM consultant_lead_attributions
    WHERE learner_profile_id = NEW.id
      AND consultant_id = OLD.referred_by_id
      AND referral_source = 'auto_sync_learner';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_learner_referral_to_attribution ON public.learners_profiles;
CREATE TRIGGER trg_sync_learner_referral_to_attribution
AFTER INSERT OR UPDATE OF referred_by_id, institution_id
ON public.learners_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_learner_referral_to_attribution();
