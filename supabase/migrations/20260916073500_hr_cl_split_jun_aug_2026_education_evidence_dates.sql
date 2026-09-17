-- ============================================================================
-- Populate evidence_dates (per-day) for the 5 overridden JKKN College of
-- Education CL entries written by 20260916070100.
-- Created: 2026-09-16.
--
-- One day of CL per calendar date, so a 2-day month cites TWO distinct dates,
-- not one date carrying two days:
--
--   Rajendiran K M, July (2 days): 17 Jul + 20 Jul (earliest 2 of his 3
--     unconverted July LOP days: 17, 20, 21).
--   Monisha A, July (2 days): 3 Jul + 4 Jul (earliest 2 of her 11 unconverted
--     July LOP days).
--   Monisha A, August (2 days): 4 Aug + 5 Aug -- 4 Aug is her real, already-
--     approved application (previously discarded from display once the month
--     was overridden); 5 Aug is the earliest of her 3 unconverted August LOP
--     days. This is a genuine correction, not just reformatting: the real
--     date is restored to view instead of being replaced by a placeholder.
--
-- Rajendiran's August (1 day) and Sambooranam's August (1 day) keep NO
-- evidence_dates -- neither has any biometric LOP trace in August, unchanged
-- from 20260916070100. Monisha's June (2.5 days) keeps no evidence_dates for
-- the same reason -- zero attendance rows exist for June at this institution.
-- ============================================================================

UPDATE public.hr_leave_month_entries
   SET evidence_dates = ARRAY[DATE '2026-07-17', DATE '2026-07-20']
 WHERE employee_id = '30e752c9-f0a2-4813-a74a-be4f70d93609'  -- Rajendiran K M
   AND leave_type_id = '913b2e58-83cf-4eae-8b26-8afa920bf373'
   AND month_start = DATE '2026-07-01';

UPDATE public.hr_leave_month_entries
   SET evidence_dates = ARRAY[DATE '2026-07-03', DATE '2026-07-04']
 WHERE employee_id = 'd1160fe2-e7ab-4312-80d0-1d29cf688acf'  -- Monisha A
   AND leave_type_id = '913b2e58-83cf-4eae-8b26-8afa920bf373'
   AND month_start = DATE '2026-07-01';

UPDATE public.hr_leave_month_entries
   SET evidence_dates = ARRAY[DATE '2026-08-04', DATE '2026-08-05']
 WHERE employee_id = 'd1160fe2-e7ab-4312-80d0-1d29cf688acf'  -- Monisha A
   AND leave_type_id = '913b2e58-83cf-4eae-8b26-8afa920bf373'
   AND month_start = DATE '2026-08-01';
