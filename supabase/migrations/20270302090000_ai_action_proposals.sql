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
--   4. A card stuck in "Sending…" (confirmed, but the route died before it
--      could record the outcome) is closed as failed after 10 minutes by
--      fn_ai_action_proposals_fail_stuck, run every 5 minutes by pg_cron.
--
-- The two OWNER-ONLY functions (fn_ai_my_action_proposals,
-- fn_ai_cancel_action_proposal) live in the NEXT migration,
-- 20270302090100_ai_action_proposals_owner_only.sql, which carries the
-- secdef-authenticated marker on its own. Repair round 1 split them out so the
-- scanner keeps checking THIS file: ai_rpc_propose_action and
-- fn_ai_claim_action_proposal must keep their permission check
-- (fn_ai_action_can_perform → user_has_permission), and an edit that drops it
-- now fails CI instead of passing under a file-wide marker.
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
  -- Resolved at propose time: [{profile_id, display_name, has_email, college,
  -- role, id_label, id_number}] — enough for the card to tell two people with
  -- the same name apart. Never carries an email address.
  recipients       jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipient_count  integer NOT NULL DEFAULT 0 CHECK (recipient_count BETWEEN 0 AND 200),
  -- create_task only: {project_id, project_title, due_date}
  task             jsonb,
  -- email only: the "sent on behalf of" line appended under the message. It is
  -- fixed at propose time and stored, so the card shows EXACTLY the text that
  -- will be emailed, and the send uses this stored line, never a recomputed one.
  email_footer     text,
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
  'Set once, under a row lock, by fn_ai_claim_action_proposal. Non-null while status is still pending means the route is executing (or died mid-execution); fn_ai_action_proposals_fail_stuck closes such a row as failed after 10 minutes.';

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
--   in_app_message → notifications.create OR notifications.send (the exact
--     check app/api/notifications/send/route.ts makes; super admins pass
--     through user_has_permission's own bypass)
--   email          → notifications.send ONLY. No normal screen emails an
--     arbitrary colleague or learner, so email is new capability; the Director
--     chose it (2026-09-23) and it takes the stronger of the two keys.
--   create_task    → projects.view (the gate on /projects). Being able to open
--     /projects is not enough on its own: ai_rpc_propose_action and the claim
--     also require the person to be on THAT project (fn_ai_action_project_staff).
CREATE OR REPLACE FUNCTION public.fn_ai_action_can_perform(p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'in_app_message' THEN public.user_has_permission('notifications.create')
                            OR public.user_has_permission('notifications.send')
    WHEN 'email'          THEN public.user_has_permission('notifications.send')
    WHEN 'create_task'    THEN public.user_has_permission('projects.view')
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_action_can_perform(text) FROM anon, PUBLIC, authenticated;

-- Is this person on this project? Returns the person's team-member (staff)
-- row that is the project's owner (projects.owner_staff_id) or a member
-- (project_members, any role except 'viewer', which is read-only), owner first;
-- NULL when the person is not on the project. Used for BOTH the person asking
-- (no dropping tasks into projects you do not belong to) and the assignee (a
-- task only goes to someone on the project), at propose time and again at the
-- Confirm click.
CREATE OR REPLACE FUNCTION public.fn_ai_action_project_staff(p_project_id uuid, p_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT x.staff_id
    FROM (
      SELECT pr.owner_staff_id AS staff_id, 0 AS rank
        FROM public.projects pr
        JOIN public.staff s ON s.id = pr.owner_staff_id
       WHERE pr.id = p_project_id AND s.profile_id = p_profile_id
      UNION ALL
      SELECT pm.staff_id, 1
        FROM public.project_members pm
        JOIN public.staff s ON s.id = pm.staff_id
       WHERE pm.project_id = p_project_id AND s.profile_id = p_profile_id
         AND COALESCE(pm.role, 'member') <> 'viewer'
    ) x
   WHERE p_project_id IS NOT NULL AND p_profile_id IS NOT NULL
   ORDER BY x.rank, x.staff_id
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_action_project_staff(uuid, uuid) FROM anon, PUBLIC, authenticated;

-- The people the CURRENT caller may address: learner ids resolve to their
-- login profile through profiles.learner_id; profile ids are taken as given.
-- A person is visible when the caller is a super admin, or the caller's role
-- reaches that person's institution (role_has_institution_access). Only
-- active accounts. One row per distinct profile.
--
-- Each row also carries what the card needs to tell people apart: college,
-- role, and an identifier. A learner always reads "Learner". Other roles show
-- their Role Management name with the JKKN zero-tolerance people words
-- rewritten (.claude/skills/jkkn-terminologies): the learner words become
-- Learner, the teaching words (production's faculty role is named
-- "Facilitator") become Senior Learner, and staff / employees / workers become
-- Team member. The identifier is —
-- register number, else roll number, for a learner; employee number
-- (staff.staff_id) for a team member. A blank name reads "No name on file",
-- never silently collapsed.
CREATE OR REPLACE FUNCTION public.fn_ai_action_visible_recipients(
  p_learner_ids uuid[],
  p_profile_ids uuid[]
)
RETURNS TABLE (
  profile_id   uuid,
  learner_id   uuid,
  display_name text,
  has_email    boolean,
  staff_id     uuid,
  college      text,
  role_label   text,
  id_label     text,
  id_number    text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (p.id)
         p.id,
         p.learner_id,
         COALESCE(NULLIF(btrim(p.full_name), ''), 'No name on file'),
         (p.email IS NOT NULL AND btrim(p.email) <> ''),
         st.id,
         COALESCE(NULLIF(btrim(i.display_name), ''), NULLIF(btrim(i.name), ''), 'No college on file'),
         CASE
           WHEN p.learner_id IS NOT NULL THEN 'Learner'
           ELSE regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      COALESCE(NULLIF(btrim(cr.role_name), ''),
                               initcap(replace(NULLIF(btrim(p.role), ''), '_', ' ')),
                               'No role on file'),
                      '\m(students?|pupils?|trainees?)\M', 'Learner', 'gi'),
                    '\m(learning facilitators?|facilitators?|faculty|teachers?|professors?|instructors?|tutors?|educators?)\M',
                    'Senior Learner', 'gi'),
                  '\m(staff|employees|workers)\M', 'Team member', 'gi')
         END,
         CASE
           WHEN NULLIF(btrim(lp.register_number), '') IS NOT NULL THEN 'Register no.'
           WHEN NULLIF(btrim(lp.roll_number), '') IS NOT NULL THEN 'Roll no.'
           WHEN NULLIF(btrim(st.staff_code), '') IS NOT NULL THEN 'Employee no.'
         END,
         COALESCE(NULLIF(btrim(lp.register_number), ''),
                  NULLIF(btrim(lp.roll_number), ''),
                  NULLIF(btrim(st.staff_code), ''))
    FROM public.profiles p
    LEFT JOIN public.institutions i ON i.id = p.institution_id
    LEFT JOIN public.custom_roles cr ON cr.role_key = p.role
    LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN LATERAL (
      SELECT s.id, s.staff_id AS staff_code
        FROM public.staff s
       WHERE s.profile_id = p.id
       ORDER BY s.id
       LIMIT 1
    ) st ON true
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
  -- Distinct ids as asked for. The same id twice, or a learner id plus that
  -- learner's own profile id, is ONE person and must never be reported as
  -- "not reachable" (repair round 1: the raw count overstated it).
  v_req_profiles uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_profile_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  v_req_learners uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_learner_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  v_requested    int;
  v_recipients   jsonb;
  v_count        int;
  v_unreached    int;
  v_no_email     int := 0;
  v_no_member    int := 0;
  v_task         jsonb;
  v_project      text;
  v_job_id       uuid;
  v_job_conv     text;
  v_conversation uuid;
  v_today        int;
  v_id           uuid;
  v_names        text;
  v_kind_label   text;
  v_owner_name   text;
  v_owner_email  text;
  v_footer       text;
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

  IF NOT public.fn_ai_action_can_perform(v_kind) THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'PERMISSION_DENIED',
        'message', CASE v_kind
          WHEN 'create_task' THEN 'This person cannot create project tasks on MyJKKN, so the assistant cannot either.'
          WHEN 'email' THEN 'This person cannot send notifications on MyJKKN (the send permission), so the assistant cannot email for them.'
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

  v_requested := cardinality(v_req_profiles) + cardinality(v_req_learners);
  IF v_requested = 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'NO_RECIPIENTS', 'message', 'Name at least one person (learner ids or profile ids).'));
  END IF;
  IF v_requested > 200 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'TOO_MANY_RECIPIENTS',
        'message', 'At most 200 people per action. Split it into smaller groups.'));
  END IF;

  -- The card must appear under the answer being written, or nobody could ever
  -- confirm or cancel it. An explicit job id is honoured only when it is the
  -- caller's own; otherwise the caller's chat question currently being answered
  -- is used. When neither exists, REFUSE — never store a card no screen shows
  -- (repair round 1: an unreachable "orphan" card was possible before).
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
  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'NO_ANSWER_TO_ATTACH',
        'message', 'The assistant can prepare this only while it is answering one of this person''s questions, so the card has an answer to appear under. Nothing was prepared.'));
  END IF;
  v_conversation := COALESCE(
    CASE WHEN v_job_conv ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN v_job_conv::uuid END,
    p_conversation_id);

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

  -- A task: the person asking must be on the project before anyone is resolved.
  IF v_kind = 'create_task' THEN
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
    IF public.fn_ai_action_project_staff(p_project_id, v_uid) IS NULL THEN
      RETURN jsonb_build_object('success', false,
        'error', jsonb_build_object('code', 'NOT_ON_PROJECT',
          'message', 'This person is not the owner or a member of the project "' || v_project
            || '", so the assistant cannot add tasks to it. Only people on a project can add its tasks.'));
    END IF;
  END IF;

  -- Resolve only the people this caller can see.
  WITH r AS (
    SELECT v.*,
           CASE WHEN v_kind = 'create_task'
                THEN public.fn_ai_action_project_staff(p_project_id, v.profile_id) END AS project_staff
      FROM public.fn_ai_action_visible_recipients(v_req_learners, v_req_profiles) v
  ), usable AS (
    SELECT * FROM r
     WHERE (v_kind <> 'email' OR has_email)
       AND (v_kind <> 'create_task' OR project_staff IS NOT NULL)
  )
  SELECT (SELECT count(*) FROM unnest(v_req_profiles) x WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.profile_id = x))
         + (SELECT count(*) FROM unnest(v_req_learners) x WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.learner_id = x)),
         (SELECT count(*) FROM r WHERE NOT has_email),
         (SELECT count(*) FROM r WHERE project_staff IS NULL),
         (SELECT count(*) FROM usable),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'profile_id', profile_id,
                     'display_name', display_name,
                     'has_email', has_email,
                     'college', college,
                     'role', role_label,
                     'id_label', id_label,
                     'id_number', id_number) ORDER BY display_name, profile_id)
                     FROM usable), '[]'::jsonb)
    INTO v_unreached, v_no_email, v_no_member, v_count, v_recipients;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'NO_VISIBLE_RECIPIENTS',
        'message', CASE
          WHEN v_unreached < v_requested AND v_kind = 'email' THEN 'None of these people has an email address on MyJKKN.'
          WHEN v_unreached < v_requested AND v_kind = 'create_task'
            THEN 'A task can only go to a team member who is the owner or a member of the project "' || v_project || '", and none of these people is.'
          ELSE 'None of these people could be found among the people this person can reach.'
        END));
  END IF;

  IF v_kind = 'create_task' THEN
    IF v_count <> 1 THEN
      RETURN jsonb_build_object('success', false,
        'error', jsonb_build_object('code', 'ONE_ASSIGNEE',
          'message', 'A task goes to exactly one team member. Propose one task per person.'));
    END IF;
    v_task := jsonb_build_object('project_id', p_project_id, 'project_title', v_project, 'due_date', p_due_date);
  END IF;

  -- Email: the "sent on behalf of" line is fixed now and stored, so the card
  -- shows exactly what will be sent.
  IF v_kind = 'email' THEN
    SELECT NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.email), '')
      INTO v_owner_name, v_owner_email
      FROM public.profiles p WHERE p.id = v_uid;
    v_owner_name := COALESCE(v_owner_name, 'a MyJKKN colleague');
    v_footer := 'Sent on behalf of ' || v_owner_name || ' through MyJKKN.'
      || CASE WHEN v_owner_email IS NOT NULL
              THEN ' Reply to this email to reach ' || v_owner_name || ' directly.'
              ELSE '' END;
  END IF;

  INSERT INTO public.ai_action_proposals
    (requested_by, conversation_id, job_id, kind, title, body, recipients, recipient_count, task, email_footer)
  VALUES
    (v_uid, v_conversation, v_job_id, v_kind, v_title, v_body, v_recipients, v_count, v_task, v_footer)
  RETURNING id INTO v_id;

  -- Each person as the card shows them: name (role, college, identifier).
  SELECT string_agg(
           (e->>'display_name') || ' ('
           || concat_ws(', ', e->>'role', e->>'college',
                        CASE WHEN e->>'id_number' IS NOT NULL THEN (e->>'id_label') || ' ' || (e->>'id_number') END)
           || ')',
           '; ')
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
      'not_reachable', v_unreached,
      'no_email', CASE WHEN v_kind = 'email' THEN v_no_email ELSE 0 END,
      'not_on_project', CASE WHEN v_kind = 'create_task' THEN v_no_member ELSE 0 END),
    'summary',
      'NOTHING HAS BEEN SENT. Prepared ' || v_kind_label || ' "' || v_title || '" for '
      || v_count || CASE WHEN v_count = 1 THEN ' person' ELSE ' people' END
      || ': ' || COALESCE(v_names, '') || CASE WHEN v_count > 10 THEN '; and ' || (v_count - 10) || ' more' ELSE '' END
      || CASE WHEN v_task IS NOT NULL THEN '. Project: "' || v_project || '"' ELSE '' END
      || '. Tell the person to review the card under this answer and click Confirm to send it, or Cancel. It expires in 24 hours.'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_propose_action(text, text, text, uuid[], uuid[], uuid, date, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_propose_action(text, text, text, uuid[], uuid[], uuid, date, uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. fn_ai_claim_action_proposal — the click-time gate (called by the route
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
  v_ids        uuid[];
  v_still      int;
  v_confirmed  int;
  v_project_id uuid;
  v_assignee   uuid;
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

  IF NOT public.fn_ai_action_can_perform(r.kind) THEN
    UPDATE public.ai_action_proposals
       SET status = 'failed', error = 'You no longer have permission to do this.', updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', false, 'code', 'PERMISSION_DENIED', 'status', 'failed',
      'message', 'You no longer have permission to do this.');
  END IF;

  -- Every person on the card must still be someone this caller can reach
  -- (and, for email, still have an address).
  SELECT array_agg((e->>'profile_id')::uuid) INTO v_ids
    FROM jsonb_array_elements(r.recipients) e;
  SELECT count(*) INTO v_still
    FROM public.fn_ai_action_visible_recipients(NULL, v_ids) v
   WHERE (r.kind <> 'email' OR v.has_email);
  IF v_still <> COALESCE(cardinality(v_ids), 0) OR v_still = 0 THEN
    UPDATE public.ai_action_proposals
       SET status = 'failed',
           error = 'Some people on this card are no longer reachable by you. Nothing was sent.',
           updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', false, 'code', 'RECIPIENTS_CHANGED', 'status', 'failed',
      'message', 'Some people on this card are no longer reachable by you. Nothing was sent.');
  END IF;

  -- A task: the project must still exist, and BOTH the person confirming and
  -- the assignee must still be on it (owner or member).
  IF r.kind = 'create_task' THEN
    v_project_id := (r.task->>'project_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = v_project_id) THEN
      UPDATE public.ai_action_proposals
         SET status = 'failed', error = 'The project no longer exists. Nothing was created.', updated_at = now()
       WHERE id = r.id;
      RETURN jsonb_build_object('success', false, 'code', 'PROJECT_NOT_FOUND', 'status', 'failed',
        'message', 'The project no longer exists. Nothing was created.');
    END IF;
    IF public.fn_ai_action_project_staff(v_project_id, v_uid) IS NULL THEN
      UPDATE public.ai_action_proposals
         SET status = 'failed', error = 'You are no longer on this project. Nothing was created.', updated_at = now()
       WHERE id = r.id;
      RETURN jsonb_build_object('success', false, 'code', 'NOT_ON_PROJECT', 'status', 'failed',
        'message', 'You are no longer on this project. Nothing was created.');
    END IF;
    v_assignee := public.fn_ai_action_project_staff(v_project_id, v_ids[1]);
    IF v_assignee IS NULL THEN
      UPDATE public.ai_action_proposals
         SET status = 'failed', error = 'This person is no longer on the project. Nothing was created.', updated_at = now()
       WHERE id = r.id;
      RETURN jsonb_build_object('success', false, 'code', 'RECIPIENTS_CHANGED', 'status', 'failed',
        'message', 'This person is no longer on the project. Nothing was created.');
    END IF;
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
      -- create_task only: the assignee's team-member row ON THIS PROJECT,
      -- resolved at this click, so the task goes to the row that is a member.
      'assignee_staff_id', v_assignee,
      'email_footer', r.email_footer,
      'recipient_ids', to_jsonb(v_ids),
      'recipient_count', r.recipient_count));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_claim_action_proposal(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_claim_action_proposal(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. fn_ai_action_proposals_fail_stuck — close cards stuck in "Sending…"
-- ----------------------------------------------------------------------------
-- A confirmed card whose outcome was never recorded (the confirm route timed
-- out or died mid-send; its maxDuration is 120 s) can be neither retried
-- (ALREADY_CONFIRMED) nor cancelled (NOT_PENDING). After 10 minutes it is
-- closed as FAILED with a plain warning, because some of it MAY have gone out:
-- the person is told to check before asking again, and nothing is re-sent.
-- Runs from pg_cron every 5 minutes (the repo's usual mechanism, same guarded
-- shape as 20260920000000's induction cover expiry). Not callable by any API
-- role; refuses to run inside a signed-in person's session, since it closes
-- other people's rows by design.
CREATE OR REPLACE FUNCTION public.fn_ai_action_proposals_fail_stuck()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_closed integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'fn_ai_action_proposals_fail_stuck runs from the scheduler only';
  END IF;

  UPDATE public.ai_action_proposals
     SET status = 'failed',
         error = 'Delivery could not be confirmed — check before sending again.',
         updated_at = now()
   WHERE status = 'pending'
     AND confirmed_at IS NOT NULL
     AND confirmed_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_action_proposals_fail_stuck() FROM anon, PUBLIC, authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('ai-action-proposals-fail-stuck')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-action-proposals-fail-stuck');
      PERFORM cron.schedule(
        'ai-action-proposals-fail-stuck',
        '*/5 * * * *',
        $job$SELECT public.fn_ai_action_proposals_fail_stuck();$job$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ai action stuck-card sweep not scheduled: %', SQLERRM;
    END;
  END IF;
END $cron$;

-- ----------------------------------------------------------------------------
-- 6. SHARED AI TOOL CATALOG — verbatim block shared with lanes A and C
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
  || 'Kinds: in_app_message (MyJKKN notification), email (sent from MyJKKN on the person''s behalf, replies go to them), create_task (one team member, one project task; ask which project first; both the person and the assignee must be on that project). '
  || 'Pass learner ids in p_learner_ids and the profile ids of team members and other people in p_profile_ids (at most 200 in total). People the person cannot reach on MyJKKN are left out and counted in "skipped"; mention that. '
  || 'Call it only while answering the person''s question (it attaches the card to that answer). '
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
        'description', 'profiles ids of team members or other people to address.'),
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
-- 7. Apply-time assertions — a CREATE OR REPLACE that did not take, or a grant
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
    'public.fn_ai_claim_action_proposal(uuid)',
    'public.fn_ai_action_can_perform(text)',
    'public.fn_ai_action_project_staff(uuid, uuid)',
    'public.fn_ai_action_visible_recipients(uuid[], uuid[])',
    'public.fn_ai_action_proposals_fail_stuck()'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon', v_fn;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.fn_ai_action_visible_recipients(uuid[], uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ai_action_can_perform(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ai_action_project_staff(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ai_action_proposals_fail_stuck()', 'EXECUTE') THEN
    RAISE EXCEPTION 'internal ai action helpers are executable by authenticated';
  END IF;

  -- The two person-callable functions must keep their permission check. The
  -- secdef scanner checks this file in CI; this checks the database it lands in.
  IF position('fn_ai_action_can_perform' IN pg_get_functiondef(
       'public.ai_rpc_propose_action(text, text, text, uuid[], uuid[], uuid, date, uuid, uuid)'::regprocedure)) = 0
     OR position('fn_ai_action_can_perform' IN pg_get_functiondef(
       'public.fn_ai_claim_action_proposal(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ai action functions lost their permission check (fn_ai_action_can_perform)';
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
