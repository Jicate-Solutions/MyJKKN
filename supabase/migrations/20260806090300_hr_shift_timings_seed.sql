-- =====================================================================
-- hr_shift_timings — group default seed
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- 14 institutions x {teaching, non_teaching} x 7 days = 196 rows.
--   Mon-Sat  working, 09:00-13:00 / 12:30-16:30, grace 5 min
--   Sat      additionally second_saturday_holiday = true
--   Sun      non-working, all times NULL
--
-- Idempotent: NOT EXISTS on the live-row key, so re-running is safe.
--
-- NOTE FOR HR REVIEW: two institutions currently declare different hours in
-- platform_policies key 'hr.working_schedule' (unread by any code, so nothing
-- is overwritten here):
--   * JKKN College of Engineering and Technology — teaching 08:30-16:30
--   * JKKN Dental College and Hospital            — teaching 09:00-17:00
-- Those two should confirm 09:00/12:30/16:30 is intended for them.
-- =====================================================================

INSERT INTO public.hr_shift_timings (
  institution_id, staff_scope, employment_category_id, day_of_week,
  is_working_day, first_half_start, first_half_end, second_half_start, second_half_end,
  grace_minutes, second_saturday_holiday, effective_from, notes
)
SELECT
  i.id,
  sc.scope,
  NULL,
  d.dow::smallint,
  d.dow <= 6,
  CASE WHEN d.dow <= 6 THEN TIME '09:00' END,
  CASE WHEN d.dow <= 6 THEN TIME '13:00' END,
  CASE WHEN d.dow <= 6 THEN TIME '12:30' END,
  CASE WHEN d.dow <= 6 THEN TIME '16:30' END,
  CASE WHEN d.dow <= 6 THEN 5 ELSE 0 END,
  d.dow = 6,
  CURRENT_DATE,
  'Seeded group default 2026-08-06. Adjust per institution as needed.'
FROM public.institutions i
CROSS JOIN (VALUES ('teaching'), ('non_teaching')) AS sc(scope)
CROSS JOIN generate_series(1, 7) AS d(dow)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_shift_timings t
   WHERE t.institution_id = i.id
     AND t.staff_scope = sc.scope
     AND t.employment_category_id IS NULL
     AND t.day_of_week = d.dow::smallint
     AND t.effective_until IS NULL
     AND t.is_active
);
