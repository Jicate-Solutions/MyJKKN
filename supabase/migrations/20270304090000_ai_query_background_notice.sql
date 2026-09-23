-- AI Assistant: "Do it in the background" — tell the asker when the answer is ready.
-- ---------------------------------------------------------------------------
-- WHY. A person can now hand a longer question off from the AI Assistant
-- ("Do it in the background"). app/api/ai-query/route.ts enqueues the
-- ai_query.chat job with payload.background = true and returns at once — no
-- long-poll, nobody waiting on the screen. Without this trigger the answer
-- would land in ai_jobs and nobody would be told.
--
-- WHAT. When a background ai_query.chat job reaches `done` or `error`, the
-- person who asked (ai_jobs.requested_by — always auth.uid() at enqueue, never
-- caller-supplied) gets ONE in-app notification linking to that conversation:
-- /ai-query?conversation=<id>, which AIQueryContainer reopens on arrival.
--
-- WHAT IT SKIPS.
--   * Every job without payload.background = true — today's foreground chat.
--   * Every job carrying payload.schedule_id — scheduled reports (lane E of the
--     same programme) also set background:true but deliver their own notice;
--     firing here too would tell the person twice.
--   * Any other job_type.
--   * Status changes that are not a TRANSITION into done/error (a re-write of
--     the same status, or pending/claimed/running/canceled).
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
  v_notif    uuid;
BEGIN
  -- The WHEN clause below already filters; re-checked here so the function is
  -- correct on its own if the trigger is ever re-created without it.
  IF NEW.job_type IS DISTINCT FROM 'ai_query.chat'
     OR NEW.status NOT IN ('done', 'error')
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
    -- panel adds for the AI (components/ai-query/AskAssistantRules.ts). Every
    -- input below is COALESCEd: a NULL anywhere in a || chain nulls the whole
    -- body, and notifications.body is NOT NULL.
    v_question := split_part(COALESCE(NEW.payload->>'message', ''), E'\n\n(Asked from the ', 1);
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
      v_title := 'The AI Assistant could not answer your question';
      v_body  := CASE WHEN v_question <> ''
                      THEN 'You asked: "' || v_question || '". Please open the conversation and ask again.'
                      ELSE 'Please open the conversation and ask again.' END;
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
  'no payload.schedule_id) moves into done or error, sends the asker ONE in-app notification '
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
    AND NEW.status IN ('done', 'error')
    AND NEW.job_type = 'ai_query.chat'
  )
  EXECUTE FUNCTION public.fn_ai_query_background_notice();

-- Apply-time assertions: the trigger exists and the function body carries the
-- two writes and the schedule_id skip, so "CREATE OR REPLACE did not take"
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
END $$;
