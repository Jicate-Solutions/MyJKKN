-- =====================================================================
-- Bug-cluster self-improving loop — increment #2: Reporter feedback
-- Date: 2026-07-18
-- Spec: docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md
--
-- THE KEYSTONE / GROUND TRUTH. After a fix for a cluster deploys, each
-- eligible reporter gets an in-app 👍/👎 "is this fixed for you?" prompt.
-- The reporter's answer — never any AI verdict — is the measurement the
-- loop learns from (this is what will earn loop gate m: off→on, in a
-- LATER migration once real answers exist; not flipped here).
--
-- Locked rules baked in (Director interview 2026-07-18):
--   - A HUMAN approves the send (rows prepare as 'pending_send'; only the
--     admin-gated approve-send RPC flips them to 'sent'). Nothing sends
--     on any AI verdict.
--   - E3: odd-one-out members (different root cause per the fixability
--     verdict subgroups) are excluded — their answers would poison the
--     measurement.
--   - E4: a reporter never has more than 3 open prompts at once; the rest
--     queue as 'pending_send' until a slot frees.
--   - E2: silence = no data. Expired unanswered rows are never counted as
--     agreement.
--   - Delivery is at-least-once: the client ACKS render (delivered_at);
--     the answer is a separate explicit write. Never stamp-on-read.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bug_fix_feedback_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id       uuid NOT NULL REFERENCES public.bug_clusters(id) ON DELETE CASCADE,
  bug_id           uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fix_pr           text,
  deploy_sha       text,
  status           text NOT NULL DEFAULT 'pending_send'
                     CHECK (status IN ('pending_send','sent','delivered','answered','expired')),
  answer           text CHECK (answer IN ('fixed','not_fixed')),
  sent_at          timestamptz,
  delivered_at     timestamptz,
  answered_at      timestamptz,
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- One question per reporter per fixed cluster (a reporter with several
  -- reports inside one cluster is asked once, anchored to their oldest).
  CONSTRAINT bug_fix_feedback_requests_cluster_reporter_uniq UNIQUE (cluster_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_bug_fix_feedback_reporter_open
  ON public.bug_fix_feedback_requests (reporter_user_id)
  WHERE status IN ('sent','delivered');
CREATE INDEX IF NOT EXISTS idx_bug_fix_feedback_cluster
  ON public.bug_fix_feedback_requests (cluster_id);

-- ---------------------------------------------------------------------
-- 2) RLS — reporters see ONLY their own, already-sent rows (a prompt a
--    human has not approved for sending must be invisible to them).
--    All writes go through the SECDEF RPCs below; no direct write policies.
-- ---------------------------------------------------------------------
ALTER TABLE public.bug_fix_feedback_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bug_fix_feedback_reporter_select_own" ON public.bug_fix_feedback_requests;
CREATE POLICY "bug_fix_feedback_reporter_select_own" ON public.bug_fix_feedback_requests
  FOR SELECT USING (
    reporter_user_id = auth.uid() AND status <> 'pending_send'
  );

DROP POLICY IF EXISTS "bug_fix_feedback_admin_select" ON public.bug_fix_feedback_requests;
CREATE POLICY "bug_fix_feedback_admin_select" ON public.bug_fix_feedback_requests
  FOR SELECT USING (is_super_admin() OR is_admin());

-- ---------------------------------------------------------------------
-- 3) fn_bug_feedback_prepare(cluster) — service_role only (admin route).
--    Builds 'pending_send' rows for ELIGIBLE members: has a linked
--    reporter, and not in a different-cause subgroup (E3). Requires a
--    one-fix fixability verdict. Idempotent (ON CONFLICT DO NOTHING).
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
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'group not found');
  END IF;

  v_verdict := v_cluster.metadata -> 'fixability' -> 'verdict';
  IF v_verdict IS NULL OR COALESCE((v_verdict ->> 'single_fix_feasible')::boolean, false) = false THEN
    RETURN jsonb_build_object('success', false,
      'error', 'needs a one-fix fixability verdict before reporter feedback');
  END IF;

  -- E3: with 2+ subgroups, members listed in them are different-cause —
  -- excluded. (The verdict clamp forces single_fix=false when subgroups>1,
  -- so this is a forward-guard; today it is a no-op for one-fix verdicts.)
  v_subgroups := COALESCE(v_verdict -> 'subgroups', '[]'::jsonb);
  IF jsonb_array_length(v_subgroups) >= 2 THEN
    SELECT COALESCE(array_agg(DISTINCT x.bug_display_id), '{}') INTO v_excluded
    FROM (
      SELECT jsonb_array_elements_text(sg -> 'bug_ids') AS bug_display_id
      FROM jsonb_array_elements(v_subgroups) sg
    ) x;
  END IF;

  WITH members AS (
    SELECT br.id, br.display_id, br.reporter_user_id, br.created_at
    FROM public.bug_reports br
    WHERE br.id = ANY (v_cluster.member_ids)
  ),
  counted AS (
    SELECT
      count(*) FILTER (WHERE reporter_user_id IS NULL) AS no_reporter,
      count(*) FILTER (WHERE display_id = ANY (v_excluded)) AS off_cause
    FROM members
  ),
  eligible AS (
    -- One row per reporter: their oldest in-cluster report anchors the prompt.
    SELECT DISTINCT ON (reporter_user_id) reporter_user_id, id AS bug_id
    FROM members
    WHERE reporter_user_id IS NOT NULL
      AND NOT (display_id = ANY (v_excluded))
    ORDER BY reporter_user_id, created_at ASC
  ),
  ins AS (
    INSERT INTO public.bug_fix_feedback_requests
      (cluster_id, bug_id, reporter_user_id, fix_pr, deploy_sha)
    SELECT p_cluster_id, e.bug_id, e.reporter_user_id, p_fix_pr, p_deploy_sha
    FROM eligible e
    ON CONFLICT (cluster_id, reporter_user_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins),
         (SELECT no_reporter FROM counted),
         (SELECT off_cause FROM counted)
    INTO v_prepared, v_no_reporter, v_off_cause;

  RETURN jsonb_build_object(
    'success', true,
    'prepared', v_prepared,
    'skipped_no_reporter', v_no_reporter,
    'excluded_off_cause', v_off_cause
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4) fn_bug_feedback_approve_send(cluster) — service_role only, called
--    ONLY after a human clicks Send (human gate #3). Flips pending_send
--    → sent honoring the global 3-open-prompts cap per reporter (E4).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_approve_send(p_cluster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_open int;
  v_sent int := 0;
  v_queued int := 0;
  v_sent_reporters uuid[] := '{}';
  v_sent_rows jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  FOR r IN
    SELECT id, reporter_user_id, bug_id
    FROM public.bug_fix_feedback_requests
    WHERE cluster_id = p_cluster_id AND status = 'pending_send'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT count(*) INTO v_open
    FROM public.bug_fix_feedback_requests
    WHERE reporter_user_id = r.reporter_user_id
      AND status IN ('sent','delivered')
      AND expires_at > now();

    IF v_open < 3 THEN
      UPDATE public.bug_fix_feedback_requests
      SET status = 'sent', sent_at = now(), updated_at = now()
      WHERE id = r.id;
      v_sent := v_sent + 1;
      v_sent_reporters := array_append(v_sent_reporters, r.reporter_user_id);
      v_sent_rows := v_sent_rows || jsonb_build_object(
        'request_id', r.id, 'reporter_user_id', r.reporter_user_id, 'bug_id', r.bug_id);
    ELSE
      v_queued := v_queued + 1; -- E4: waits; a later Send click releases it
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'sent', v_sent, 'queued_by_cap', v_queued,
    'sent_reporter_ids', to_jsonb(v_sent_reporters), 'sent_rows', v_sent_rows
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 5) fn_bug_feedback_ack_delivery(request) — the at-least-once client ACK.
--    Called by the reporter's own session when the prompt RENDERS.
--    Idempotent; never marks anything answered.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_ack_delivery(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.bug_fix_feedback_requests
  WHERE id = p_request_id AND reporter_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  IF v_status = 'sent' THEN
    UPDATE public.bug_fix_feedback_requests
    SET status = 'delivered', delivered_at = now(), updated_at = now()
    WHERE id = p_request_id AND reporter_user_id = auth.uid() AND status = 'sent';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 6) fn_bug_feedback_answer(request, answer) — the reporter's 👍/👎.
--    Written ONLY by the reporter (ground truth — no AI, no admin path).
--    Re-answering within the window is allowed (last answer wins).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_answer(p_request_id uuid, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bug_fix_feedback_requests%ROWTYPE;
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
  IF v_row.expires_at <= now() AND v_row.status <> 'answered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question has expired');
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET answer = p_answer,
      answered_at = now(),
      status = 'answered',
      delivered_at = COALESCE(delivered_at, now()),
      updated_at = now()
  WHERE id = p_request_id AND reporter_user_id = auth.uid();

  RETURN jsonb_build_object('success', true, 'answer', p_answer);
END;
$$;

-- ---------------------------------------------------------------------
-- 7) Grants — lock every new RPC from anon (CLAUDE.md standing rule).
--    prepare/approve_send: service_role ONLY (admin routes gate first).
--    ack/answer: the reporter's own authenticated session.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_approve_send(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_approve_send(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_ack_delivery(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_ack_delivery(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) TO authenticated, service_role;
