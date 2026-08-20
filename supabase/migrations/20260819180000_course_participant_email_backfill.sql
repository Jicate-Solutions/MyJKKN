-- =====================================================================
-- Course Events — backfill a contact email onto an EXISTING participant
-- =====================================================================
-- fn_course_approve_application only wrote profiles.email inside the
-- branch that CREATES the profile. A person who was already provisioned
-- — someone taking their second course, or anyone whose identity was
-- created by an earlier approval — kept a NULL email even when the new
-- application supplied one.
--
-- Observed: an application carrying a real address was approved, the
-- welcome email went out (the route uses the ADDRESS FROM THE
-- APPLICATION, not the profile), and profiles.email stayed NULL. Every
-- later notification for that person would then have silently skipped,
-- because the resend path reads the profile.
--
-- COALESCE, not assignment: an address already on the profile is never
-- overwritten by a different one typed into a later application. The
-- profile is the person's record; an application is one moment in time.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_course_backfill_participant_email(
  p_profile_id uuid,
  p_email      text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  UPDATE public.profiles
     SET email = coalesce(email, nullif(btrim(coalesce(p_email, '')), ''))
   WHERE id = p_profile_id
     AND is_external_participant
     AND email IS NULL
     AND nullif(btrim(coalesce(p_email, '')), '') IS NOT NULL;
$fn$;

COMMENT ON FUNCTION public.fn_course_backfill_participant_email(uuid, text) IS
  'Fills profiles.email for an external participant who had none. Never overwrites an existing address. Called by the approval route when it reuses an already-provisioned identity.';

REVOKE ALL ON FUNCTION public.fn_course_backfill_participant_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_course_backfill_participant_email(uuid, text) TO authenticated, service_role;
