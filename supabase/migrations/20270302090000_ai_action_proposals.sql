-- ============================================================================
-- AI Assistant — actions only after the person clicks Confirm (lane B)
-- Created: 2026-09-23
--
-- Director rulings 2026-09-23 18:50 IST: the assistant may send an in-app
-- message or an email, or create a task, but ALWAYS only after the person
-- clicks Confirm on a card that shows exactly who will receive what. Channels
-- are in-app + email (not WhatsApp).
--
-- HOW IT FITS TOGETHER
--   1. The answering computer (the scoped chat drain) calls
--      ai_rpc_propose_action AS the asking person. It validates, resolves the
--      recipients the person can actually see, checks the person holds the
--      SAME permission the normal screen needs, and stores a PENDING proposal.
--      It never sends anything.
--   2. The /ai-query page shows the proposal as a card under the answer
--      (fn_ai_my_action_proposals, owner-only).
--   3. Confirm → POST /api/ai-query/actions/[id]/confirm → the route calls
--      fn_ai_claim_action_proposal under the person's own session. The claim
--      locks the row, re-checks everything at click time (still pending, not
--      expired, permission still held, recipients still visible, daily limit)
--      and stamps confirmed_at — a second click finds confirmed_at set and is
--      refused, so a double click can never send twice. Only then does the
--      route execute and record the result.
--      Cancel → fn_ai_cancel_action_proposal.
--
-- The older action RPCs ai_rpc_send_notification / ai_rpc_bulk_notification
-- are deliberately NOT exposed here (they still need accessible_scope repair).
--
-- FILE ONLY — applied by the orchestrator at merge time, never from a lane.
-- Every SECURITY DEFINER function below pins identity to auth.uid(), sets
-- search_path = public, and is revoked from anon and PUBLIC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The proposals table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_action_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id  uuid,
  job_id           uuid,
  kind             text NOT NULL CHECK (kind IN ('in_app_message', 'email', 'create_task')),
  title            text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body             text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  -- Resolved at propose time: [{profile_id, display_name, has_email}]. Never
  -- carries an email address — the card shows names only.
  recipients       jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipient_count  integer NOT NULL DEFAULT 0 CHECK (recipient_count BETWEEN 0 AND 200),
  -- create_task only: {project_id, project_title, due_date}
  task             jsonb,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'expired')),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  confirmed_at     timestamptz,
  executed_at      timestamptz,
  result           jsonb,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_action_proposals IS
  'Actions the AI Assistant PROPOSED (in-app message, email, task). Nothing is sent until the owner clicks Confirm; the confirm route claims the row through fn_ai_claim_action_proposal (re-checks at click time, stamps confirmed_at so a double click cannot send twice). Owner-only reads; no direct writes for authenticated.';
COMMENT ON COLUMN public.ai_action_proposals.confirmed_at IS
  'Set once, under a row lock, by fn_ai_claim_action_proposal. Non-null while status is still pending means the route is executing (or died mid-execution).';

CREATE INDEX IF NOT EXISTS ai_action_proposals_owner_conv_idx
  ON public.ai_action_proposals (requested_by, conversation_id);
CREATE INDEX IF NOT EXISTS ai_action_proposals_owner_job_idx
  ON public.ai_action_proposals (requested_by, job_id);
CREATE INDEX IF NOT EXISTS ai_action_proposals_owner_confirmed_idx
  ON public.ai_action_proposals (requested_by, confirmed_at)
  WHERE confirmed_at IS NOT NULL;

ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_action_proposals_select_own ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_select_own ON public.ai_action_proposals
  FOR SELECT TO authenticated
  USING (requested_by = (SELECT auth.uid()));
-- Deliberately NO insert / update / delete policy: every write goes through the
-- SECURITY DEFINER functions below or the service-role confirm route.

REVOKE ALL ON public.ai_action_proposals FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_action_proposals FROM authenticated;
GRANT SELECT ON public.ai_action_proposals TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Internal helpers (not callable by any API role)
-- ----------------------------------------------------------------------------

-- Does the CURRENT caller (auth.uid()) hold the permission the normal screen
-- requires for this kind of action?
--   in_app_message, email → notifications.create OR notifications.send
--     (the exact check app/api/notifications/send/route.ts makes; super
--     admins pass through user_has_permission's own bypass)
--   create_task           → projects.view (the gate on /projects, whose
--     project_tasks write policy admits any signed-in person)
CREATE OR REPLACE FUNCTION public.fn_ai_action_kind_allowed(p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'in_app_message' THEN public.user_has_permission('notifications.create')
                            OR public.user_has_permission('notifications.send')
    WHEN 'email'          THEN public.user_has_permission('notifications.create')
                            OR public.user_has_permission('notifications.send')
    WHEN 'create_task'    THEN public.user_has_permission('projects.view')
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_action_kind_allowed(text) FROM anon, PUBLIC, authenticated;

-- The people the CURRENT caller may address: learner ids resolve to their
-- login profile through profiles.learner_id; profile ids are taken as given.
-- A person is visible when the caller is a super admin, or the caller's role
-- reaches that person's institution (role_has_institution_access). Only
-- active accounts. One row per distinct profile.
CREATE OR REPLACE FUNCTION public.fn_ai_action_visible_recipients(
  p_learner_ids uuid[],
  p_profile_ids uuid[]
)
RETURNS TABLE (profile_id uuid, display_name text, has_email boolean, staff_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (p.id)
         p.id,
         COALESCE(NULLIF(btrim(p.full_name), ''), 'Unnamed person'),
         (p.email IS NOT NULL AND btrim(p.email) <> ''),
         (SELECT s.id FROM public.staff s WHERE s.profile_id = p.id ORDER BY s.id LIMIT 1)
    FROM public.profiles p
   WHERE (p.id = ANY (COALESCE(p_profile_ids, '{}'::uuid[]))
          OR p.learner_id = ANY (COALESCE(p_learner_ids, '{}'::uuid[])))
     AND p.is_active IS TRUE
     AND (public.is_super_admin()
          OR (p.institution_id IS NOT NULL AND public.role_has_institution_access(p.institution_id)))
   ORDER BY p.id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_action_visible_recipients(uuid[], uuid[]) FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- 3. ai_rpc_propose_action — store a PENDING proposal; never sends anything
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_rpc_propose_action(
  p_kind            text,
  p_title           text,
  p_body            text,
  p_learner_ids     uuid[] DEFAULT NULL,
  p_profile_ids     uuid[] DEFAULT NULL,
  p_project_id      uuid   DEFAULT NULL,
  p_due_date        date   DEFAULT NULL,
  p_conversation_id uuid   DEFAULT NULL,
  p_job_id          uuid   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_kind         text := lower(btrim(COALESCE(p_kind, '')));
  v_title        text := btrim(COALESCE(p_title, ''));
  v_body         text := btrim(COALESCE(p_body, ''));
  v_requested    int  := COALESCE(cardinality(p_learner_ids), 0) + COALESCE(cardinality(p_profile_ids), 0);
  v_recipients   jsonb;
  v_count        int;
  v_visible      int;
  v_no_email     int := 0;
  v_no_staff     int := 0;
  v_task         jsonb;
  v_project      text;
  v_job_id       uuid;
  v_job_conv     text;
  v_conversation uuid;
  v_today        int;
  v_id           uuid;
  v_names        text;
  v_kind_label   text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Sign in required.'));
  END IF;

  IF v_kind NOT IN ('in_app_message', 'email', 'create_task') THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'INVALID_KIND',
        'message', 'kind must be in_app_message, email or create_task.'));
  END IF;

  IF NOT public.fn_ai_action_kind_allowed(v_kind) THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'PERMISSION_DENIED',
        'message', CASE v_kind
          WHEN 'create_task' THEN 'This person cannot create project tasks on MyJKKN, so the assistant cannot either.'
          ELSE 'This person cannot send notifications on MyJKKN, so the assistant cannot send messages for them.'
        END));
  END IF;

  IF char_length(v_title) NOT BETWEEN 1 AND 200 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'INVALID_TITLE', 'message', 'A title of 1 to 200 characters is required.'));
  END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 5000 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'INVALID_BODY', 'message', 'The message text must be 1 to 5000 characters.'));
  END IF;

  IF v_requested = 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'NO_RECIPIENTS', 'message', 'Name at least one person (learner ids or profile ids).'));
  END IF;
  IF v_requested > 200 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'TOO_MANY_RECIPIENTS',
        'message', 'At most 200 people per action. Split it into smaller groups.'));
  END IF;

  -- At most 50 proposals per person per day (IST), so a looping answer cannot
  -- fill the table. Proposals send nothing; this is housekeeping, not safety.
  SELECT count(*) INTO v_today
    FROM public.ai_action_proposals
   WHERE requested_by = v_uid
     AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');
  IF v_today >= 50 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'PROPOSAL_LIMIT', 'message', 'Too many actions proposed today. Try again tomorrow.'));
  END IF;

  -- Resolve only the people this caller can see.
  WITH r AS (
    SELECT * FROM public.fn_ai_action_visible_recipients(p_learner_ids, p_profile_ids)
  ), usable AS (
    SELECT * FROM r
     WHERE (v_kind <> 'email' OR has_email)
       AND (v_kind <> 'create_task' OR staff_id IS NOT NULL)
  )
  SELECT (SELECT count(*) FROM r),
         (SELECT count(*) FROM r WHERE NOT has_email),
         (SELECT count(*) FROM r WHERE staff_id IS NULL),
         (SELECT count(*) FROM usable),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'profile_id', profile_id,
                     'display_name', display_name,
                     'has_email', has_email) ORDER BY display_name, profile_id)
                     FROM usable), '[]'::jsonb)
    INTO v_visible, v_no_email, v_no_staff, v_count, v_recipients;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'NO_VISIBLE_RECIPIENTS',
        'message', CASE
          WHEN v_visible > 0 AND v_kind = 'email' THEN 'None of these people has an email address on MyJKKN.'
          WHEN v_visible > 0 AND v_kind = 'create_task' THEN 'Tasks can only be given to staff members, and none of these people is one.'
          ELSE 'None of these people could be found among the people this person can reach.'
        END));
  END IF;

  IF v_kind = 'create_task' THEN
    IF v_count <> 1 THEN
      RETURN jsonb_build_object('success', false,
        'error', jsonb_build_object('code', 'ONE_ASSIGNEE',
          'message', 'A task goes to exactly one staff member. Propose one task per person.'));
    END IF;
    IF p_project_id IS NULL THEN
      RETURN jsonb_build_object('success', false,
        'error', jsonb_build_object('code', 'PROJECT_REQUIRED',
          'message', 'A task belongs to a project. Ask which project, then pass p_project_id.'));
    END IF;
    SELECT pr.title INTO v_project FROM public.projects pr WHERE pr.id = p_project_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false,
        'error', jsonb_build_object('code', 'PROJECT_NOT_FOUND', 'message', 'That project does not exist.'));
    END IF;
    v_task := jsonb_build_object('project_id', p_project_id, 'project_title', v_project, 'due_date', p_due_date);
  END IF;

  -- Tie the proposal to the question being answered, so the card appears under
  -- that answer. An explicit job id is honoured only when it is the caller's
  -- own; otherwise the caller's chat job currently being answered is used.
  IF p_job_id IS NOT NULL THEN
    SELECT j.id, j.payload->>'conversation_id' INTO v_job_id, v_job_conv
      FROM public.ai_jobs j
     WHERE j.id = p_job_id AND j.requested_by = v_uid;
  END IF;
  IF v_job_id IS NULL THEN
    SELECT j.id, j.payload->>'conversation_id' INTO v_job_id, v_job_conv
      FROM public.ai_jobs j
     WHERE j.requested_by = v_uid
       AND j.job_type = 'ai_query.chat'
       AND j.status IN ('claimed', 'running')
     ORDER BY COALESCE(j.started_at, j.claimed_at, j.requested_at) DESC
     LIMIT 1;
  END IF;
  v_conversation := COALESCE(
    CASE WHEN v_job_conv ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN v_job_conv::uuid END,
    p_conversation_id);

  INSERT INTO public.ai_action_proposals
    (requested_by, conversation_id, job_id, kind, title, body, recipients, recipient_count, task)
  VALUES
    (v_uid, v_conversation, v_job_id, v_kind, v_title, v_body, v_recipients, v_count, v_task)
  RETURNING id INTO v_id;

  SELECT string_agg(e->>'display_name', ', ')
    INTO v_names
    FROM (SELECT e FROM jsonb_array_elements(v_recipients) e LIMIT 10) s;

  v_kind_label := CASE v_kind
    WHEN 'in_app_message' THEN 'an in-app message'
    WHEN 'email' THEN 'an email'
    ELSE 'a task'
  END;

  RETURN jsonb_build_object(
    'success', true,
    'proposal_id', v_id,
    'status', 'pending',
    'recipient_count', v_count,
    'skipped', jsonb_build_object(
      'not_reachable', GREATEST(v_requested - v_visible, 0),
      'no_email', CASE WHEN v_kind = 'email' THEN v_no_email ELSE 0 END,
      'not_staff', CASE WHEN v_kind = 'create_task' THEN v_no_staff ELSE 0 END),
    'summary',
      'NOTHING HAS BEEN SENT. Prepared ' || v_kind_label || ' "' || v_title || '" for '
      || v_count || CASE WHEN v_count = 1 THEN ' person' ELSE ' people' END
      || ' (' || COALESCE(v_names, '') || CASE WHEN v_count > 10 THEN ', and ' || (v_count - 10) || ' more' ELSE '' END || ')'
      || CASE WHEN v_task IS NOT NULL THEN ' in project "' || v_project || '"' ELSE '' END
      || '. Tell the person to review the card under this answer and click Confirm to send it, or Cancel. It expires in 24 hours.'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_propose_action(text, text, text, uuid[], uuid[], uuid, date, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_propose_action(text, text, text, uuid[], uuid[], uuid, date, uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. fn_ai_my_action_proposals — the caller's own proposals for the cards
-- ----------------------------------------------------------------------------
-- p_job_id is an addition to the lane spec's single argument: the chat bubble
-- knows its answer's job id, not the conversation id, so the card looks
-- proposals up by either. Both NULL returns nothing (never "everything").
-- effective_status turns a pending row past its expiry into 'expired' and a
-- claimed-but-unfinished row into 'sending', without writing anything.
CREATE OR REPLACE FUNCTION public.fn_ai_my_action_proposals(
  p_conversation_id uuid,
  p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  job_id uuid,
  kind text,
  title text,
  body text,
  recipients jsonb,
  recipient_count integer,
  task jsonb,
  status text,
  effective_status text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.conversation_id, a.job_id, a.kind, a.title, a.body, a.recipients,
         a.recipient_count, a.task, a.status,
         CASE
           WHEN a.status = 'pending' AND a.confirmed_at IS NOT NULL THEN 'sending'
           WHEN a.status = 'pending' AND a.expires_at <= now() THEN 'expired'
           ELSE a.status
         END,
         a.expires_at, a.confirmed_at, a.executed_at, a.result, a.error, a.created_at
    FROM public.ai_action_proposals a
   WHERE a.requested_by = auth.uid()
     AND auth.uid() IS NOT NULL
     AND ((p_conversation_id IS NOT NULL AND a.conversation_id = p_conversation_id)
          OR (p_job_id IS NOT NULL AND a.job_id = p_job_id))
   ORDER BY a.created_at;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_my_action_proposals(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_my_action_proposals(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. fn_ai_claim_action_proposal — the click-time gate (called by the route
--    under the owner's session, BEFORE anything is sent)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_claim_action_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  r           public.ai_action_proposals%ROWTYPE;
  v_ids       uuid[];
  v_still     int;
  v_confirmed int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'Sign in required.');
  END IF;

  -- One confirm at a time per person, so the daily limit cannot be raced by
  -- confirming two different cards at the same instant.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_action_proposals:' || v_uid::text, 0));

  SELECT * INTO r
    FROM public.ai_action_proposals
   WHERE id = p_proposal_id AND requested_by = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    -- Someone else's proposal reads exactly like a missing one.
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'This action was not found.');
  END IF;

  IF r.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CONFIRMED',
      'status', r.status, 'message', 'This action was already confirmed.');
  END IF;
  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_PENDING',
      'status', r.status, 'message', 'This action is ' || r.status || ' and cannot be confirmed.');
  END IF;
  IF r.expires_at <= now() THEN
    UPDATE public.ai_action_proposals
       SET status = 'expired', error = 'Expired before it was confirmed.', updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', false, 'code', 'EXPIRED', 'status', 'expired',
      'message', 'This action expired. Ask the assistant again.');
  END IF;

  IF NOT public.fn_ai_action_kind_allowed(r.kind) THEN
    UPDATE public.ai_action_proposals
       SET status = 'failed', error = 'You no longer have permission to do this.', updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', false, 'code', 'PERMISSION_DENIED', 'status', 'failed',
      'message', 'You no longer have permission to do this.');
  END IF;

  -- Every person on the card must still be someone this caller can reach
  -- (and, for email, still have an address; for a task, still be staff).
  SELECT array_agg((e->>'profile_id')::uuid) INTO v_ids
    FROM jsonb_array_elements(r.recipients) e;
  SELECT count(*) INTO v_still
    FROM public.fn_ai_action_visible_recipients(NULL, v_ids) v
   WHERE (r.kind <> 'email' OR v.has_email)
     AND (r.kind <> 'create_task' OR v.staff_id IS NOT NULL);
  IF v_still <> COALESCE(cardinality(v_ids), 0) OR v_still = 0 THEN
    UPDATE public.ai_action_proposals
       SET status = 'failed',
           error = 'Some people on this card are no longer reachable by you. Nothing was sent.',
           updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', false, 'code', 'RECIPIENTS_CHANGED', 'status', 'failed',
      'message', 'Some people on this card are no longer reachable by you. Nothing was sent.');
  END IF;

  IF r.kind = 'create_task' AND NOT EXISTS (
       SELECT 1 FROM public.projects pr WHERE pr.id = (r.task->>'project_id')::uuid) THEN
    UPDATE public.ai_action_proposals
       SET status = 'failed', error = 'The project no longer exists. Nothing was created.', updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', false, 'code', 'PROJECT_NOT_FOUND', 'status', 'failed',
      'message', 'The project no longer exists. Nothing was created.');
  END IF;

  -- 20 confirmed actions per person per day (IST). The card stays pending, so
  -- it can still be confirmed tomorrow before it expires.
  SELECT count(*) INTO v_confirmed
    FROM public.ai_action_proposals
   WHERE requested_by = v_uid
     AND confirmed_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');
  IF v_confirmed >= 20 THEN
    RETURN jsonb_build_object('success', false, 'code', 'DAILY_LIMIT', 'status', 'pending',
      'message', 'You have confirmed 20 assistant actions today, the daily limit. Try again tomorrow.');
  END IF;

  UPDATE public.ai_action_proposals
     SET confirmed_at = now(), updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object(
    'success', true,
    'proposal', jsonb_build_object(
      'id', r.id,
      'kind', r.kind,
      'title', r.title,
      'body', r.body,
      'task', r.task,
      'recipient_ids', to_jsonb(v_ids),
      'recipient_count', r.recipient_count));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_claim_action_proposal(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_claim_action_proposal(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. fn_ai_cancel_action_proposal — owner cancels a card that is not confirmed
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_cancel_action_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  r     public.ai_action_proposals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'Sign in required.');
  END IF;

  SELECT * INTO r
    FROM public.ai_action_proposals
   WHERE id = p_proposal_id AND requested_by = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'This action was not found.');
  END IF;
  IF r.status <> 'pending' OR r.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_PENDING',
      'status', CASE WHEN r.status = 'pending' THEN 'sending' ELSE r.status END,
      'message', 'This action can no longer be cancelled.');
  END IF;

  UPDATE public.ai_action_proposals
     SET status = 'cancelled', updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_cancel_action_proposal(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_cancel_action_proposal(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. SHARED AI TOOL CATALOG — verbatim block shared with lanes A and C
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_tool_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('rpc','http')),
  target text NOT NULL,
  description text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_write boolean NOT NULL DEFAULT false,
  audience text[] NOT NULL DEFAULT ARRAY['assistant','door']::text[],
  requires_permission text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_tool_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_tool_catalog FROM anon, authenticated, PUBLIC;
COMMENT ON TABLE public.ai_tool_catalog IS 'One list of AI tools read by the assistant''s answering computers (audience assistant) and the outside-AI MCP door (audience door). rpc = public function called AS the person; http = path on www.jkkn.ai called with the person''s own access token.';

-- propose_action: assistant only, never the outside-AI door. is_write = false
-- because the call itself writes only a pending card; the send happens on the
-- person's own Confirm click.
INSERT INTO public.ai_tool_catalog (name, kind, target, description, params, is_write, audience, requires_permission)
VALUES (
  'propose_action',
  'rpc',
  'ai_rpc_propose_action',
  'Use this whenever the person asks you to send, remind, notify, message, email or assign something to other people. '
  || 'It does NOT send anything: it prepares a card that shows exactly who will receive what, and the person must click Confirm on that card. '
  || 'Never say or imply that anything was sent, emailed or assigned. After calling it, tell the person to review the card under your answer and click Confirm or Cancel. '
  || 'Kinds: in_app_message (MyJKKN notification), email (sent from MyJKKN on the person''s behalf, replies go to them), create_task (one staff member, one project task; ask which project first). '
  || 'Pass learner ids in p_learner_ids and staff/other people''s profile ids in p_profile_ids (at most 200 in total). People the person cannot reach on MyJKKN are left out and counted in "skipped"; mention that. '
  || 'If the call returns success:false, explain the message plainly and do not retry with a different kind to get around a permission refusal.',
  jsonb_build_object(
    'type', 'object',
    'additionalProperties', false,
    'required', jsonb_build_array('p_kind', 'p_title', 'p_body'),
    'properties', jsonb_build_object(
      'p_kind', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('in_app_message', 'email', 'create_task'),
        'description', 'What to do: an in-app message, an email, or a project task.'),
      'p_title', jsonb_build_object('type', 'string', 'minLength', 1, 'maxLength', 200,
        'description', 'Notification title, email subject, or task title.'),
      'p_body', jsonb_build_object('type', 'string', 'minLength', 1, 'maxLength', 5000,
        'description', 'The full message text, or the task description. Plain text.'),
      'p_learner_ids', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'description', 'learners_profiles ids of learners to address.'),
      'p_profile_ids', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'description', 'profiles ids of staff or other people to address.'),
      'p_project_id', jsonb_build_object('type', 'string', 'format', 'uuid',
        'description', 'create_task only: the project the task belongs to (required for create_task).'),
      'p_due_date', jsonb_build_object('type', 'string', 'format', 'date',
        'description', 'create_task only: optional due date, YYYY-MM-DD.'),
      'p_conversation_id', jsonb_build_object('type', 'string', 'format', 'uuid',
        'description', 'Optional: the conversation_id from the job payload.'),
      'p_job_id', jsonb_build_object('type', 'string', 'format', 'uuid',
        'description', 'Optional: the ai_jobs id of the question being answered. When omitted, the person''s chat question currently being answered is used.')
    )
  ),
  false,
  ARRAY['assistant']::text[],
  NULL
)
ON CONFLICT (name) DO UPDATE SET
  kind = EXCLUDED.kind,
  target = EXCLUDED.target,
  description = EXCLUDED.description,
  params = EXCLUDED.params,
  is_write = EXCLUDED.is_write,
  audience = EXCLUDED.audience,
  requires_permission = EXCLUDED.requires_permission,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 8. Apply-time assertions — a CREATE OR REPLACE that did not take, or a grant
--    that leaked to anon, fails the apply instead of reading as clean.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_fn text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_action_proposals'::regclass) THEN
    RAISE EXCEPTION 'ai_action_proposals: RLS is not enabled';
  END IF;
  IF has_table_privilege('anon', 'public.ai_action_proposals', 'SELECT') THEN
    RAISE EXCEPTION 'ai_action_proposals: anon can SELECT';
  END IF;
  IF has_table_privilege('authenticated', 'public.ai_action_proposals', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_action_proposals', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ai_action_proposals', 'DELETE') THEN
    RAISE EXCEPTION 'ai_action_proposals: authenticated can write directly';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.ai_rpc_propose_action(text, text, text, uuid[], uuid[], uuid, date, uuid, uuid)',
    'public.fn_ai_my_action_proposals(uuid, uuid)',
    'public.fn_ai_claim_action_proposal(uuid)',
    'public.fn_ai_cancel_action_proposal(uuid)',
    'public.fn_ai_action_kind_allowed(text)',
    'public.fn_ai_action_visible_recipients(uuid[], uuid[])'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon', v_fn;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.fn_ai_action_visible_recipients(uuid[], uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ai_action_kind_allowed(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'internal ai action helpers are executable by authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_tool_catalog
     WHERE name = 'propose_action'
       AND target = 'ai_rpc_propose_action'
       AND audience = ARRAY['assistant']::text[]
  ) THEN
    RAISE EXCEPTION 'ai_tool_catalog: propose_action row missing or exposed beyond the assistant';
  END IF;
END
$assert$;
