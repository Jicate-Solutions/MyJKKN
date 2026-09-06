-- Learner gender: sync learners_profiles.gender -> profiles.gender (+ backfill)
-- ---------------------------------------------------------------------------
-- Admission captures gender correctly: learners_profiles.gender has 0 NULLs in
-- 7,270 rows, and the enquiry form hard-requires it
-- (enquiry-form.tsx: z.enum([...], { required_error: 'Gender is required' })).
-- It simply never reaches profiles.gender, which was NULL for 940 of 6,331
-- learner-linked profiles (14.8%) -- 37.5% of the whole AY2026 intake, and 100%
-- of every learner in the reserved / account / admitted / enquiry statuses.
--
-- Gender passes three hand-offs and is dropped at all three:
--   1. handle_new_user (auth.users)        inserts profiles with 7 columns, no gender
--   2. auto_link_profile_to_approved_learner (BEFORE INSERT ON profiles) back-fills
--      learner_id / institution_id / department_id / role / full_name -- it has the
--      learner row in hand and does not copy gender
--   3. sync_learner_email_to_profile       syncs email / role / institution / department
-- Staff have no such hole: sync_staff_to_profiles writes `gender = NEW.gender` on
-- both its INSERT and UPDATE branches. Learners never got the equivalent.
--
-- Rather than rewrite those three (large, load-bearing) functions, this adds two
-- narrow AFTER triggers that close the hole wherever the link is made:
--   A. profiles gains a learner_id  -> pull gender from the learner
--   B. a learner's gender is edited -> push it to the linked profile
-- and then backfills the existing rows.
--
-- SIDE EFFECT, intentional: trigger_sync_user_update_webhook fires on any gender
-- change and POSTs to https://auth.jkkn.ai/api/auth/sync-user. The backfill
-- therefore queues ~940 webhooks. That is desirable -- the auth server holds the
-- same NULLs and gender is in its payload -- and it is safe: net.http_post is
-- async via pg_net, and the webhook fn swallows its own errors into webhook_logs.
--
-- Case is deliberately NOT normalised. profiles.gender is mixed
-- (FEMALE 2734 / MALE 2554 / male 52 / female 50 / Male 1); uppercase matches both
-- the dominant convention and the learners_profiles source, and every consumer
-- already does lower(trim(...)). Rewriting 5,341 working rows would be churn.
-- ---------------------------------------------------------------------------

-- A. profiles gains a learner link -> pull the learner's gender.
--    Only fills a NULL; never overwrites a gender already on the profile.
CREATE OR REPLACE FUNCTION public.sync_profile_gender_from_learner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gender text;
BEGIN
  SELECT NULLIF(btrim(lp.gender), '') INTO v_gender
    FROM learners_profiles lp
   WHERE lp.id = NEW.learner_id;

  IF v_gender IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sets gender only; the trigger below is AFTER UPDATE **OF learner_id**, so this
  -- write cannot re-enter it. The WHEN clause (NEW.gender IS NULL) is a second guard.
  UPDATE profiles
     SET gender = v_gender
   WHERE id = NEW.id
     AND gender IS NULL;

  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_sync_profile_gender_from_learner ON public.profiles;
CREATE TRIGGER trg_sync_profile_gender_from_learner
AFTER INSERT OR UPDATE OF learner_id ON public.profiles
FOR EACH ROW
WHEN (NEW.learner_id IS NOT NULL AND NEW.gender IS NULL)
EXECUTE FUNCTION public.sync_profile_gender_from_learner();

-- B. the learner's gender is edited -> push it to the linked profile.
--    learners_profiles is the source of truth (same contract as sync_staff_to_profiles).
--    Compared case-insensitively so a pure case difference is not treated as a
--    change -- that would fire the auth-server webhook for nothing.
CREATE OR REPLACE FUNCTION public.sync_learner_gender_to_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gender text := NULLIF(btrim(NEW.gender), '');
BEGIN
  IF v_gender IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE profiles p
     SET gender = v_gender
   WHERE p.learner_id = NEW.id
     AND lower(btrim(COALESCE(p.gender, ''))) IS DISTINCT FROM lower(v_gender);

  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_sync_learner_gender_to_profile ON public.learners_profiles;
CREATE TRIGGER trg_sync_learner_gender_to_profile
AFTER INSERT OR UPDATE OF gender ON public.learners_profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_learner_gender_to_profile();

-- C. Backfill every learner-linked profile still missing a gender.
--    Blank-string learner genders (61 rows) are treated as missing and skipped.
UPDATE profiles p
   SET gender = NULLIF(btrim(lp.gender), '')
  FROM learners_profiles lp
 WHERE lp.id = p.learner_id
   AND p.gender IS NULL
   AND NULLIF(btrim(lp.gender), '') IS NOT NULL;
