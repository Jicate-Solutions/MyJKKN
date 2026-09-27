-- =====================================================================
-- Bug loop: a "is this still happening?" prompt left unanswered for its
-- full 14 days CLOSES its report.
--
-- 📄 FILE ONLY — HELD for the Director. It resolves live bug reports.
--
-- RULING (Director, 18 Sep 2026, bugs-desk interview, ruling 4):
--   "Silent 'still happening?' prompts: CLOSE the bug after 14 days with a
--    note; a re-report reopens it."
--
-- WHY THIS IS NEEDED (production, read-only, 25 Sep 2026):
--   Nothing ever sets bug_fix_feedback_requests.status = 'expired' and
--   nothing acts on an expired still_open prompt, so a report whose reporter
--   stays silent stays open for ever. 368 still_open prompts have been shown
--   (sent / delivered) and are unanswered; 359 expire by 2 Oct. They are
--   the largest single block of the 1,188 open reports.
--
-- CONDITIONS (Director, 27 Sep 2026 06:40, W12-tab interview — conditional
-- approval, merges on a clean re-review of this head):
--   (a) close only when the reporter is KNOWN TO HAVE SEEN the prompt —
--       `delivered_at` is set only when the reporter's screen acknowledged
--       rendering it (20260718180000: "the client ACKS render");
--   (b) never re-close a report that was reopened by hand — any report with
--       `reopened_at` set is left open, whenever it was reopened;
--   (c) he accepts missing the 30 Sep batch.
--
-- WHAT IT DOES
--   fn_bug_still_open_expire() — service_role only (the notification cron
--   calls it, like fn_bug_feedback_drop_gone_reporters). For every
--   still_open prompt that went out (status sent / delivered), has no
--   answer and whose expires_at has passed:
--     1. marks the prompt 'expired' (its 14-day window is over either way);
--     2. resolves its report ONLY IF the prompt was SEEN (delivered_at set),
--        the report is still open, and it was never reopened — with
--        resolved_by = the reporter (the same resolver the "No, it works
--        now" answer uses; fn_bug_reports_enforce_resolved_by requires one)
--        and a metadata note saying it closed on silence.
--   A prompt that went out but was never seen expires and closes nothing.
--   A prompt still queued (pending_send) was never shown: left alone.
--
-- NOT DONE HERE: the ruling's "a re-report reopens it". A new report from
-- the same reporter arrives as its own open report, so nothing is lost; an
-- automatic reopen of the old one is a follow-up.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_bug_still_open_expire()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired int := 0;
  v_closed  int := 0;
  v_unseen  int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  WITH due AS (
    UPDATE public.bug_fix_feedback_requests r
       SET status = 'expired',
           updated_at = now()
     WHERE r.kind = 'still_open'
       AND r.status IN ('sent', 'delivered')
       AND r.answer IS NULL
       AND r.expires_at IS NOT NULL
       AND r.expires_at <= now()
    RETURNING r.id, r.bug_id, r.reporter_user_id, r.delivered_at
  ),
  closed AS (
    UPDATE public.bug_reports b
       SET status = 'resolved',
           resolved_at = now(),
           resolved_by = d.reporter_user_id,
           updated_at = now(),
           metadata = COALESCE(b.metadata, '{}'::jsonb) || jsonb_build_object(
             'resolved_by', 'still_open_prompt_silence',
             'still_open_prompt_id', d.id::text,
             'closed_on_silence_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'close_note', 'Closed: the reporter did not answer "is this still happening?" within 14 days. A new report reopens the problem.')
      FROM due d
     WHERE b.id = d.bug_id
       AND d.delivered_at IS NOT NULL          -- (a) the reporter saw it
       AND b.status IN ('new', 'seen', 'in_progress')
       AND b.reopened_at IS NULL               -- (b) never re-close a reopened report
    RETURNING b.id
  )
  SELECT (SELECT count(*) FROM due),
         (SELECT count(*) FROM closed),
         (SELECT count(*) FROM due WHERE delivered_at IS NULL)
    INTO v_expired, v_closed, v_unseen;

  RETURN jsonb_build_object('success', true, 'expired', v_expired, 'closed', v_closed,
                            'expired_unseen', v_unseen);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_still_open_expire() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_still_open_expire() TO service_role;
