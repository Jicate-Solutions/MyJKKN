-- ============================================================================
-- profiles.is_active must mirror the app's login allow-list, not a subset of it
-- ============================================================================
-- BLOCKER found while fixing the billing auto-promotion pipeline (see
-- 20260811140000_fix_learner_status_auto_promotion.sql). That migration makes
-- partial payments promote learners again — and every promotion fires
-- sync_learner_status_to_profile, which was still deciding login access with:
--
--     should_be_active := (NEW.lifecycle_status IN ('active','graduated'));
--
-- The application grants restricted (induction-only) access to five MORE
-- statuses. lib/constants/induction-access.ts:
--
--     INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES =
--       ['admitted','reserved','enquiry_submitted','enquiry','account']
--
-- and proxy.ts:492 rejects `profile.is_active === false` — redirecting to
-- /unauthorized?reason=inactive AND CLEARING THE AUTH COOKIES — at line 492,
-- before the student lifecycle gate at line 544 ever runs. A learner whose
-- is_active was flipped false never reaches the induction-tier check that would
-- have let them in.
--
-- So promoting a learner reserved -> admitted REVOKED their My Induction login.
--
-- THIS HAS ALREADY HAPPENED. Measured 2026-08-11:
--     reserved   336 enabled /  0 disabled
--     admitted    13 enabled / 15 DISABLED   <- the fingerprint
--     account      1 enabled /  0 disabled
-- The 15 are learners the 120 working auto_threshold promotions carried into
-- 'admitted'; the trigger took their induction access on the way through. The
-- 'reserved' cohort is untouched only because the billing bug meant they were
-- never promoted a second time. Repairing billing without this would have
-- multiplied 15 into 77.
--
-- This is the SAME DRIFT as 20260623150000_graduated_learners_keep_profile_active
-- (which restored 761 locked-out graduated learners), one status-set later. The
-- allow-list lives in four places and only this one was left behind —
-- auto_link_profile_to_approved_learner already carries the full list, which is
-- why access depends on whether a learner's profile was created before or after
-- their promotion.
--
-- Statuses deliberately still BLOCKED: pending, approved, rejected, waitlisted,
-- inactive, withdrawal_pending, exited, alumni.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_learner_status_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  existing_profile_id UUID;
  should_be_active BOOLEAN;
BEGIN
  -- Only sync if lifecycle_status changed
  IF OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN

    -- MUST mirror the application's login gates. Two tiers, one flag:
    --   'active' / 'graduated'            -> full portal access
    --   the INDUCTION_ELIGIBLE_* statuses -> restricted, My Induction only
    -- is_active only decides whether the request survives proxy.ts:492 at all;
    -- WHICH pages they then reach is StudentValidationService's accessTier.
    -- Keep this list identical to lib/constants/induction-access.ts and to
    -- auto_link_profile_to_approved_learner, or login depends on the order a
    -- learner's profile and promotion happened to occur in.
    should_be_active := (NEW.lifecycle_status IN (
      'active', 'graduated',
      'admitted', 'reserved', 'enquiry_submitted', 'enquiry', 'account'
    ));

    -- Find profile by learner_id
    SELECT id INTO existing_profile_id
    FROM profiles
    WHERE learner_id = NEW.id
    LIMIT 1;

    IF existing_profile_id IS NOT NULL THEN
      -- Update is_active status
      UPDATE profiles
      SET
        is_active = should_be_active,
        updated_at = NOW()
      WHERE id = existing_profile_id;

      RAISE NOTICE 'Synced profile % is_active to % for learner % (lifecycle_status: % -> %)',
        existing_profile_id, should_be_active, NEW.id, OLD.lifecycle_status, NEW.lifecycle_status;
    ELSE
      RAISE NOTICE 'No profile found for learner % to sync lifecycle_status change', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Repair the learners this already locked out ────────────────────────────
-- Same remedy 20260623150000 applied to graduated learners. Scoped to the
-- induction-eligible statuses only: a disabled profile on any OTHER status was
-- disabled on purpose and must stay that way.
UPDATE public.profiles pr
   SET is_active = true,
       updated_at = NOW()
  FROM public.learners_profiles lp
 WHERE lp.id = pr.learner_id
   AND pr.is_active IS FALSE
   AND lp.lifecycle_status::text IN (
         'admitted', 'reserved', 'enquiry_submitted', 'enquiry', 'account'
       );
