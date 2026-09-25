-- Adoption loop — register the six changes skipped ON PURPOSE, each with its reason, so
-- /admin/adoption lists them under "Skipped on purpose" instead of leaving them invisible.
-- Skipped = never measured, never judged dead, never asked why (#3912).
--
-- The list is the W12 desk's walk-queue line of 2026-09-18 06:39 IST, which the Director
-- answered at 15:26 IST that day ("the 6 skipped PRs stay unlabelled", ruling R-A3).
-- Relayed verbatim by the W12 desk on 2026-09-24; not rebuilt from memory.
--
-- One reason re-checked before registering: #3836 (record from the meeting) was skipped
-- because recording is limited to an allow-list until rollout. #3973 (live 24 Sep) removed
-- the "meeting has ended" condition from the Record button, NOT the allow-list: the button
-- is still gated by fn_may_record_meetings(), which reads meeting_recorder_allowlist, and
-- that list held 1 person at 14:30 IST on 2026-09-24. The reason stands.
--
-- intended_roles is empty for all six: none has a set of people who are meant to do it.
-- usage_wired stays false and cadence stays at its default — a skipped row is not judged.
--
-- GUARD: adds at most six rows, only these keys; the end state must be all six present
-- AND skipped. ON CONFLICT DO NOTHING never overwrites a key someone else registered — the
-- end-state check then refuses rather than silently leaving that row un-skipped.
-- Re-running is safe: 0 rows added, the end-state check still passes.

DO $$
DECLARE
  v_added int;
BEGIN
  INSERT INTO public.feature_registry (
    feature_key, title, module, intended_roles, core_action,
    shipped_at, source_pr, usage_wired, status, skip_reason
  )
  VALUES
    ('ai_pulse.no_quiz_warning',
     'Warning when a quiz cycle is near and no quiz is written',
     'ai-pulse', '{}'::text[],
     'none: a scheduled job sends the warning',
     '2026-09-17T20:53:30Z'::timestamptz, 3880, false, 'live',
     'Runs on a schedule, not by a person. Nobody "uses" it.'),
    ('meetings.recording_retention',
     'Delete meeting recordings after 90 days',
     'meetings', '{}'::text[],
     'none: a scheduled job deletes the old recordings',
     '2026-09-17T19:31:07Z'::timestamptz, 3843, false, 'live',
     'Runs on a schedule, not by a person. Nobody "uses" it.'),
    ('meetings.request_host_hour',
     'Ask for an hour of the host''s day on the public booking form',
     'meetings', '{}'::text[],
     'ask for a time on the public booking form',
     '2026-09-17T14:50:02Z'::timestamptz, 3838, false, 'live',
     'Public booking form: the people who use it are not signed in, so it cannot be counted by role.'),
    ('meetings.record_from_meeting',
     'Record a meeting from the meeting''s own page',
     'meetings', '{}'::text[],
     'start a recording from the meeting page',
     '2026-09-17T10:53:36Z'::timestamptz, 3836, false, 'live',
     'Recording is limited to an allow-list of one person until it is rolled out. Measure it after rollout.'),
    ('whats_new.built_by_filter',
     'Tap a name under Built by to see only that person''s changes',
     'whats-new', '{}'::text[],
     'tap a name under Built by',
     '2026-09-17T08:55:15Z'::timestamptz, 3831, false, 'live',
     'A small tap inside the What''s New page, not a feature of its own.'),
    ('whats_new.worth_knowing_fold',
     'Worth knowing starts folded shut on What''s New',
     'whats-new', '{}'::text[],
     'open the folded Worth knowing section',
     '2026-09-17T08:55:43Z'::timestamptz, 3830, false, 'live',
     'A small tap inside the What''s New page, not a feature of its own.')
  ON CONFLICT (feature_key) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  IF v_added > 6 THEN
    RAISE EXCEPTION 'adoption guard: insert added % rows, expected at most 6', v_added;
  END IF;

  IF (SELECT count(*) FROM public.feature_registry
       WHERE feature_key IN ('ai_pulse.no_quiz_warning', 'meetings.recording_retention',
                             'meetings.request_host_hour', 'meetings.record_from_meeting',
                             'whats_new.built_by_filter', 'whats_new.worth_knowing_fold')
         AND skip_reason IS NOT NULL
         AND NOT usage_wired) <> 6 THEN
    RAISE EXCEPTION 'adoption guard: expected all six registered as skipped on purpose';
  END IF;

  RAISE NOTICE 'adoption: % skipped-on-purpose row(s) added', v_added;
END $$;
