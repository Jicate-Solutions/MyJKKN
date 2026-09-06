-- Reset room (hostel) and mess categories for MALE learners only, ahead of a
-- fresh male hostel allocation round. Female learners are untouched.
--
-- Gender is NOT normalized in learners_profiles ('MALE' / 'male' / 'Male'),
-- so every predicate below uses upper(trim(gender)). A plain
-- `gender = 'MALE'` misses 7 rows.
--
-- Verified before applying: the 166 affected learners have 0 rows in
-- hostel_allocations and 0 in hostel_waitlist, so no allocation state is
-- stranded by this reset.

-- 1. Point-in-time backup of every male row that currently carries a category.
CREATE TABLE IF NOT EXISTS public.bak_learner_hostel_categories_male_20260806 AS
SELECT
    lp.id                          AS learner_profile_id,
    lp.gender                      AS gender,
    lp.lifecycle_status::text      AS lifecycle_status,
    lp.institution_id,
    lp.accommodation_type_id,
    lp.hostel_category_id,
    lp.mess_category_id,
    lp.pending_hostel_category_id,
    now()                          AS backed_up_at
FROM public.learners_profiles lp
WHERE upper(trim(lp.gender)) = 'MALE'
  AND (lp.hostel_category_id IS NOT NULL OR lp.mess_category_id IS NOT NULL);

-- Backup table holds restore data only; no application role needs to read it.
REVOKE ALL ON public.bak_learner_hostel_categories_male_20260806 FROM anon, authenticated;

-- 2. Clear the two category columns for male learners.
--    trg_detect_fee_dimension_change fires on this UPDATE but exits early:
--    neither column appears in its v_changed_field CASE (which watches only
--    program_id, quota_id, community_category_id, accommodation_type_id,
--    admission_year_id), so no admission_fee_change_events rows are produced.
UPDATE public.learners_profiles
   SET hostel_category_id = NULL,
       mess_category_id   = NULL
 WHERE upper(trim(gender)) = 'MALE'
   AND (hostel_category_id IS NOT NULL OR mess_category_id IS NOT NULL);

-- Applied 2026-08-06: 166 rows backed up, 166 rows reset.
--
-- Rollback (if the new allocation round is abandoned):
--   UPDATE public.learners_profiles lp
--      SET hostel_category_id = b.hostel_category_id,
--          mess_category_id   = b.mess_category_id
--     FROM public.bak_learner_hostel_categories_male_20260806 b
--    WHERE lp.id = b.learner_profile_id;
