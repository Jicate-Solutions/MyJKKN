-- Widen learners_profiles.blood_group to the A1/A2 subgroup set used by the learner forms.
-- Keeps legacy 'A1B' so existing rows stay valid.
ALTER TABLE public.learners_profiles DROP CONSTRAINT IF EXISTS learners_profiles_blood_group_check;
ALTER TABLE public.learners_profiles ADD CONSTRAINT learners_profiles_blood_group_check
  CHECK (blood_group = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text, 'A1+'::text, 'A1-'::text, 'A1B+'::text, 'A1B-'::text, 'A2+'::text, 'A2-'::text, 'A2B+'::text, 'A2B-'::text, 'A1B'::text]));
