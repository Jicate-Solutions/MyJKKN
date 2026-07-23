-- ============================================================================
-- Graduated learners: keep login profile active
-- ============================================================================
-- Problem:
--   The trigger sync_learner_status_to_profile() set profiles.is_active to
--   (lifecycle_status = 'active'), so promoting a learner to 'graduated'
--   flipped their profile to is_active = false. The proxy.ts middleware checks
--   `is_active === false` BEFORE the student lifecycle gate, redirecting those
--   users to /unauthorized?reason=inactive. They therefore never reached
--   StudentValidationService, whose allow-list is ['active','graduated'].
--
--   This contradicted the rest of the system, which was designed to grant
--   graduated learners learner-portal access (StudentValidationService,
--   every LEARNER_ROUTES entry, and the OAuth approved-learner path all allow
--   'graduated'). Net effect: 916 graduated learners — 761 of them already
--   is_active = false — could not log in, blocking DC/convocation Service
--   Requests.
--
-- Fix:
--   1. Mirror the validation allow-list in the trigger: a profile stays active
--      when lifecycle_status IN ('active','graduated'). All other statuses
--      (exited, inactive, rejected, …) still deactivate the profile.
--   2. Backfill the existing graduated learners whose profiles were already
--      deactivated by the old trigger.
--
-- The 'student' role already holds service_requests.submit / view_own /
-- cancel_own, so no permission grant is required — reactivating login is
-- sufficient for graduated learners to submit Service Requests.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_learner_status_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  existing_profile_id UUID;
  should_be_active BOOLEAN;
BEGIN
  -- Only sync if lifecycle_status changed
  IF OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN

    -- Learners who can log in: active OR graduated.
    -- Mirrors StudentValidationService.validateStudentAccess allow-list.
    should_be_active := (NEW.lifecycle_status IN ('active', 'graduated'));

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
$$;

COMMENT ON FUNCTION sync_learner_status_to_profile IS
'Auto-syncs learner lifecycle_status changes to profiles.is_active. Active and graduated learners can log in (mirrors StudentValidationService allow-list).';

-- ----------------------------------------------------------------------------
-- Backfill: reactivate profiles for already-graduated learners that the old
-- trigger had deactivated. Scoped strictly to lifecycle_status = 'graduated'
-- so exited/inactive learners stay blocked.
-- ----------------------------------------------------------------------------
UPDATE profiles p
SET is_active = TRUE,
    updated_at = NOW()
FROM learners_profiles lp
WHERE p.learner_id = lp.id
  AND lp.lifecycle_status = 'graduated'
  AND p.is_active IS DISTINCT FROM TRUE;
