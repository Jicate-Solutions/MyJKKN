-- Standardise gender to exactly Male / Female / Other on the two learner tables
-- ---------------------------------------------------------------------------
-- Neither learners_profiles.gender nor profiles.gender had a CHECK constraint, so
-- every writer invented its own casing. Observed 2026-08-20:
--   learners_profiles: FEMALE 3717, MALE 3483, '' 60, male 6, Other 1, female 1,
--                      OTHER 1, Male 1          (8 variants)
--   profiles:          FEMALE 3270, MALE 3215, female 587, male 403, NULL 63,
--                      Other 1, Male 1          (7 variants)
--
-- This is what the Learners dashboard renders as duplicate rows. Its facet RPC
-- get_learners_distribution_by_gender does
--     lp.gender::text AS id, COALESCE(INITCAP(lp.gender),'Unknown') AS name
--     ... GROUP BY lp.gender
-- i.e. it GROUPS BY the raw value but LABELS with INITCAP, so 'FEMALE', 'female'
-- and 'Female' are three groups that all print "Female".
--
-- Canonical form is Title Case (Male / Female / Other), matching what the UI already
-- displays and what marketing_leads_database already enforces.
--
-- SAFETY -- everything that reads these two columns was checked first:
--   * already case-insensitive, unaffected: fn_validate_hostel_allocation_gender,
--     fn_auto_allocate_candidates / _plan, fn_hostel_unallocated_candidates and all
--     fn_my_* / _cl_* hostel RPCs (lower(btrim(...)) IN ('male','m',...));
--     get_billing_coverage_* / get_billing_audit_* (UPPER(TRIM(a))=UPPER(TRIM(b)));
--     fn_mess_choose_caller_context (upper(...)='MALE'); ai_rpc_* (ILIKE);
--     the learner list + export filters (.ilike()).
--   * FIXED BY this change: ai_rpc_students_summary and ai_rpc_students_by_department
--     compare lp.gender = 'Female' / 'Male' exactly. Against 'FEMALE'/'MALE' they have
--     been returning 0 all along; they start working once the data is Title Case.
--   * learners_profiles UPDATE triggers on a gender-only write: all column-scoped ones
--     skip; trigger_detect_fee_dimension_change derives its changed-field from 5 FK
--     columns only (gender is not one) and returns early; validate_learner_semester_year_scope
--     guards every branch with IS DISTINCT FROM OLD, so all are skipped.
--     set_learner_application_id back-fills 3 rows that have no application_id -- they
--     would get one on their next edit regardless.
--   * trg_sync_learner_gender_to_profile (20260820140000) compares case-insensitively,
--     so re-casing does NOT mass-fire the auth-server webhook.
--
-- Out of scope, deliberately: the other 19 gender columns keep their own domains and
-- constraints -- admission_leads (male/female/other), admission_packages (MALE/FEMALE),
-- staff (male/female/bigender), hr_leave_types (all/male/female),
-- hostel_curfew_policies + mess + tournament (boys/girls/both).
-- ---------------------------------------------------------------------------

-- 1. One canonical resolver. Returns NULL for anything unrecognised so the CHECK
--    constraints below reject garbage loudly instead of silently coercing it.
CREATE OR REPLACE FUNCTION public.normalize_gender(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
AS $function$
  SELECT CASE lower(btrim(COALESCE(p_value, '')))
           WHEN 'male'    THEN 'Male'
           WHEN 'm'       THEN 'Male'
           WHEN 'female'  THEN 'Female'
           WHEN 'f'       THEN 'Female'
           WHEN 'other'   THEN 'Other'
           WHEN 'others'  THEN 'Other'
           WHEN 'o'       THEN 'Other'
           ELSE NULL
         END;
$function$;

COMMENT ON FUNCTION public.normalize_gender(text) IS
  'Canonical learner/profile gender: Male | Female | Other, or NULL when unrecognised. '
  'Applies to learners_profiles.gender and profiles.gender only -- staff, admission_leads, '
  'mess and hostel-block gender columns have their own domains.';

-- 2. Normalise the stored data.
--    learners_profiles.gender is NOT NULL and uses '' as its established "not captured"
--    sentinel (functions already read it via NULLIF(btrim(gender),'')). The 60 blank rows
--    are left blank -- gender is not something to invent for a real person.
UPDATE learners_profiles
   SET gender = public.normalize_gender(gender)
 WHERE public.normalize_gender(gender) IS NOT NULL
   AND public.normalize_gender(gender) <> gender;

UPDATE profiles
   SET gender = public.normalize_gender(gender)
 WHERE public.normalize_gender(gender) IS NOT NULL
   AND public.normalize_gender(gender) <> gender;

-- 3. Normalise on the way in, so no future writer can reintroduce a variant.
--    Unrecognised input is passed through unchanged and then rejected by the CHECK.
CREATE OR REPLACE FUNCTION public.tg_normalize_learner_gender()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- '' stays '' (the NOT NULL sentinel); a recognised value becomes canonical.
  NEW.gender := COALESCE(public.normalize_gender(NEW.gender), NEW.gender);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_normalize_gender_learners_profiles ON public.learners_profiles;
CREATE TRIGGER trg_normalize_gender_learners_profiles
BEFORE INSERT OR UPDATE OF gender ON public.learners_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_learner_gender();

CREATE OR REPLACE FUNCTION public.tg_normalize_profile_gender()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- profiles.gender is nullable, so blank collapses to NULL rather than ''.
  NEW.gender := COALESCE(public.normalize_gender(NEW.gender), NULLIF(btrim(NEW.gender), ''));
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_normalize_gender_profiles ON public.profiles;
CREATE TRIGGER trg_normalize_gender_profiles
BEFORE INSERT OR UPDATE OF gender ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_profile_gender();

-- 4. Lock the domain. These are backstops: the BEFORE triggers above should mean they
--    never fire, but an unrecognised value now fails loudly instead of silently landing.
ALTER TABLE public.learners_profiles
  DROP CONSTRAINT IF EXISTS learners_profiles_gender_check;
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT learners_profiles_gender_check
  CHECK (gender IN ('Male', 'Female', 'Other', ''));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other'));
