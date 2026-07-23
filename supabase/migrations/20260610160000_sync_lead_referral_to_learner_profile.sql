-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260610160000_sync_lead_referral_to_learner_profile
--
-- Problem:  learners_profiles.referral_type / referred_by_id / referred_by_name
--           are a denormalized copy taken from admission_leads exactly once —
--           at lead→learner conversion (/api/admission/bridge/convert) plus the
--           one-time 20260418 backfill. Editing a lead's referral details AFTER
--           conversion updated only admission_leads, so the Learners → Enquiries
--           page (which reads learners_profiles) kept showing stale referral data.
--           Audit 2026-06-10: 26 converted leads had referral values their linked
--           profile didn't match.
--
-- Fix:      1. AFTER trigger on admission_leads mirroring the 3 referral columns
--              onto the linked learner profile whenever they (or the link itself)
--              change. Catches every write path: edit dialog, bulk import, RPCs.
--           2. One-time backfill of the 26 drifted profiles (lead wins — the
--              leads module is the only referral edit surface since 2026-05-21;
--              the enquiry form's Reference Information block was removed).
--              Profiles with referral data whose lead has NONE (4 rows, historic
--              learner-side entry points) are intentionally left untouched.
--
-- Trigger interactions (verified against live defs):
--   * Mirroring referred_by_id onto learners_profiles fires
--     trg_sync_learner_referral_to_attribution; its NOT EXISTS guard finds the
--     linked lead with the same referred_by_id (lead row is already updated
--     when AFTER triggers run) and skips the insert — no duplicate
--     consultant_lead_attributions row, no uniq_attribution_consultant_learner
--     collision (the race documented in bridge/convert step 7b).
--   * trg_sync_lead_referral_to_attribution (alphabetically first) still owns
--     the attribution upsert from the lead side; this trigger never touches
--     consultant_lead_attributions.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Trigger function (SECURITY DEFINER: lead editors don't necessarily hold
--    learners_profiles UPDATE rights; matches sync_lead_referral_to_attribution).
CREATE OR REPLACE FUNCTION public.sync_lead_referral_to_learner_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.learner_profile_id IS NOT NULL THEN
    UPDATE learners_profiles lp
    SET referral_type    = NEW.referral_type,
        referred_by_id   = NEW.referred_by_id,
        referred_by_name = NEW.referred_by_name,
        updated_at       = now()
    WHERE lp.id = NEW.learner_profile_id
      AND (lp.referral_type    IS DISTINCT FROM NEW.referral_type
        OR lp.referred_by_id   IS DISTINCT FROM NEW.referred_by_id
        OR lp.referred_by_name IS DISTINCT FROM NEW.referred_by_name);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_lead_referral_to_learner_profile ON public.admission_leads;
CREATE TRIGGER trg_sync_lead_referral_to_learner_profile
AFTER INSERT OR UPDATE OF referral_type, referred_by_id, referred_by_name, learner_profile_id
ON public.admission_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_referral_to_learner_profile();

-- 2. Backfill profiles that drifted since the 20260418 one-time copy.
--    Lead wins, but only where the lead actually has referral data — never
--    null-out a profile from a lead that never carried a referral.
UPDATE public.learners_profiles lp
SET referral_type    = al.referral_type,
    referred_by_id   = al.referred_by_id,
    referred_by_name = al.referred_by_name,
    updated_at       = now()
FROM public.admission_leads al
WHERE al.learner_profile_id = lp.id
  AND (al.referral_type IS NOT NULL OR al.referred_by_id IS NOT NULL OR al.referred_by_name IS NOT NULL)
  AND (lp.referral_type    IS DISTINCT FROM al.referral_type
    OR lp.referred_by_id   IS DISTINCT FROM al.referred_by_id
    OR lp.referred_by_name IS DISTINCT FROM al.referred_by_name);

COMMENT ON FUNCTION public.sync_lead_referral_to_learner_profile() IS
  'Mirrors admission_leads referral attribution (referral_type, referred_by_id, referred_by_name) onto the linked learners_profiles row so post-conversion lead edits stay visible on the Enquiries page. Lead is the single edit surface for referral attribution.';
