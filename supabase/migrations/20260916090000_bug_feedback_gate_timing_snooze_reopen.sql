-- =====================================================================
-- Blocking feedback gate — Migration A: timing, snooze, auto-send, reopen
-- Date: 2026-09-16
-- Spec: specs/2026-09-16-blocking-feedback-gate.md (Director rulings 1-8)
--
-- The "is this fixed for you?" prompt (bug_fix_feedback_requests) becomes a
-- BLOCKING item on the mandatory-notice screen (see Migration C,
-- get_blocking_items). This file gives the row what that needs:
--
--   ruling 3  ask_after  = fix live + 3 days · remind_at = +14 d · expires +60 d
--   ruling 2  snooze_count / snoozed_until — "Ask me later" up to 3 times
--   ruling 4  fn_bug_feedback_prepare inserts rows as 'sent' (no admin tick);
--             'pending_send' is only used by the July 3-open-prompt cap (E4),
--             and queued rows are released automatically as answers land
--   ruling 5  fn_bug_feedback_answer('not_fixed') reopens the bug AND the
--             group's canonical bug, writes a system message, notifies the
--             fixer of record (assigned_to_user_id, else the admin who
--             confirmed the group)
--   ruling 8  a reporter who is gone/disabled → status 'dropped', the
--             outcome ledger counts it as no_reporter (no signal)
--
-- Every function below keeps its July/September behaviour except where a
-- CHANGED 2026-09-16 comment says otherwise. Bodies were taken from the
-- LIVE definitions (pg_get_functiondef, 2026-09-16 08:59 IST), not from
-- older migration files.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) bug_fix_feedback_requests — timing + snooze + dropped
-- ---------------------------------------------------------------------
ALTER TABLE public.bug_fix_feedback_requests
  ADD COLUMN IF NOT EXISTS fix_live_at    timestamptz,
  ADD COLUMN IF NOT EXISTS ask_after      timestamptz,
  ADD COLUMN IF NOT EXISTS remind_at      timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_at    timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snoozed_until  timestamptz,
  ADD COLUMN IF NOT EXISTS dropped_reason text;

COMMENT ON COLUMN public.bug_fix_feedback_requests.ask_after IS
  'Ruling 3 (2026-09-16): the blocking screen asks from fix live + 3 days.';
COMMENT ON COLUMN public.bug_fix_feedback_requests.remind_at IS
  'Ruling 3: one push reminder at fix live + 14 days if still unanswered (reminded_at stamps it).';
COMMENT ON COLUMN public.bug_fix_feedback_requests.snooze_count IS
  'Ruling 2: "Ask me later" presses, max 3; after that the screen stays until answered.';
COMMENT ON COLUMN public.bug_fix_feedback_requests.dropped_reason IS
  'Ruling 8: why a row was dropped quietly (no_reporter = profile missing/disabled).';

-- Status vocabulary gains 'dropped' (ruling 8).
ALTER TABLE public.bug_fix_feedback_requests
  DROP CONSTRAINT IF EXISTS bug_fix_feedback_requests_status_check;
ALTER TABLE public.bug_fix_feedback_requests
  ADD CONSTRAINT bug_fix_feedback_requests_status_check
  CHECK (status IN ('pending_send','sent','delivered','answered','expired','dropped'));

ALTER TABLE public.bug_fix_feedback_requests
  DROP CONSTRAINT IF EXISTS bug_fix_feedback_requests_snooze_count_check;
ALTER TABLE public.bug_fix_feedback_requests
  ADD CONSTRAINT bug_fix_feedback_requests_snooze_count_check
  CHECK (snooze_count >= 0 AND snooze_count <= 3);

-- RECONCILED 2026-09-18 with 20261223000000 (the "is this still happening?"
-- prompt, kind = 'still_open', live since 17 Sep): that kind is created by
-- fn_bug_stale_prompt_prepare WITHOUT an explicit expires_at and lives 14 days
-- off the column DEFAULT. This file therefore leaves the DEFAULT alone; the
-- 60-day life of a fix-check row (ruling 3) is set explicitly by
-- fn_bug_feedback_prepare and fn_bug_feedback_release_queued below. Every
-- filter in this file is scoped to kind = 'fix_check' for the same reason:
-- a still_open prompt has no fix, no group and its own cap and expiry.

-- The gate reads "open, due, not snoozed" rows per reporter on every poll.
CREATE INDEX IF NOT EXISTS idx_bug_fix_feedback_gate_due
  ON public.bug_fix_feedback_requests (reporter_user_id, ask_after)
  WHERE status IN ('sent','delivered') AND kind = 'fix_check';

-- Backfill the rows already open on 2026-09-16 (33 sent + 2 delivered on
-- production). The fix was live when they were sent, so sent_at stands in
-- for fix_live_at. expires_at is only ever EXTENDED (ruling 3: "where it is
-- shorter/absent"), never shortened.
UPDATE public.bug_fix_feedback_requests
SET fix_live_at = COALESCE(fix_live_at, sent_at, created_at),
    ask_after   = COALESCE(ask_after,  COALESCE(sent_at, created_at) + interval '3 days'),
    remind_at   = COALESCE(remind_at,  COALESCE(sent_at, created_at) + interval '14 days'),
    expires_at  = GREATEST(expires_at, COALESCE(sent_at, created_at) + interval '60 days'),
    updated_at  = now()
WHERE status IN ('sent','delivered')
  AND kind = 'fix_check';   -- RECONCILED 2026-09-18: never a still_open prompt

-- Rows that never got a send (pending_send) still get their clock set from
-- creation so the release path below has something to compare.
UPDATE public.bug_fix_feedback_requests
SET fix_live_at = COALESCE(fix_live_at, created_at),
    ask_after   = COALESCE(ask_after,  created_at + interval '3 days'),
    remind_at   = COALESCE(remind_at,  created_at + interval '14 days'),
    updated_at  = now()
WHERE status = 'pending_send'
  AND kind = 'fix_check';   -- RECONCILED 2026-09-18: never a still_open prompt

-- ---------------------------------------------------------------------
-- 2) bug_reports.reopened_at — the bugs desk already looks for this
--    (bugsdesk-brief: "check bug_reports for reopened_at on ledgered bugs").
-- ---------------------------------------------------------------------
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
COMMENT ON COLUMN public.bug_reports.reopened_at IS
  'Set when a resolved bug is reopened (reporter said "not fixed" on the feedback gate, ruling 5). The bugs desk reads it every tick.';

-- ---------------------------------------------------------------------
-- 3) bug_fix_outcomes.no_reporter — ruling 8: dropped rows are a count in
--    the ledger, never a signal.
-- ---------------------------------------------------------------------
ALTER TABLE public.bug_fix_outcomes
  ADD COLUMN IF NOT EXISTS no_reporter integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- 4) fn_bug_feedback_drop_gone_reporters() — ruling 8 sweep.
--    service_role only (the notification cron calls it). Marks every open
--    row whose reporter profile is missing, inactive or login-disabled as
--    'dropped' / 'no_reporter' and refreshes each touched group's ledger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_drop_gone_reporters()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dropped int := 0;
  v_clusters uuid[];
  c uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  WITH gone AS (
    UPDATE public.bug_fix_feedback_requests r
    SET status = 'dropped',
        answer = NULL,
        dropped_reason = 'no_reporter',
        updated_at = now()
    WHERE r.status IN ('pending_send','sent','delivered')
      AND r.kind = 'fix_check'   -- RECONCILED 2026-09-18: still_open rows expire on their own
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = r.reporter_user_id
          AND p.is_active = true
          AND p.is_login_disabled = false
      )
    RETURNING r.cluster_id
  )
  SELECT count(*), COALESCE(array_agg(DISTINCT cluster_id), '{}')
    INTO v_dropped, v_clusters
  FROM gone;

  FOREACH c IN ARRAY v_clusters LOOP
    BEGIN
      PERFORM public.fn_bug_fix_outcome_record(c);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- a ledger refresh must never undo the drop
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'dropped', v_dropped);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_drop_gone_reporters() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_drop_gone_reporters() TO service_role;

-- ---------------------------------------------------------------------
-- 5) fn_bug_feedback_release_queued(reporter) — the July 3-open cap (E4)
--    kept, but released by the machine, not by an admin click (ruling 4).
--    Internal helper: called from prepare/answer/drop paths and the cron.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_release_queued(p_reporter_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open int;
  v_released int := 0;
  r RECORD;
BEGIN
  SELECT count(*) INTO v_open
  FROM public.bug_fix_feedback_requests
  WHERE reporter_user_id = p_reporter_user_id
    AND kind = 'fix_check'   -- RECONCILED 2026-09-18: still_open has its own cap
    AND status IN ('sent','delivered')
    AND expires_at > now();

  FOR r IN
    SELECT id FROM public.bug_fix_feedback_requests
    WHERE reporter_user_id = p_reporter_user_id AND status = 'pending_send'
      AND kind = 'fix_check'   -- RECONCILED 2026-09-18
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_open >= 3;
    UPDATE public.bug_fix_feedback_requests
    SET status      = 'sent',
        sent_at     = now(),
        fix_live_at = COALESCE(fix_live_at, now()),
        ask_after   = COALESCE(ask_after, now() + interval '3 days'),
        remind_at   = COALESCE(remind_at, now() + interval '14 days'),
        expires_at  = GREATEST(expires_at, now() + interval '60 days'),
        updated_at  = now()
    WHERE id = r.id;
    v_open := v_open + 1;
    v_released := v_released + 1;
  END LOOP;

  RETURN v_released;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_release_queued(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_release_queued(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 6) fn_bug_feedback_snooze(request) — ruling 2. Reporter-owned. Hides the
--    question from the blocking screen for one day, at most three times.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated every signed-in reporter may snooze THEIR OWN question: the body selects and updates only rows WHERE reporter_user_id = auth.uid(); any other row answers 'not found'. No cross-user reach.
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_snooze(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bug_fix_feedback_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.bug_fix_feedback_requests
  WHERE id = p_request_id AND reporter_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;
  IF v_row.status NOT IN ('sent','delivered') THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question is not open');
  END IF;
  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question has expired');
  END IF;
  IF v_row.snooze_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no more snoozes',
                              'snooze_count', v_row.snooze_count);
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET snooze_count  = snooze_count + 1,
      snoozed_until = now() + interval '1 day',
      delivered_at  = COALESCE(delivered_at, now()),
      status        = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END,
      updated_at    = now()
  WHERE id = p_request_id AND reporter_user_id = auth.uid()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true,
    'snooze_count', v_row.snooze_count,
    'snoozed_until', v_row.snoozed_until,
    'can_snooze', v_row.snooze_count < 3);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_snooze(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_snooze(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) fn_bug_feedback_prepare — CHANGED 2026-09-16 (ruling 4): rows are
--    inserted as 'sent' straight away, clock set from now() (the Groups tab
--    only offers "Ask the reporters" once the fix is live). The July 3-open
--    cap (E4) still holds: the reporter's 4th+ open question waits as
--    'pending_send' and is released by fn_bug_feedback_release_queued.
--    Ruling 8: a reporter whose profile is missing/disabled is skipped and
--    counted in skipped_no_reporter. Everything else is the live body.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_prepare(
  p_cluster_id uuid,
  p_fix_pr text DEFAULT NULL,
  p_deploy_sha text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cluster    public.bug_clusters%ROWTYPE;
  v_verdict    jsonb;
  v_subgroups  jsonb;
  v_excluded   text[] := '{}';
  v_prepared   int := 0;
  v_no_reporter int := 0;
  v_off_cause  int := 0;
  v_sent       int := 0;
  v_queued     int := 0;
  v_sent_reporters uuid[] := '{}';
  r RECORD;
  v_open int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'group not found');
  END IF;

  v_verdict := v_cluster.metadata -> 'fixability' -> 'verdict';
  IF v_verdict IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'needs a fixability verdict before reporter feedback');
  END IF;

  -- Eligibility (E3): reporters are asked when the group shares ONE cause
  -- and a real fix exists. single_fix_feasible=false alone means "not
  -- machine-writable", not "no single fix" — the human path covers the
  -- rest: one subgroup at most + a recorded fix PR.
  IF NOT (
       COALESCE((v_verdict ->> 'single_fix_feasible')::boolean, false)
       OR (
         jsonb_array_length(COALESCE(v_verdict -> 'subgroups', '[]'::jsonb)) <= 1
         AND (v_cluster.metadata -> 'fixability' -> 'fix' ->> 'status') = 'pr_opened'
       )
     ) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'needs a one-fix verdict, or a one-cause verdict with a human-path fix PR');
  END IF;

  v_subgroups := COALESCE(v_verdict -> 'subgroups', '[]'::jsonb);
  IF jsonb_array_length(v_subgroups) >= 2 THEN
    SELECT COALESCE(array_agg(DISTINCT x.bug_display_id), '{}') INTO v_excluded
    FROM (
      SELECT jsonb_array_elements_text(sg -> 'bug_ids') AS bug_display_id
      FROM jsonb_array_elements(v_subgroups) sg
    ) x;
  END IF;

  WITH members AS (
    SELECT br.id, br.display_id, br.reporter_user_id, br.created_at,
           -- CHANGED 2026-09-16 (ruling 8): a gone/disabled reporter is "no reporter"
           EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.id = br.reporter_user_id
                     AND p.is_active = true AND p.is_login_disabled = false) AS reporter_ok
    FROM public.bug_reports br
    WHERE br.id = ANY (v_cluster.member_ids)
  ),
  counted AS (
    SELECT
      count(*) FILTER (WHERE reporter_user_id IS NULL OR NOT reporter_ok) AS no_reporter,
      count(*) FILTER (WHERE display_id = ANY (v_excluded)) AS off_cause
    FROM members
  ),
  eligible AS (
    SELECT DISTINCT ON (reporter_user_id) reporter_user_id, id AS bug_id
    FROM members
    WHERE reporter_user_id IS NOT NULL
      AND reporter_ok
      AND NOT (display_id = ANY (v_excluded))
    ORDER BY reporter_user_id, created_at ASC
  ),
  ins AS (
    -- CHANGED 2026-09-16 (ruling 4): no admin tick — rows are born 'pending_send'
    -- only so the cap loop below can decide sent-now vs queued in one place.
    INSERT INTO public.bug_fix_feedback_requests
      (cluster_id, bug_id, reporter_user_id, fix_pr, deploy_sha,
       fix_live_at, ask_after, remind_at, expires_at)
    SELECT p_cluster_id, e.bug_id, e.reporter_user_id, p_fix_pr, p_deploy_sha,
           now(), now() + interval '3 days', now() + interval '14 days', now() + interval '60 days'
    FROM eligible e
    ON CONFLICT (cluster_id, reporter_user_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins),
         (SELECT no_reporter FROM counted),
         (SELECT off_cause FROM counted)
    INTO v_prepared, v_no_reporter, v_off_cause;

  -- Auto-send under the 3-open cap (E4), oldest first.
  FOR r IN
    SELECT id, reporter_user_id
    FROM public.bug_fix_feedback_requests
    WHERE cluster_id = p_cluster_id AND status = 'pending_send'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT count(*) INTO v_open
    FROM public.bug_fix_feedback_requests
    WHERE reporter_user_id = r.reporter_user_id
      AND kind = 'fix_check'   -- RECONCILED 2026-09-18: still_open has its own cap
      AND status IN ('sent','delivered')
      AND expires_at > now();
    IF v_open < 3 THEN
      UPDATE public.bug_fix_feedback_requests
      SET status = 'sent', sent_at = now(), updated_at = now()
      WHERE id = r.id;
      v_sent := v_sent + 1;
      v_sent_reporters := array_append(v_sent_reporters, r.reporter_user_id);
    ELSE
      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'prepared', v_prepared,
    'sent', v_sent,
    'queued_by_cap', v_queued,
    'sent_reporter_ids', to_jsonb(v_sent_reporters),
    'skipped_no_reporter', v_no_reporter,
    'excluded_off_cause', v_off_cause
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------
-- 8) fn_bug_fix_outcome_record — body from 20260915093000 + CHANGED lines:
--    counts status='dropped' rows into no_reporter (ruling 8).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_fix_outcome_record(p_cluster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cluster   public.bug_clusters%ROWTYPE;
  v_verdict   jsonb;
  v_fix       jsonb;
  v_files     text[];
  v_category  text;
  v_pos       int;
  v_neg       int;
  v_apos      int;
  v_aneg      int;
  v_noreporter int;  -- CHANGED 2026-09-16 (ruling 8)
  v_confirmed text;
  v_resolved  timestamptz;
BEGIN
  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'group not found');
  END IF;

  v_verdict := v_cluster.metadata -> 'fixability' -> 'verdict';
  IF v_verdict IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no fixability verdict to learn from');
  END IF;
  v_fix := v_cluster.metadata -> 'fixability' -> 'fix';

  SELECT COALESCE(array_agg(f), '{}') INTO v_files
  FROM jsonb_array_elements_text(COALESCE(v_verdict -> 'files', '[]'::jsonb)) f;

  IF array_length(v_files, 1) IS NULL THEN
    v_category := 'uncategorized';
  ELSE
    v_category := array_to_string((string_to_array(v_files[1], '/'))[1:3], '/');
  END IF;

  SELECT count(*) FILTER (WHERE status = 'answered' AND answer = 'fixed'     AND answered_by = 'reporter'),
         count(*) FILTER (WHERE status = 'answered' AND answer = 'not_fixed' AND answered_by = 'reporter'),
         count(*) FILTER (WHERE status = 'answered' AND answer = 'fixed'     AND answered_by = 'admin'),
         count(*) FILTER (WHERE status = 'answered' AND answer = 'not_fixed' AND answered_by = 'admin'),
         count(*) FILTER (WHERE status = 'dropped')
    INTO v_pos, v_neg, v_apos, v_aneg, v_noreporter
  FROM public.bug_fix_feedback_requests
  WHERE cluster_id = p_cluster_id;

  v_confirmed := CASE
    WHEN v_neg > 0 THEN 'negative'
    WHEN v_pos > 0 THEN 'positive'
    WHEN COALESCE(v_apos, 0) + COALESCE(v_aneg, 0) > 0 THEN 'admin'
    ELSE 'none'
  END;

  SELECT resolved_at INTO v_resolved
  FROM public.bug_reports WHERE id = v_cluster.seed_bug_id;

  INSERT INTO public.bug_fix_outcomes AS o
    (cluster_id, canonical_bug_id, root_cause_category, root_cause, files_touched,
     fix_pattern, fix_pr, verify_verdict, reporter_confirmed, reporter_pos,
     reporter_neg, admin_pos, admin_neg, no_reporter, resolved_at, updated_at)
  VALUES
    (p_cluster_id, v_cluster.seed_bug_id, v_category, v_verdict ->> 'root_cause', v_files,
     CASE WHEN v_fix IS NULL THEN NULL ELSE jsonb_build_object(
       'note', v_fix ->> 'note', 'branch', v_fix ->> 'branch', 'pr_number', v_fix -> 'pr_number') END,
     v_fix ->> 'pr_url',
     v_cluster.metadata -> 'verify' -> 'tally',
     v_confirmed, COALESCE(v_pos, 0), COALESCE(v_neg, 0),
     COALESCE(v_apos, 0), COALESCE(v_aneg, 0), COALESCE(v_noreporter, 0), v_resolved, now())
  ON CONFLICT (cluster_id) DO UPDATE SET
    canonical_bug_id    = EXCLUDED.canonical_bug_id,
    root_cause_category = EXCLUDED.root_cause_category,
    root_cause          = EXCLUDED.root_cause,
    files_touched       = EXCLUDED.files_touched,
    fix_pattern         = EXCLUDED.fix_pattern,
    fix_pr              = EXCLUDED.fix_pr,
    verify_verdict      = EXCLUDED.verify_verdict,
    reporter_confirmed  = EXCLUDED.reporter_confirmed,
    reporter_pos        = EXCLUDED.reporter_pos,
    reporter_neg        = EXCLUDED.reporter_neg,
    admin_pos           = EXCLUDED.admin_pos,
    admin_neg           = EXCLUDED.admin_neg,
    no_reporter         = EXCLUDED.no_reporter,
    resolved_at         = EXCLUDED.resolved_at,
    updated_at          = now();

  RETURN jsonb_build_object('success', true, 'category', v_category,
    'reporter_confirmed', v_confirmed, 'pos', COALESCE(v_pos,0), 'neg', COALESCE(v_neg,0),
    'admin_pos', COALESCE(v_apos,0), 'admin_neg', COALESCE(v_aneg,0),
    'no_reporter', COALESCE(v_noreporter,0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_fix_outcome_record(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_fix_outcome_record(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 9) fn_bug_feedback_answer — body from 20260915093000 + CHANGED 2026-09-16:
--    ruling 5: 'not_fixed' reopens the bug and the group's canonical bug,
--    leaves a system message, and notifies the fixer of record.
--    Also clears any snooze and releases a queued question for this reporter.
--    CHANGED 2026-09-18 (critic gap 1): the reopen is no longer inside a
--    catch-all block that its own cosmetic side effects could roll back, and
--    the return value carries the bug's status read back from the table.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated every signed-in reporter may answer THEIR OWN question (the loop's ground truth): every read/write is scoped WHERE reporter_user_id = auth.uid(); the reopen/notify side effects act only on that row's own bug/group. Same shape as the 2026-07-18 original.
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_answer(p_request_id uuid, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.bug_fix_feedback_requests%ROWTYPE;
  v_seed       uuid;
  v_display    text;
  v_fixer      uuid;
  v_nid        uuid;
  v_reopened   int := 0;
  v_bug_status text;             -- CHANGED 2026-09-18: read back, never assumed
  v_ledger_ok  boolean := false; -- CHANGED 2026-09-18: reported, never swallowed
BEGIN
  IF p_answer NOT IN ('fixed','not_fixed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'answer must be fixed or not_fixed');
  END IF;

  SELECT * INTO v_row
  FROM public.bug_fix_feedback_requests
  WHERE id = p_request_id AND reporter_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;
  IF v_row.status = 'pending_send' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not sent yet');
  END IF;
  IF v_row.status = 'dropped' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question was withdrawn');
  END IF;
  IF v_row.expires_at <= now() AND v_row.status <> 'answered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question has expired');
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET answer = p_answer,
      answered_at = now(),
      status = 'answered',
      delivered_at = COALESCE(delivered_at, now()),
      answered_by = 'reporter',
      admin_user_id = NULL,
      admin_note = NULL,
      snoozed_until = NULL,          -- CHANGED 2026-09-16: an answer ends any snooze
      updated_at = now()
  WHERE id = p_request_id AND reporter_user_id = auth.uid();

  -- RECONCILED 2026-09-18: this branch is the LIVE body's (20261223000000,
  -- applied 17 Sep) and must survive this CREATE OR REPLACE. A "still
  -- happening?" prompt (kind = still_open) has no group and no fix behind it.
  -- Its answer acts on the REPORT and never touches the fix-outcome ledger,
  -- which must only ever learn from fix checks.
  --   fixed      = "no, it works now"  -> the report is resolved, by its reporter
  --   not_fixed  = "yes, still broken" -> stays open, stamped so it is not asked
  --                                      again for a while and can be ranked
  -- FIXED 2026-09-18 (found by this PR's production rehearsal, check 28): the
  -- live branch set no resolved_by, and 20261223093000's trigger
  -- fn_bug_reports_enforce_resolved_by refuses status = 'resolved' without one
  -- — so on production every "No, it works now" tap has failed since 17 Sep.
  -- The resolver IS the reporter (that is what "by its reporter" means).
  IF v_row.kind = 'still_open' THEN
    IF p_answer = 'fixed' THEN
      UPDATE public.bug_reports
         SET status = 'resolved',
             resolved_at = now(),
             resolved_by = v_row.reporter_user_id,
             updated_at = now(),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'resolved_by', 'reporter_still_open_prompt',
               'still_open_prompt_id', v_row.id::text,
               'still_open_answered_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
       WHERE id = v_row.bug_id
         AND status IN ('new','seen','in_progress');
    ELSE
      UPDATE public.bug_reports
         SET updated_at = now(),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'still_open_confirmed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'still_open_prompt_id', v_row.id::text)
       WHERE id = v_row.bug_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'answer', p_answer, 'kind', 'still_open');
  END IF;

  -- Learn (#3): refresh the measured-outcome ledger. Never fail the answer —
  -- but CHANGED 2026-09-18: say whether it landed. A swallowed ledger refresh
  -- used to be indistinguishable from a recorded one in the return value.
  BEGIN
    PERFORM public.fn_bug_fix_outcome_record(v_row.cluster_id);
    v_ledger_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ledger_ok := false;
  END;

  -- CHANGED 2026-09-16: a slot freed → release this reporter's next queued question.
  BEGIN
    PERFORM public.fn_bug_feedback_release_queued(v_row.reporter_user_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF p_answer = 'not_fixed' THEN
    -- R3 circuit breaker (unchanged, 2026-07-19).
    BEGIN
      IF EXISTS (SELECT 1 FROM public.bug_clusters c
                  WHERE c.id = v_row.cluster_id AND (c.metadata ? 'auto_resolved')) THEN
        UPDATE public.platform_policies
           SET value = 'false'::jsonb, updated_at = now()
         WHERE policy_key = 'bug_reports.auto_resolve.enabled' AND scope_type = 'global';
        UPDATE public.platform_policies
           SET value = jsonb_build_object(
                 'suspended_at', now(),
                 'cluster_id', v_row.cluster_id,
                 'reason', 'a reporter answered still-broken after an auto-resolve'),
               updated_at = now()
         WHERE policy_key = 'bug_reports.auto_resolve.suspended' AND scope_type = 'global';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Reopen the bug + the group's canonical bug (ruling 5).
    --
    -- CHANGED 2026-09-18 (blind-critic gap 1: "'not fixed' can silently leave
    -- the bug closed"). The reopen has NO exception handler around it any more,
    -- and its result is READ BACK from bug_reports.
    --
    -- It used to sit in ONE `BEGIN … EXCEPTION WHEN OTHERS THEN NULL` block
    -- together with the system message, the group record and the fixer
    -- notification. PL/pgSQL turns such a block into a subtransaction: a
    -- failure in ANY of those four statements rolled the whole block back —
    -- the reopen included — while v_reopened kept the value it had, because a
    -- caught error rolls back database work and never local variables. The
    -- function then answered `reopened: 1` over a bug that was still
    -- 'resolved', and the gate told the reporter "the report is open again".
    -- Nothing anywhere logged it.
    --
    -- Now: the reopen either happens or the whole answer fails loudly (the
    -- route returns 500 and the question comes back on the next poll — a
    -- re-askable question beats a bug that is closed and looks reopened). The
    -- three cosmetic side effects each get their own handler below, so none of
    -- them can undo the reopen.
    SELECT seed_bug_id, decided_by INTO v_seed, v_fixer
    FROM public.bug_clusters WHERE id = v_row.cluster_id;

    WITH reopened AS (
      UPDATE public.bug_reports b
      SET status      = 'new',
          resolved_at = NULL,
          reopened_at = now(),
          metadata    = COALESCE(b.metadata, '{}'::jsonb) || jsonb_build_object(
                          'reopened_at',     now(),
                          'reopened_by',     'feedback_gate',
                          'reopen_reason',   'reporter says not fixed',
                          'reopen_request',  p_request_id),
          updated_at  = now()
      WHERE b.id IN (v_row.bug_id, v_seed)
        AND b.status IN ('resolved','duplicate','wont_fix')
      RETURNING b.id
    )
    SELECT count(*) INTO v_reopened FROM reopened;

    -- The reporter's own report, read back after the write. 'bug_status' is
    -- the field a caller should trust: 'reopened' is a row count, and a bug
    -- that was already open makes it legitimately 0.
    SELECT status, display_id INTO v_bug_status, v_display
    FROM public.bug_reports WHERE id = v_row.bug_id;

    -- CHANGED 2026-09-18 (deep review #2): the three side effects below run
    -- only when THIS answer reopened a bug. A reporter may answer again (their
    -- late word replaces an admin's — unchanged rule), but a repeat "not fixed"
    -- on a bug that is already open must not add another system message or
    -- send the fixer another work item.
    IF v_reopened > 0 THEN
    -- The system message on the reporter's own report (sender = the reporter:
    -- it is their word, recorded by the gate). Cosmetic: own handler.
    BEGIN
      INSERT INTO public.bug_report_messages
        (bug_report_id, sender_user_id, message_text, message_type, is_internal)
      VALUES
        (v_row.bug_id, v_row.reporter_user_id,
         'Reporter says not fixed (feedback gate). The report has been reopened.',
         'system', false);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Group record: safe append with ||, never jsonb_set on a missing parent.
    BEGIN
      UPDATE public.bug_clusters
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'reopened', jsonb_build_object(
              'at', now(), 'by', 'feedback_gate', 'request_id', p_request_id,
              'reporter_user_id', v_row.reporter_user_id)),
          updated_at = now()
      WHERE id = v_row.cluster_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Fixer of record: the bug's assignee, else the admin who confirmed the
    -- group. Nobody on file → no notification; the reopened status itself is
    -- what the bugs desk picks up.
    BEGIN
      SELECT COALESCE(
               (SELECT assigned_to_user_id FROM public.bug_reports WHERE id = v_row.bug_id),
               (SELECT assigned_to_user_id FROM public.bug_reports WHERE id = v_seed),
               v_fixer)
        INTO v_fixer;

      IF v_fixer IS NOT NULL AND v_fixer <> v_row.reporter_user_id THEN
        INSERT INTO public.notifications
          (title, body, category, kind, targeting, url, priority, created_by, metadata)
        VALUES (
          'A reporter says ' || COALESCE(v_display, 'a bug') || ' is not fixed',
          'The person who reported ' || COALESCE(v_display, 'this bug')
            || ' answered "Not fixed" on the feedback screen. The report is open again '
            || 'with the note "reporter says not fixed". Please take another look.',
          'bug_reports:reopened',
          'work_item',
          jsonb_build_object('type', 'user', 'user_ids', to_jsonb(ARRAY[v_fixer])),
          '/admin/bug-reports',
          'high',
          v_row.reporter_user_id,
          jsonb_build_object('source', 'bug_fix_feedback.reopen',
                             'bug_id', v_row.bug_id, 'cluster_id', v_row.cluster_id,
                             'request_id', p_request_id)
        )
        RETURNING id INTO v_nid;

        INSERT INTO public.user_notifications (notification_id, user_id)
        VALUES (v_nid, v_fixer);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- The insert was rolled back with this subtransaction; v_nid survived it
      -- (local variables are not rolled back), so clear it or the return value
      -- would report a notification that does not exist.
      v_nid := NULL;
    END;
    END IF;  -- v_reopened > 0
  END IF;

  RETURN jsonb_build_object('success', true, 'answer', p_answer,
                            'reopened', v_reopened,
                            'bug_status', v_bug_status,      -- CHANGED 2026-09-18
                            'ledger_recorded', v_ledger_ok,  -- CHANGED 2026-09-18
                            'fixer_notified', v_nid IS NOT NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 10) Reporter RLS: the reporter's own rows stay readable exactly as before
--     (status <> 'pending_send'); 'dropped' rows are theirs too but the
--     /my-bug-reports list filters on sent/delivered/answered, so nothing
--     new shows. No policy change needed.
-- ---------------------------------------------------------------------
