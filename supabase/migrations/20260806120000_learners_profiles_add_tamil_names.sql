-- File: supabase/migrations/20260806120000_learners_profiles_add_tamil_names.sql
-- Tamil-script rendering of the learner's name, stored alongside the existing
-- English first_name / last_name. Needed wherever the learner's name must be
-- printed in Tamil (certificates, TC / bonafide letters, university returns)
-- rather than transliterated at render time.
--
-- Nullable by design: no existing row has a Tamil name and they are back-filled
-- over time. A NOT NULL DEFAULT '' would only disguise "not captured yet" as a
-- captured-but-blank value, and nothing in the app requires these fields.
--
-- text, not varchar(n): Postgres stores text as UTF-8, so Tamil code points
-- (U+0B80–U+0BFF) and their combining vowel signs need no special column type,
-- collation or encoding — Supabase databases are UTF8 by default. A varchar(n)
-- cap counts code points rather than rendered glyphs, so it would truncate
-- mid-cluster on Tamil; text sidesteps the question entirely.
BEGIN;

ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS first_name_tamil text,
  ADD COLUMN IF NOT EXISTS last_name_tamil  text;

COMMENT ON COLUMN public.learners_profiles.first_name_tamil IS
  'Learner first name in Tamil script (UTF-8, nullable). Captured on /learners/profiles create + edit.';
COMMENT ON COLUMN public.learners_profiles.last_name_tamil IS
  'Learner last name in Tamil script (UTF-8, nullable). Captured on /learners/profiles create + edit.';

COMMIT;
