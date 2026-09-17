-- =====================================================================
-- "Is this still happening?" — a second kind of reporter prompt
-- Date: 2026-09-16   (Director ruling by tap, 08:45: "Ask each reporter
--                     'still happening?' — same 14-day prompt the loop uses")
--
-- WHY
-- 598 open reports (280 reporters) are older than 60 days, sit in no group,
-- and match no fix. Nobody will ever work them one by one, and closing them
-- unasked would bury real bugs. The reporter is the only person who knows.
-- The app already has an in-app, 14-day, at-least-once prompt with an
-- explicit answer write and a "silence = no data" rule (20260718180000).
-- This reuses it as a second KIND, so the learner sees one familiar box.
--
-- WHAT CHANGES
--   * bug_fix_feedback_requests.kind  'fix_check' (default, every existing
--     row) | 'still_open'. cluster_id becomes NULLABLE: a still_open prompt
--     has no group and no fix. One still_open prompt per report (partial
--     unique index). Existing UNIQUE (cluster_id, reporter_user_id) is
--     untouched — NULL cluster_id never collides.
--   * fn_bug_stale_prompt_prepare(days, limit): service-role only. Queues
--     still_open rows (pending_send) for open reports older than N days
--     with a known reporter, in no live group, not asked before, and not
--     re-confirmed "still broken" in the last 30 days. Oldest first.
--   * fn_bug_stale_prompt_send(limit): service-role only. pending_send ->
--     sent for still_open rows; mirrors the human-approved send step of fix
--     prompts. Nothing sends on prepare alone.
--   * fn_bug_feedback_answer: LIVE body plus one branch. For still_open,
--     'fixed' ("no, it works now") RESOLVES the report by its reporter;
--     'not_fixed' ("yes, still broken") stamps metadata.still_open_confirmed_at
--     and returns. Neither touches bug_fix_outcomes or the R3 breaker —
--     the learning ledger only ever sees fix checks.
--   * fn_bug_feedback_admin_confirm: unchanged; it reads a fix-check row's
--     cluster and is refused a still_open row by the kind guard below.
--     Silence on a still_open prompt leaves the report open (ruling).
--
-- WHAT DOES NOT CHANGE
--   RLS (reporter sees own rows, status <> pending_send; admins see all),
--   the ack route, the answer route (it calls the same RPC), expiry (14 d),
--   the fix-check flow end to end. Every existing row reads kind='fix_check'.
--
-- ROLLOUT: file only, applied at merge. No prompt is queued by this file;
-- the bugs desk calls prepare then send, in batches, and reports counts.
-- =====================================================================

-- 1) Schema -----------------------------------------------------------
ALTER TABLE public.bug_fix_feedback_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'fix_check';

ALTER TABLE public.bug_fix_feedback_requests
  DROP CONSTRAINT IF EXISTS bug_fix_feedback_requests_kind_check;
ALTER TABLE public.bug_fix_feedback_requests
  ADD CONSTRAINT bug_fix_feedback_requests_kind_check
  CHECK (kind IN ('fix_check', 'still_open'));

ALTER TABLE public.bug_fix_feedback_requests
  ALTER COLUMN cluster_id DROP NOT NULL;

-- a fix check always has a group; a still-open check never does
ALTER TABLE public.bug_fix_feedback_requests
  DROP CONSTRAINT IF EXISTS bug_fix_feedback_requests_kind_cluster_check;
ALTER TABLE public.bug_fix_feedback_requests
  ADD CONSTRAINT bug_fix_feedback_requests_kind_cluster_check
  CHECK ((kind = 'fix_check' AND cluster_id IS NOT NULL)
      OR (kind = 'still_open' AND cluster_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS bug_fix_feedback_requests_still_open_bug_uniq
  ON public.bug_fix_feedback_requests (bug_id)
  WHERE kind = 'still_open';

-- 2) Prepare ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_stale_prompt_prepare(
  p_older_than_days integer DEFAULT 60,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prepared int := 0;
BEGIN
  -- Same gate as the fix-prompt prepare: service role only (a route or the
  -- bugs desk acting for a super admin), never a signed-in user.
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;
  IF p_older_than_days < 14 THEN
    RETURN jsonb_build_object('success', false, 'error', 'older_than_days must be at least 14');
  END IF;

  WITH grouped AS (
    SELECT unnest(member_ids) AS bid
      FROM public.bug_clusters
     WHERE status <> 'dismissed'
  ),
  pool AS (
    SELECT b.id, b.reporter_user_id
      FROM public.bug_reports b
     WHERE b.status IN ('new','seen','in_progress')
       AND b.duplicate_of IS NULL
       AND b.reporter_user_id IS NOT NULL
       AND b.created_at < now() - make_interval(days => p_older_than_days)
       AND NOT EXISTS (SELECT 1 FROM grouped g WHERE g.bid = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.bug_fix_feedback_requests r
                        WHERE r.bug_id = b.id AND r.kind = 'still_open')
       AND COALESCE((b.metadata ->> 'still_open_confirmed_at')::timestamptz,
                    '-infinity'::timestamptz) < now() - interval '30 days'
     ORDER BY b.created_at ASC
     LIMIT GREATEST(p_limit, 0)
  ),
  ins AS (
    INSERT INTO public.bug_fix_feedback_requests
      (kind, cluster_id, bug_id, reporter_user_id, status)
    SELECT 'still_open', NULL, p.id, p.reporter_user_id, 'pending_send'
      FROM pool p
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_prepared FROM ins;

  RETURN jsonb_build_object('success', true, 'prepared', v_prepared);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_stale_prompt_prepare(integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_stale_prompt_prepare(integer, integer) TO service_role;

-- 3) Send -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_stale_prompt_send(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sent int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  WITH pick AS (
    SELECT id
      FROM public.bug_fix_feedback_requests
     WHERE kind = 'still_open' AND status = 'pending_send'
     ORDER BY created_at ASC
     LIMIT GREATEST(p_limit, 0)
  ),
  upd AS (
    UPDATE public.bug_fix_feedback_requests r
       SET status = 'sent',
           sent_at = now(),
           expires_at = now() + interval '14 days',
           updated_at = now()
      FROM pick
     WHERE r.id = pick.id
    RETURNING 1
  )
  SELECT count(*) INTO v_sent FROM upd;

  RETURN jsonb_build_object('success', true, 'sent', v_sent);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_stale_prompt_send(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_stale_prompt_send(integer) TO service_role;

-- 4) Answer: LIVE body (pg_get_functiondef, 2026-09-16) + the still_open branch
-- ci:allow-secdef-authenticated Reporter self-service: the signed-in reporter answers their own prompt; the body checks reporter_user_id = auth.uid() before any write.
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_answer(p_request_id uuid, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- (unchanged rule) an expired, unanswered question stays expired. An
  -- expired question an ADMIN has confirmed is status='answered', so the
  -- reporter's late word still gets through and replaces the admin's.
  IF v_row.expires_at <= now() AND v_row.status <> 'answered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question has expired');
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET answer = p_answer,
      answered_at = now(),
      status = 'answered',
      delivered_at = COALESCE(delivered_at, now()),
      -- CHANGED 2026-09-15: the reporter's own word always wins and is never
      -- disguised — a late reporter answer over an admin confirmation resets
      -- the row to reporter evidence.
      answered_by = 'reporter',
      admin_user_id = NULL,
      admin_note = NULL,
      updated_at = now()
  WHERE id = p_request_id AND reporter_user_id = auth.uid();

  -- 2026-09-16: a "still happening?" prompt (kind = still_open) has no group
  -- and no fix behind it. Its answer acts on the REPORT and never touches the
  -- fix-outcome ledger, which must only ever learn from fix checks.
  --   fixed      = "no, it works now"  -> the report is resolved, by its reporter
  --   not_fixed  = "yes, still broken" -> stays open, stamped so it is not asked
  --                                      again for a while and can be ranked
  IF v_row.kind = 'still_open' THEN
    IF p_answer = 'fixed' THEN
      UPDATE public.bug_reports
         SET status = 'resolved',
             resolved_at = now(),
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

  -- Learn (#3): refresh the measured-outcome ledger. Never fail the answer.
  BEGIN
    PERFORM public.fn_bug_fix_outcome_record(v_row.cluster_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- R3 circuit breaker: a still-broken answer on an AUTO-resolved group
  -- switches auto-resolve OFF everywhere until a human reviews. Must never
  -- break the reporter's answer write.
  IF p_answer = 'not_fixed' THEN
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
  END IF;

  RETURN jsonb_build_object('success', true, 'answer', p_answer);
END;
$function$;

-- grants re-stated exactly as production holds them (proacl 2026-09-16):
--   postgres | authenticated | service_role
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) TO authenticated, service_role;

-- 5) Admin confirm never answers a still-open prompt (ruling: silence leaves it)
-- Implemented as a guard trigger-free: the function reads the row's cluster
-- and refuses when there is none.
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_kind_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kind = 'still_open' AND NEW.answered_by = 'admin' THEN
    RAISE EXCEPTION 'a still-open prompt can only be answered by its reporter'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bug_fix_feedback_kind_guard ON public.bug_fix_feedback_requests;
CREATE TRIGGER bug_fix_feedback_kind_guard
  BEFORE INSERT OR UPDATE ON public.bug_fix_feedback_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_bug_feedback_kind_guard();
