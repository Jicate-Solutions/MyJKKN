-- Adoption loop — register the office side of the interview booking link (#3997, merged
-- 2026-09-24 08:23 IST) so its one office action can be measured.
--
-- The link has two sides. The candidate side is public (no sign-in), so fn_feature_used,
-- which keys on auth.uid(), cannot see it: it stays unmeasured by design. The office side
-- has one core action: when the link found no free time, it took the person's name, post
-- and phone (Director decision #14, 22 Sep), and the office rings them back and marks the
-- request done. That is markCallbackRequestCalled, which this PR wires directly (recorded
-- server-side after the update succeeds), so its share means "did it".
--
-- Traced in jicate/main, not from the PR title:
--   gate   hr_interview_callback_requests RLS mirrors hr_recruitment_jobs;
--          the action names a refusal with user_has_permission('hr.recruitment.edit').
--   roles  hr.recruitment.edit is held by principal (12 people), ceo (2),
--          managing_director (2), hr_head (1), vice_principal (1), recuritment (1), coo (1).
--          The PEOPLE WHO RING are the recruitment office, so intended_roles is the two
--          office roles only. Leaders who merely hold the key are not expected to ring
--          candidates, and counting them would make the feature read dead for the wrong
--          reason. (Role key 'recuritment' is spelled as it is stored in custom_roles.)
--   cadence 'event' — there is only work when the link could not book someone; production
--          held 0 call-back requests at 14:30 IST on 2026-09-24.
--   usage_wired false — flipped only after a real (non-test, non-super-admin) use.
--
-- NOT registered: marking an interview no-show. Decision #12 routes every interview to the
-- Director's own calendar, so exactly one person does it — not an adoption question.
--
-- GUARD: the insert may add at most one row, only this key; the end state must hold the
-- label exactly as written. Re-running is safe: ON CONFLICT DO NOTHING adds 0 and the
-- end-state check still passes.

DO $$
DECLARE
  v_added int;
BEGIN
  INSERT INTO public.feature_registry (
    feature_key, title, module, intended_roles, core_action,
    shipped_at, source_pr, usage_wired, status, cadence
  )
  VALUES (
    'hr.interview_callback_handle',
    'Ring back a candidate the interview link could not book',
    'hr',
    ARRAY['hr_head', 'recuritment']::text[],
    'ring back a candidate the interview booking link could not book, and mark it done',
    '2026-09-24T08:23:56+05:30'::timestamptz,
    3997,
    false,
    'live',
    'event'
  )
  ON CONFLICT (feature_key) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  IF v_added > 1 THEN
    RAISE EXCEPTION 'adoption guard: insert added % rows, expected at most 1', v_added;
  END IF;

  IF (SELECT count(*) FROM public.feature_registry
       WHERE feature_key = 'hr.interview_callback_handle'
         AND intended_roles = ARRAY['hr_head', 'recuritment']::text[]
         AND cadence = 'event'
         AND status = 'live') <> 1 THEN
    RAISE EXCEPTION 'adoption guard: hr.interview_callback_handle is not registered as written';
  END IF;

  RAISE NOTICE 'adoption: % registry row(s) added', v_added;
END $$;
