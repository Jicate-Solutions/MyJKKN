-- =====================================================================
-- AI Routine Scheduler — initial seed (each routine's schedule at cutover)
-- Migration: 2026-07-01. ON CONFLICT DO NOTHING: this seeds a routine's
-- schedule ONCE; re-running never overwrites a schedule a super_admin has
-- since edited. Values = each cron's prior time converted UTC->IST, snapped
-- to 15-min marks (behavior-preserving at cutover).
-- =====================================================================
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('ai-pulse-tick', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 420) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('ai-pulse-weekly-digest', true, true, ARRAY[2]::smallint[], 585) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('ai-pulse-rotation-tick', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 480) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('ai-pulse-anomaly-scan', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 555) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('ai-pulse-pde-bridge', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 630) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('feedback-adapter-session', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 405) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('feedback-adapter-mess', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 405) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('feedback-adapter-parent', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 420) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('feedback-adapter-ig-dm', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 435) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('feedback-adapter-ig-comments', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 435) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('mess-menu-loop', true, true, ARRAY[1]::smallint[], 480) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('induction-generate-playbook', true, true, ARRAY[1]::smallint[], 600) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('scf-generate-suggestions', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 675) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('scf-learner-notes', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 705) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('scf-measure-outcomes', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 495) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('session-feedback-escalation', true, true, ARRAY[1]::smallint[], 780) ON CONFLICT (routine_id) DO NOTHING;
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day) VALUES ('session-feedback-nudge', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 765) ON CONFLICT (routine_id) DO NOTHING;