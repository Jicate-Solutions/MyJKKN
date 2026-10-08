-- AI Assistant: "Do it in the background" — tell the asker when the answer is ready.
-- ---------------------------------------------------------------------------
-- WHY. A person can now hand a longer question off from the AI Assistant
-- ("Do it in the background"). app/api/ai-query/route.ts enqueues the
-- ai_query.chat job with payload.background = true and returns at once — no
-- long-poll, nobody waiting on the screen. Without this trigger the answer
-- would land in ai_jobs and nobody would be told.
--
-- WHAT. When a background ai_query.chat job reaches `done`, `error` or
-- `canceled`, the person who asked (ai_jobs.requested_by — always auth.uid() at enqueue, never
-- caller-supplied) gets ONE in-app notification linking to that conversation:
-- /ai-query?conversation=<id>, which AIQueryContainer reopens on arrival.
--
-- WHAT IT SKIPS.
--   * Every job without payload.background = true — today's foreground chat.
--   * Every job carrying payload.schedule_id — scheduled reports (lane E of the
--     same programme) also set background:true but deliver their own notice;
--     firing here too would tell the person twice.
--   * Any other job_type.
--   * Status changes that are not a TRANSITION into done/error/canceled (a
--     re-write of the same status, or a move to pending/claimed/running).
--
-- NO QUESTION IS LEFT HANGING (repair round 1, 2026-09-23). ai_query.chat is an
-- interactive job type, so fn_ai_requeue_stale (20260724070000) deliberately
-- never touches it, and the route does not wait on (or cancel) a background
-- question. Without a sweep, a background question the answering computers
-- never pick up, or drop half-way, would sit pending/claimed forever: no notice,
-- and one of the person's in-flight slots (fn_ai_enqueue's max_inflight) used
-- for good. fn_ai_query_background_reap(), run by pg_cron every 10 minutes,
-- closes them:
--   * still `pending` after 2 hours           -> `canceled`
--       'The answering computers were offline. Please ask again.'
--   * `claimed`/`running` for over 20 minutes -> `error`
--       'This took too long and was stopped. Please ask again.'
-- Each move fires the trigger above, so the person is told. 20 minutes is well
-- past the longest background budget a runner gives one question (540 s on the
-- Mac standby). Only background, non-scheduled ai_query.chat jobs are touched;
-- a foreground question is never reaped here. A canceled job does not count
-- against the daily cap (fn_ai_enqueue counts status <> 'canceled').
--
-- DELIVERY. A notification needs BOTH a notifications row AND a
-- user_notifications fan-out row — the bell, badge and inbox read the junction
-- (lib/services/_shared/notifications/notify.ts explains why). No shared SQL
-- helper does both for a single user, so the two writes are inline, in the shape
-- of fn_improvement_untriaged_notify (20261202145500), which is proven live.
-- One deterministic idempotency key per job ('ai_query.background|<job id>')
-- so a repeated status write can never send a second notice.
--
-- SAFETY. The drain's status write must never fail because a notice could not
-- be written: the whole body is wrapped in BEGIN … EXCEPTION WHEN OTHERS, and a
-- failure is raised as a WARNING only. AFTER trigger, so it sees the committed
-- row values and cannot change them.
--
-- The existing "while you were away" inbox (fn_ai_chat_inbox / fn_ai_job_ack)
-- is untouched and keeps working: the route does not acknowledge a background
-- job, so its answer also appears in the inbox on the next visit.
--
-- FILE ONLY — not applied here; the orchestrator applies it at merge.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_ai_query_background_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid      uuid := NEW.requested_by;
  v_cid      text := NEW.payload->>'conversation_id';
  v_question text;
  v_ok       boolean;
  v_url      text;
  v_key      text;
  v_title    text;
  v_body     text;
  v_reason   text;
  v_notif    uuid;
BEGIN
  -- The WHEN clause below already filters; re-checked here so the function is
  -- correct on its own if the trigger is ever re-created without it.
  IF NEW.job_type IS DISTINCT FROM 'ai_query.chat'
     OR NEW.status NOT IN ('done', 'error', 'canceled')
     OR OLD.status IS NOT DISTINCT FROM NEW.status
     OR COALESCE(NEW.payload->>'background', '') <> 'true'
     OR NEW.payload ? 'schedule_id' THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- notifications.created_by is NOT NULL and references profiles. The asker
    -- is the natural author; no profile → nobody to tell, send nothing.
    IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid) THEN
      RETURN NEW;
    END IF;

    v_ok := NEW.status = 'done'
            AND COALESCE(btrim(NEW.result->>'answer'), '') <> '';

    -- Link to the conversation when it has a valid id; else the assistant page.
    IF v_cid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_url := '/ai-query?conversation=' || lower(v_cid);
    ELSE
      v_url := '/ai-query';
    END IF;

    -- What they typed, without the "(Asked from the … page, …)" note the Ask
    -- panel adds for the AI. The SAME rule as stripPageNote in
    -- components/ai-query/AskAssistantRules.ts: only a note at the very END of
    -- the message, whose text holds no brackets and no line break (the panel
    -- strips both from the page name and path). Every input below is
    -- COALESCEd: a NULL anywhere in a || chain nulls the whole body, and
    -- notifications.body is NOT NULL.
    v_question := regexp_replace(COALESCE(NEW.payload->>'message', ''),
                                 '\n\n\(Asked from the [^()\n]*\)$', '');
    v_question := btrim(regexp_replace(v_question, '\s+', ' ', 'g'));
    IF length(v_question) > 120 THEN
      v_question := left(v_question, 117) || '...';
    END IF;

    IF v_ok THEN
      v_title := 'Your AI Assistant answer is ready';
      v_body  := CASE WHEN v_question <> ''
                      THEN 'You asked: "' || v_question || '". Open it to read the answer.'
                      ELSE 'Open it to read the answer.' END;
    ELSE
      -- The sweep below writes one of two fixed reasons; say it plainly.
      -- Anything else (a runner's own error text) is never shown to the person.
      v_reason := CASE
        WHEN NEW.error IN ('The answering computers were offline. Please ask again.',
                           'This took too long and was stopped. Please ask again.')
          THEN NEW.error
        ELSE 'Please open the conversation and ask again.' END;
      v_title := 'The AI Assistant could not answer your question';
      v_body  := CASE WHEN v_question <> ''
                      THEN 'You asked: "' || v_question || '". ' || v_reason
                      ELSE v_reason END;
    END IF;

    v_key := 'ai_query.background|' || NEW.id::text;

    INSERT INTO public.notifications
      (title, body, category, kind, targeting, url, priority,
       created_by, expires_at, idempotency_key, metadata)
    VALUES (
      v_title,
      v_body,
      'assistant',
      -- work_item, not announcement: a system-emitted personal notice, kept out
      -- of the human-authored broadcast outbox
      -- (lib/services/notification/sent-service.ts filters on kind).
      'work_item',
      jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(v_uid)),
      v_url,
      'normal',
      v_uid,
      now() + interval '7 days',
      v_key,
      jsonb_build_object(
        'source',          'ai_query.background',
        'job_id',          NEW.id,
        'conversation_id', v_cid,
        'status',          NEW.status
      )
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_notif;

    -- ON CONFLICT DO NOTHING returns no row: resolve from the key so the
    -- junction write still happens if only it was missing.
    IF v_notif IS NULL THEN
      SELECT n.id INTO v_notif FROM public.notifications n WHERE n.idempotency_key = v_key;
    END IF;

    IF v_notif IS NOT NULL THEN
      INSERT INTO public.user_notifications (notification_id, user_id)
      VALUES (v_notif, v_uid)
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[ai_query.background] notice for job % not written: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_ai_query_background_notice() IS
  'AFTER UPDATE trigger on ai_jobs: when a background ai_query.chat job (payload.background = true, '
  'no payload.schedule_id) moves into done, error or canceled, sends the asker ONE in-app notification '
  '(notifications + user_notifications) linking to /ai-query?conversation=<id>. Never blocks the '
  'status write. Added 2026-09-23 (AI Assistant everywhere + background).';

REVOKE EXECUTE ON FUNCTION public.fn_ai_query_background_notice() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_background_notice() FROM authenticated;

DROP TRIGGER IF EXISTS trg_ai_query_background_notice ON public.ai_jobs;
CREATE TRIGGER trg_ai_query_background_notice
  AFTER UPDATE OF status ON public.ai_jobs
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('done', 'error', 'canceled')
    AND NEW.job_type = 'ai_query.chat'
  )
  EXECUTE FUNCTION public.fn_ai_query_background_notice();

-- ---------------------------------------------------------------------------
-- The sweep: close background questions nobody finished (see the header).
-- System-only: pg_cron calls it; nobody signed in can. No auth.uid() inside —
-- it acts on every person's stale background questions, never a caller's own.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_query_background_reap(
  p_pending_minutes integer DEFAULT 120,
  p_running_minutes integer DEFAULT 20
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_offline int;
  v_timeout int;
BEGIN
  -- Never picked up: the answering computers were offline the whole time.
  UPDATE public.ai_jobs j
     SET status       = 'canceled',
         error        = 'The answering computers were offline. Please ask again.',
         completed_at = now()
   WHERE j.job_type = 'ai_query.chat'
     AND j.status   = 'pending'
     AND COALESCE(j.payload->>'background', '') = 'true'
     AND NOT (j.payload ? 'schedule_id')
     AND j.requested_at < now() - make_interval(mins => GREATEST(p_pending_minutes, 30));
  GET DIAGNOSTICS v_offline = ROW_COUNT;

  -- Picked up but never finished: the runner died or ran far past its budget.
  -- A late fn_ai_complete then finds no claimed/running row and changes nothing.
  UPDATE public.ai_jobs j
     SET status       = 'error',
         error        = 'This took too long and was stopped. Please ask again.',
         completed_at = now()
   WHERE j.job_type = 'ai_query.chat'
     AND j.status   IN ('claimed', 'running')
     AND COALESCE(j.payload->>'background', '') = 'true'
     AND NOT (j.payload ? 'schedule_id')
     AND COALESCE(j.claimed_at, j.requested_at)
           < now() - make_interval(mins => GREATEST(p_running_minutes, 10));
  GET DIAGNOSTICS v_timeout = ROW_COUNT;

  RETURN jsonb_build_object('offline', v_offline, 'timed_out', v_timeout);
END;
$function$;

COMMENT ON FUNCTION public.fn_ai_query_background_reap(integer, integer) IS
  'pg_cron sweep (every 10 min): a background ai_query.chat job (payload.background = true, no '
  'payload.schedule_id) still pending after 2 h -> canceled; claimed/running for over 20 min -> error. '
  'Each move fires trg_ai_query_background_notice, so the asker is told and the in-flight slot is '
  'freed. Added 2026-09-23 (repair round 1).';

REVOKE EXECUTE ON FUNCTION public.fn_ai_query_background_reap(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_background_reap(integer, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_background_reap(integer, integer) TO service_role;

-- Every 10 minutes. Guarded on cron.schedule existing: pg_cron is on production
-- (20260716064500 schedules through it) but not on a bare local or CI Postgres,
-- where this degrades to a NOTICE so the file still applies. cron.schedule
-- upserts by job name, so re-applying re-points the same job.
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule(
      'ai-query-background-reap',
      '*/10 * * * *',
      $job$ SELECT public.fn_ai_query_background_reap(); $job$
    );
    RAISE NOTICE 'scheduled ai-query-background-reap every 10 minutes';
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipping schedule for fn_ai_query_background_reap';
  END IF;
END
$$;

-- Apply-time assertions: the trigger exists, the function body carries the
-- two writes, the schedule_id skip and the canceled case, and the sweep is
-- closed to signed-in and anonymous callers, so "CREATE OR REPLACE did not take"
-- cannot read as a clean apply.
DO $$
DECLARE v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ai_query_background_notice'
       AND tgrelid = 'public.ai_jobs'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_ai_query_background_notice missing on public.ai_jobs';
  END IF;

  v_def := pg_get_functiondef('public.fn_ai_query_background_notice()'::regprocedure);
  IF position('user_notifications' IN v_def) = 0
     OR position('schedule_id' IN v_def) = 0
     OR position('ai_query.background|' IN v_def) = 0 THEN
    RAISE EXCEPTION 'fn_ai_query_background_notice body is not the expected version';
  END IF;

  IF has_function_privilege('anon', 'public.fn_ai_query_background_notice()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_ai_query_background_notice';
  END IF;

  IF position('canceled' IN v_def) = 0 THEN
    RAISE EXCEPTION 'fn_ai_query_background_notice does not handle canceled';
  END IF;

  IF has_function_privilege('anon', 'public.fn_ai_query_background_reap(integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ai_query_background_reap(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a signed-in or anonymous caller can execute fn_ai_query_background_reap';
  END IF;
END $$;
