-- A login-enabled staff member must have an institution email, because that
-- address IS their login identity.
--
-- THE BUG THIS CLOSES. sync_staff_to_profiles wraps its ENTIRE body in
--   IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
-- so a blank institution email means no profile row is created and profile_id
-- stays NULL. The staff record looks complete and says login_enabled = true,
-- but the person has no profile and therefore cannot sign in — nothing errors,
-- nothing warns.
--
-- StaffService.createStaff described this as the trigger handling NULL
-- "gracefully (skips profile-link)". Skipping is not graceful when the whole
-- point of the field is to create the login.
--
-- Five active staff were created this way between 2026-08-17 and 2026-08-27
-- (NOTCOP034, CNR021, CNR020, NOTCOP035, NOTJIC013). They are NOT repaired
-- here: an institution email is a login identity and must be the person's real
-- @jkkn.ac.in address, which cannot be invented. They are listed by the query
-- at the bottom of this file for HR to fill in.
--
-- View-only staff (login_enabled = false) are unaffected: the service already
-- generates a synthetic @nolog.jkkn.local institution email for them, which is
-- precisely why all 112 of them DO have profiles.
--
-- INSERT-only by design. Making this fire on UPDATE too would lock the five
-- existing rows out of every edit — including the edit that adds the missing
-- email. Same rule as the other guards in this codebase: block the new bad
-- rows, leave the existing ones repairable.

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_staff_require_institution_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF coalesce(NEW.login_enabled, true)
     AND nullif(btrim(coalesce(NEW.institution_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Institution email is required for a staff member who can sign in. It becomes their login identity; without it no profile is created and they cannot log in. Either provide an @jkkn.ac.in address, or turn off "Login user" to create a view-only record.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.fn_staff_require_institution_email() IS
  'Refuses to create a login-enabled staff member with no institution email, which sync_staff_to_profiles would silently leave without a profile (and therefore without a login).';

REVOKE ALL ON FUNCTION public.fn_staff_require_institution_email() FROM anon, authenticated, PUBLIC;

-- Fires before trg_sync_staff_to_profiles (BEFORE row triggers run in
-- alphabetical name order, and 'trg_staff_...' sorts before 'trg_sync_...').
DROP TRIGGER IF EXISTS trg_staff_require_institution_email ON public.staff;
CREATE TRIGGER trg_staff_require_institution_email
  BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_require_institution_email();

COMMIT;

-- Staff still needing a real institution email before they can sign in:
--   SELECT staff_id, first_name, last_name, email, institution_id
--   FROM public.staff
--   WHERE profile_id IS NULL AND login_enabled AND is_active;
