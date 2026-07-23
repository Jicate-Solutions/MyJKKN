-- ============================================================================
-- Pre-onboarding learner access to Induction
-- Date: 2026-06-29
-- Spec: specs/pre-onboarding-induction-access-2026-06-29.md
--
-- Lets admission-funnel learners (lifecycle_status enquiry / enquiry_submitted /
-- reserved / admitted) get a login that is SCOPED to the Induction experience
-- (My Induction + per-session feedback + profile completion) before onboarding.
--
-- DB side of the change:
--  1. Widen auto_link_profile_to_approved_learner() so first-login profiles for
--     these statuses link to their learner row (the OAuth callback's
--     auto-provision lookup widens to the same list in code — they MUST match).
--  2. Add fn_my_lifecycle_status() so the client nav can detect an induction-only
--     learner and show only the My Induction + My Profile entries.
--
-- Inert until the application code (callback gate + proxy restriction) ships:
-- the trigger only fires on a profiles INSERT, which the current callback won't
-- perform for these statuses.
-- ============================================================================

-- 1. Widen the auto-link trigger. Rebuilt from the live definition; ONLY the
--    lifecycle_status IN (...) list changed (added the 4 induction statuses).
CREATE OR REPLACE FUNCTION public.auto_link_profile_to_approved_learner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_learner_record RECORD;
    v_full_name TEXT;
BEGIN
    -- Only proceed if this is a NEW profile without learner_id
    IF TG_OP = 'INSERT' AND NEW.learner_id IS NULL AND NEW.email IS NOT NULL THEN

        -- Match an eligible learner by college_email. 'approved'/'active'/
        -- 'graduated' = full access; the 4 induction statuses = pre-onboarding
        -- induction-only access (scoped down by proxy.ts). Keep this list in sync
        -- with INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES + the callback lookup.
        SELECT
            id,
            first_name,
            last_name,
            institution_id,
            department_id,
            lifecycle_status
        INTO v_learner_record
        FROM learners_profiles
        WHERE LOWER(college_email) = LOWER(NEW.email)
        AND lifecycle_status IN (
            'approved', 'active', 'graduated',
            'admitted', 'reserved', 'enquiry_submitted', 'enquiry'
        )
        LIMIT 1;

        -- If learner found, link it to this profile
        IF v_learner_record.id IS NOT NULL THEN

            -- Build full name from learner if not set
            v_full_name := NEW.full_name;
            IF v_full_name IS NULL OR v_full_name = '' THEN
                v_full_name := TRIM(CONCAT(v_learner_record.first_name, ' ', COALESCE(v_learner_record.last_name, '')));
            END IF;

            -- Update the NEW record before it's inserted
            NEW.learner_id := v_learner_record.id;
            NEW.institution_id := COALESCE(NEW.institution_id, v_learner_record.institution_id);
            NEW.department_id := COALESCE(NEW.department_id, v_learner_record.department_id);
            NEW.role := COALESCE(NEW.role, 'student');
            NEW.full_name := v_full_name;
            NEW.profile_completed := true;

            RAISE NOTICE 'Auto-linked new profile to learner: % (email: %, status: %)',
                v_learner_record.id, NEW.email, v_learner_record.lifecycle_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Caller's own lifecycle status — used by the client nav to scope an
--    induction-only learner's sidebar. SECURITY DEFINER (reads learners_profiles
--    past RLS) but only ever returns the CALLER's own row (WHERE p.id = auth.uid()).
CREATE OR REPLACE FUNCTION public.fn_my_lifecycle_status()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lp.lifecycle_status::text
  FROM profiles p
  JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE p.id = auth.uid();
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_lifecycle_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_lifecycle_status() TO authenticated;
