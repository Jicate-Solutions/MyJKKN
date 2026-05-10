-- Migration: v_learner_hostelites fallback chain — admission_year → batch → enquiry
-- Purpose:   PR #822's view computed year_of_study only from admission_year_id,
--            which is populated for just 154 of 788 hostelites (20%). Director's
--            data investigation (2026-05-10) confirmed that batch.start_date covers
--            276 more hostelites and enquiry_date covers the remaining 358, giving
--            100% coverage when chained.
--
-- Fallback chain:
--   1. admission_year_id → admission_years.program_start_year / program_end_year
--      (clamped to 1..duration, same formula as PR #822)
--   2. batch_id → batches.start_date / end_date
--      (clamped to 1..batch duration in years)
--   3. enquiry_date on learners_profiles itself
--      (unclamped — best-effort for orphan rows; NULL when enquiry_date NULL)
--
-- New column:  year_source TEXT — 'admission_year' | 'batch' | 'enquiry' | NULL
--              Lets callers see which path was used (useful for data quality dashboards).
--
-- Risk:        TIER-1 additive view replacement. Reversible.
-- Rollback:    Paste prior DDL below into a new migration to restore PR #822 version.
-- RLS:         Inherits from base tables (learners_profiles, admission_years, batches,
--              hostel_allocations). No new policies required.
-- PR:          feat(campus-living/residents): year_of_study fallback chain — admission_year → batch → enquiry

-- ─── Prior DDL (PR #822) — kept here for instant rollback reference ────────────
-- CREATE OR REPLACE VIEW public.v_learner_hostelites AS
-- SELECT
--   lp.id, lp.first_name, lp.last_name, lp.roll_number,
--   lp.student_email, lp.college_email, lp.gender, lp.institution_id,
--   lp.accommodation_type, lp.hostel_type, lp.hostel_fee, lp.dayscholar_fee,
--   lp.father_name, lp.mother_name, lp.admission_year_id,
--   ay.program_start_year, ay.program_end_year,
--   GREATEST(1, LEAST(
--     EXTRACT(YEAR FROM CURRENT_DATE)::int - COALESCE(ay.program_start_year, 0) + 1,
--     COALESCE(ay.program_end_year, 9999) - COALESCE(ay.program_start_year, 0) + 1
--   )) AS year_of_study,
--   ha.block_id AS current_block_id, ha.room_id AS current_room_id,
--   ha.bed_id AS current_bed_id, ha.id AS current_allocation_id
-- FROM public.learners_profiles lp
-- LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
-- LEFT JOIN public.hostel_allocations ha
--   ON ha.learner_id = lp.id AND ha.status = 'active'
-- WHERE lp.accommodation_type = 'HOSTEL';
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_learner_hostelites AS
SELECT
  lp.id,
  lp.first_name,
  lp.last_name,
  lp.roll_number,
  lp.student_email,
  lp.college_email,
  lp.gender,
  lp.institution_id,
  lp.accommodation_type,
  lp.hostel_type,
  lp.hostel_fee,
  lp.dayscholar_fee,
  lp.father_name,
  lp.mother_name,
  lp.admission_year_id,
  ay.program_start_year,
  ay.program_end_year,

  -- ─── year_of_study: COALESCE through 3 date sources ─────────────────────
  CASE
    -- Path 1: admission_year_id present → use program_start_year / program_end_year
    WHEN lp.admission_year_id IS NOT NULL
         AND ay.program_start_year IS NOT NULL
    THEN GREATEST(1, LEAST(
           EXTRACT(YEAR FROM CURRENT_DATE)::int - ay.program_start_year + 1,
           ay.program_end_year - ay.program_start_year + 1
         ))::int

    -- Path 2: batch_id present → use batches.start_date / end_date
    WHEN lp.batch_id IS NOT NULL
         AND b.start_date IS NOT NULL
    THEN GREATEST(1, LEAST(
           EXTRACT(YEAR FROM CURRENT_DATE)::int
             - EXTRACT(YEAR FROM b.start_date)::int + 1,
           EXTRACT(YEAR FROM b.end_date)::int
             - EXTRACT(YEAR FROM b.start_date)::int + 1
         ))::int

    -- Path 3: enquiry_date present → best-effort (unclamped, may be < 1 for fresh enquiries)
    WHEN lp.enquiry_date IS NOT NULL
    THEN GREATEST(1,
           EXTRACT(YEAR FROM CURRENT_DATE)::int
             - EXTRACT(YEAR FROM lp.enquiry_date)::int + 1
         )::int

    ELSE NULL
  END AS year_of_study,

  -- ─── year_source: which path produced year_of_study ─────────────────────
  CASE
    WHEN lp.admission_year_id IS NOT NULL
         AND ay.program_start_year IS NOT NULL
    THEN 'admission_year'::text

    WHEN lp.batch_id IS NOT NULL
         AND b.start_date IS NOT NULL
    THEN 'batch'::text

    WHEN lp.enquiry_date IS NOT NULL
    THEN 'enquiry'::text

    ELSE NULL
  END AS year_source,

  -- ─── current hostel allocation FKs (unchanged from PR #822) ─────────────
  ha.block_id  AS current_block_id,
  ha.room_id   AS current_room_id,
  ha.bed_id    AS current_bed_id,
  ha.id        AS current_allocation_id

FROM public.learners_profiles lp
LEFT JOIN public.admission_years ay
  ON ay.id = lp.admission_year_id
LEFT JOIN public.batches b
  ON b.id = lp.batch_id
LEFT JOIN public.hostel_allocations ha
  ON ha.learner_id = lp.id
 AND ha.status = 'active'
WHERE lp.accommodation_type = 'HOSTEL';

COMMENT ON VIEW public.v_learner_hostelites IS
  'Read-only view for /campus-living/residents Learners tab. Computes year_of_study '
  'via a 3-step fallback chain: (1) admission_years.program_start_year when '
  'admission_year_id is set; (2) batches.start_date when batch_id is set; '
  '(3) learners_profiles.enquiry_date as last resort. year_source column identifies '
  'which path was used. Covers all 788 hostelites (vs 154 with PR #822 view). '
  'Also exposes current_block_id/room_id/bed_id from hostel_allocations status=active. '
  'PR: feat(campus-living/residents): year_of_study fallback chain — admission_year → batch → enquiry.';
