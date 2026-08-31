-- ============================================================================
-- staff.first_name / last_name -> canonical UPPERCASE, whitespace-normalised
-- ----------------------------------------------------------------------------
-- WHY
--   Staff names were stored in whatever case the operator typed: of 868 rows,
--   408 first names and 43 last names were mixed/sentence case, 59 first names
--   and 4 last names carried leading or trailing padding, and 3 had internal
--   double spaces. That makes 'Anil Kumar ' and 'ANIL KUMAR' look like two
--   different people in every export, sort and duplicate check.
--
--   Canonical form is: upper(regexp_replace(btrim(x), '\s+', ' ', 'g'))
--   i.e. trim the ends, collapse runs of whitespace to one space, uppercase.
--
-- TRIGGER ORDER IS LOAD-BEARING — DO NOT RENAME THIS TRIGGER.
--   Postgres fires row triggers in ALPHABETICAL NAME ORDER. staff already has
--   a BEFORE INSERT OR UPDATE trigger `trg_sync_staff_to_profiles`, which sets
--   profiles.full_name = CONCAT(NEW.first_name,' ',NEW.last_name).
--   `trg_normalize_staff_names` sorts BEFORE it ('n' < 's'), so profiles
--   receive the already-normalised value and the two tables can never drift.
--   Renaming this to e.g. `trg_upper_staff_names` would sort it AFTER the sync
--   ('u' > 's') and silently leave every profiles.full_name in mixed case.
--
-- SEARCH IS UNAFFECTED. Every name lookup in the app uses `ilike`, which is
--   case-insensitive (employee-service, leave-assignment-service,
--   recruitment-service, leave-onduty-service, …). Uppercase storage breaks
--   no query.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Canonical normaliser — one definition, used by the backfill, the trigger
--    and the CHECK constraints so all three can never disagree.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_canonical_staff_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN p_name IS NULL THEN NULL
           ELSE upper(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
         END;
$function$;

COMMENT ON FUNCTION public.fn_canonical_staff_name(text) IS
  'Canonical staff-name form: trim ends, collapse internal whitespace runs to a single space, uppercase. IMMUTABLE so CHECK constraints may call it.';

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- update_staff_updated_at is disabled for the backfill: bumping updated_at on
-- all 868 rows would make the entire workforce read as "edited today" in every
-- recently-changed view and audit trail, for a change no human made.
--
-- trg_sync_staff_to_profiles is deliberately LEFT ENABLED — profiles.full_name
-- SHOULD follow, and because of the alphabetical ordering above it receives the
-- normalised value automatically.
ALTER TABLE public.staff DISABLE TRIGGER update_staff_updated_at;

UPDATE public.staff
   SET first_name = public.fn_canonical_staff_name(first_name),
       last_name  = public.fn_canonical_staff_name(last_name)
 WHERE first_name IS DISTINCT FROM public.fn_canonical_staff_name(first_name)
    OR last_name  IS DISTINCT FROM public.fn_canonical_staff_name(last_name);

ALTER TABLE public.staff ENABLE TRIGGER update_staff_updated_at;

-- ---------------------------------------------------------------------------
-- 3. Normalise-on-write trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_normalize_staff_names()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.first_name := public.fn_canonical_staff_name(NEW.first_name);
  NEW.last_name  := public.fn_canonical_staff_name(NEW.last_name);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_normalize_staff_names ON public.staff;

-- Name must keep sorting before trg_sync_staff_to_profiles — see header.
CREATE TRIGGER trg_normalize_staff_names
  BEFORE INSERT OR UPDATE OF first_name, last_name ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_normalize_staff_names();

-- ---------------------------------------------------------------------------
-- 4. CHECK constraints — belt and braces
-- ---------------------------------------------------------------------------
-- Unreachable in normal operation (the trigger normalises first), but they make
-- the invariant impossible to bypass and self-document the rule for anyone
-- reading the schema. NOT VALID would defeat the purpose, so they are validated.
ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_first_name_canonical,
  DROP CONSTRAINT IF EXISTS staff_last_name_canonical;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_first_name_canonical
    CHECK (first_name IS NULL OR first_name = public.fn_canonical_staff_name(first_name)),
  ADD CONSTRAINT staff_last_name_canonical
    CHECK (last_name IS NULL OR last_name = public.fn_canonical_staff_name(last_name));

-- ---------------------------------------------------------------------------
-- 5. Assertions — fail the migration rather than ship a half-applied state
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_bad_first  int;
  v_bad_last   int;
  v_profile_mismatch int;
BEGIN
  SELECT count(*) INTO v_bad_first
    FROM public.staff
   WHERE first_name IS DISTINCT FROM public.fn_canonical_staff_name(first_name);
  IF v_bad_first > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % staff row(s) still have a non-canonical first_name', v_bad_first;
  END IF;

  SELECT count(*) INTO v_bad_last
    FROM public.staff
   WHERE last_name IS DISTINCT FROM public.fn_canonical_staff_name(last_name);
  IF v_bad_last > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % staff row(s) still have a non-canonical last_name', v_bad_last;
  END IF;

  -- profiles.full_name must have followed via trg_sync_staff_to_profiles for
  -- every staff row that actually has a linked profile.
  SELECT count(*) INTO v_profile_mismatch
    FROM public.staff s
    JOIN public.profiles p ON p.id = s.profile_id
   WHERE s.institution_email IS NOT NULL
     AND s.institution_email <> ''
     AND p.full_name IS DISTINCT FROM concat(s.first_name, ' ', s.last_name);
  IF v_profile_mismatch > 0 THEN
    RAISE WARNING 'staff-name backfill: % linked profile(s) whose full_name does not match staff name (pre-existing drift, not caused by this migration)', v_profile_mismatch;
  END IF;

  RAISE NOTICE 'staff name canonicalisation: backfill + trigger + constraints OK';
END
$assert$;
