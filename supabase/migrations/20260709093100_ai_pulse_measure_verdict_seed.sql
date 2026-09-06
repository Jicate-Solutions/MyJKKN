-- ============================================================================
-- Updated: 2026-07-09 - Seed the AI Pulse Measure+Verdict dials and register the
--                       routine with the ai-routine-dispatcher.
--
-- CONFIG MANDATE: zero hardcoded knobs. Every threshold used by
-- fn_ai_pulse_measure_cycle_outcomes() is a row here, tunable from
-- /ai-pulse/admin/policies without a deploy.
--
-- Targets are INT PERCENTAGES (70 = 70%), matching the existing house convention
-- (quiz_pass_threshold_live = 40). data_type='float' is allowed by the CHECK but
-- has never been used by any row, so its Policies-editor render path is untested.
--
-- NOTE: AI Pulse crons are NOT in vercel.json. All AI Pulse routines are fired by
-- /api/cron/ai-routine-dispatcher from ai_routine_schedules. minute_of_day is in
-- IST minutes and must be a multiple of 15 (the dispatcher floors to the slot).
-- Existing AI Pulse slots: 420 (07:00 tick), 480 (08:00 rotation),
-- 555 (09:15 anomaly), 585 (09:45 Tue digest), 630 (10:30 pde-bridge).
-- 615 (10:15) is free and lands before the Tuesday digest reads the verdict.
-- ============================================================================

INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, min_value, max_value, is_active)
VALUES
  ('engaged_attendance_target_pct', 'Engaged-attendance target (%)',
   'A cycle is goal_met only if its engaged-attendance rate reaches this. This is the programme''s own phase-2 gate.',
   '70'::jsonb, 'int', 0, 100, true),

  ('agency_yield_target_pct', 'Agency yield target (%)',
   'Artifacts produced (domain-sync + publications) per engaged learner, as a percentage. 10 = one artifact per ten engaged learners. This is the headline production measure -- attendance alone never earns goal_met.',
   '10'::jsonb, 'int', 0, 100, true),

  ('measure_min_age_days', 'Measure maturation (days)',
   'Days a cycle must age before it is graded. Must exceed the async quiz make-up window (48h) so late passes are counted.',
   '3'::jsonb, 'int', 1, 30, true),

  ('measure_min_attendance', 'Measure minimum attendance',
   'Minimum attendance for a unit to get a reliable engaged rate. Below this the row is insufficient_data, never a fabricated rate.',
   '5'::jsonb, 'int', 1, 1000, true),

  ('measure_baseline_window', 'Baseline rolling window (cycles)',
   'How many prior cycles average into a unit''s baseline. Baseline is the AVG OF PRIOR PER-CYCLE RATIOS -- never sum/sum.',
   '3'::jsonb, 'int', 1, 26, true),

  ('measure_min_rtm_pairs', 'Minimum untreated pairs for RTM',
   'Minimum untreated department pairs before a regression-to-the-mean slope is trusted. Below this, net_effect stays NULL and measure_status is insufficient_rtm_data.',
   '5'::jsonb, 'int', 2, 100, true),

  ('loop_noise_band_pct', 'Loop noise band (%)',
   'A |net_effect| at or below this counts as no measurable gain. The weekly digest uses it to tell an HOD their last intervention did nothing, so change approach.',
   '5'::jsonb, 'int', 0, 100, true)
ON CONFLICT (config_key) DO NOTHING;


-- Register the routine with the dispatcher. Daily at 10:15 IST, idempotent, so
-- a cycle is graded as soon as it matures and re-graded rows never move once
-- they reach 'measured'.
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('ai-pulse-measure-verdict', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 615)
ON CONFLICT (routine_id) DO NOTHING;
