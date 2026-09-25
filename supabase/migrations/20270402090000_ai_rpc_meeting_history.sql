-- ============================================================================
-- 20270402090000_ai_rpc_meeting_history.sql
-- ----------------------------------------------------------------------------
-- FILE ONLY — NOT APPLIED. The orchestrator applies it after the Director
-- approves the PR. No BEGIN/COMMIT in the file.
--
-- WHAT THIS ADDS
--   1. public.ai_rpc_meeting_history — lets the AI assistant answer "what did I
--      discuss with X", "which of my meetings mentioned Y", and "what did I
--      agree to do", from meeting_notes (Fireflies notes) and
--      meeting_action_items. Before this, no ai_rpc_* read either table.
--   2. The shared ai_tool_catalog DDL block, copied VERBATIM from PR #3982
--      (supabase/migrations/20270301090000_ai_tool_catalog.sql at head
--      00ec803eacdc1d68e22c5ab405e57311c421a939, lines 90-107), so this file
--      applies whether or not #3982 has merged first.
--   3. One catalog row, 'meeting_history', audience ['assistant'] ONLY.
--      Meeting content is the same privacy class as mail (Director ruling,
--      2026-09-23), so it is never handed to the outside-AI door.
--
-- WHY SECURITY INVOKER — THE ONE DESIGN CHOICE THAT MATTERS
--   Every other ai_rpc_* is SECURITY DEFINER and re-implements its own access
--   check. This one runs with the CALLER's rights, so the row level security
--   already on the three tables it reads applies to every row it touches:
--     meeting_notes          meeting_notes_select   (20261213090000)
--       super admin OR admin OR (unmatched AND meetings.series.manage)
--       OR fn_can_view_meeting_note(booking_id)
--     meeting_action_items   meeting_action_items_select (20260714000000)
--       super admin OR admin OR host_profile_id = auth.uid()
--     meeting_bookings       mb_host_select        (20260611190000)
--       super admin OR admin OR host_profile_id = auth.uid()
--   On top of that it applies an OWN rule (below). The result can therefore
--   only be NARROWER than what the person may already read on the site; no
--   bug in this function can widen it. Policies were read from the migration
--   files on jicate/main; the live pg_policies could NOT be read from this
--   lane (no production credentials) — see the PR body.
--
-- THE OWN RULE (on top of RLS)
--   A note is "mine" when
--     * it is linked to a booking and fn_can_view_meeting_note says I am on
--       that booking's invited set (host, attendee, collective co-host); or
--     * it is unlinked and my profile email is in the note's own Fireflies
--       attendee list (raw->'meeting_attendees').
--   Consequence, stated plainly: super admins and admins are narrowed to
--   meetings they attended too. An unlinked note with an EMPTY attendee list
--   is reachable by nobody through this tool, the Director included.
--   An action item is "mine" when I am its host or its owner — but RLS on
--   meeting_action_items admits only admins and the host, so an owner who is
--   neither sees nothing of it here (RLS narrows; this tool cannot widen).
--
-- NEVER RETURNED: raw, recording_url, audio_url, video_url.
--
-- IDENTITY: p_user_id is IGNORED (kept for the answerers' call shape — the
-- catalog marks it x-self-arg). Identity is auth.uid(); NULL → UNAUTHORIZED.
-- ============================================================================

-- ─── A. The lookup ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_rpc_meeting_history(
  p_user_id uuid DEFAULT NULL,
  p_person text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_include_action_items boolean DEFAULT true,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_uid          uuid := auth.uid();
  v_email        text;
  v_person       text;
  v_person_pat   text;
  v_search       text;
  v_search_pat   text;
  v_from         date;
  v_to           date;
  v_limit        integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset       integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_notes        jsonb;
  v_total        integer;
  v_returned     integer;
  v_no_summary   integer;
  v_booking_ids  uuid[];
  v_items        jsonb := '[]'::jsonb;
  v_items_total  integer := 0;
  v_filters      jsonb := '{}'::jsonb;
BEGIN
  -- p_user_id is deliberately never read. Identity is the signed-in person.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'data', '[]'::jsonb,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false),
      'actions_available', '[]'::jsonb,
      'error', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Sign in required.'));
  END IF;

  SELECT lower(btrim(COALESCE(p.email, ''))) INTO v_email
    FROM profiles p
   WHERE p.id = v_uid;
  v_email := COALESCE(v_email, '');

  -- Text filters: trimmed, at most 200 characters, ignored below 2, and the
  -- LIKE metacharacters \ % _ escaped so a '%' typed by the person (or the
  -- model) is a literal percent sign, not "match everything".
  v_person := left(NULLIF(btrim(COALESCE(p_person, '')), ''), 200);
  IF char_length(v_person) < 2 THEN v_person := NULL; END IF;
  IF v_person IS NOT NULL THEN
    v_person_pat := '%' || replace(replace(replace(v_person, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_filters := v_filters || jsonb_build_object('person', v_person);
  END IF;

  v_search := left(NULLIF(btrim(COALESCE(p_search, '')), ''), 200);
  IF char_length(v_search) < 2 THEN v_search := NULL; END IF;
  IF v_search IS NOT NULL THEN
    v_search_pat := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_filters := v_filters || jsonb_build_object('search', v_search);
  END IF;

  -- Dates: the same YYYY-MM-DD shape ai_rpc_meeting_bookings accepts, read as
  -- IST calendar days. A malformed or impossible date (2026-13-45) is ignored
  -- rather than failing the call.
  IF btrim(COALESCE(p_date_from, '')) ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_from := btrim(p_date_from)::date;
    EXCEPTION WHEN others THEN
      v_from := NULL;
    END;
  END IF;
  IF btrim(COALESCE(p_date_to, '')) ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_to := btrim(p_date_to)::date;
    EXCEPTION WHEN others THEN
      v_to := NULL;
    END;
  END IF;
  IF v_from IS NOT NULL THEN v_filters := v_filters || jsonb_build_object('date_from', v_from); END IF;
  IF v_to   IS NOT NULL THEN v_filters := v_filters || jsonb_build_object('date_to', v_to); END IF;

  WITH own AS (
    SELECT n.id,
           n.title,
           n.summary,
           n.occurred_at,
           n.duration_minutes,
           n.transcript_url,
           n.booking_id,
           n.raw -> 'summary' ->> 'action_items' AS ff_action_items,
           a.att,
           -- meeting_bookings is itself under RLS (host or admin): a booking
           -- the person cannot read joins as NULL, so its uid and its
           -- attendee fields are never exposed or searched.
           b.uid            AS booking_uid,
           b.attendee_name  AS booking_attendee_name,
           b.attendee_email AS booking_attendee_email
      FROM meeting_notes n
      CROSS JOIN LATERAL (
        SELECT CASE WHEN jsonb_typeof(n.raw -> 'meeting_attendees') = 'array'
                    THEN n.raw -> 'meeting_attendees'
                    ELSE '[]'::jsonb END AS att
      ) a
      LEFT JOIN meeting_bookings b ON b.id = n.booking_id
     WHERE (
             (n.booking_id IS NOT NULL AND fn_can_view_meeting_note(n.booking_id))
             OR (n.booking_id IS NULL
                 AND v_email <> ''
                 AND EXISTS (SELECT 1
                               FROM jsonb_array_elements(a.att) e
                              WHERE lower(btrim(e ->> 'email')) = v_email))
           )
       AND (v_person_pat IS NULL
            OR n.title ILIKE v_person_pat ESCAPE '\'
            OR b.attendee_name  ILIKE v_person_pat ESCAPE '\'
            OR b.attendee_email ILIKE v_person_pat ESCAPE '\'
            OR EXISTS (SELECT 1
                         FROM jsonb_array_elements(a.att) e
                        WHERE (e ->> 'displayName') ILIKE v_person_pat ESCAPE '\'
                           OR (e ->> 'email')       ILIKE v_person_pat ESCAPE '\'))
       AND (v_search_pat IS NULL
            OR n.title   ILIKE v_search_pat ESCAPE '\'
            OR n.summary ILIKE v_search_pat ESCAPE '\'
            OR (n.raw -> 'summary' ->> 'action_items') ILIKE v_search_pat ESCAPE '\')
       AND (v_from IS NULL OR (n.occurred_at AT TIME ZONE 'Asia/Kolkata')::date >= v_from)
       AND (v_to   IS NULL OR (n.occurred_at AT TIME ZONE 'Asia/Kolkata')::date <= v_to)
  ),
  paged AS (
    SELECT *
      FROM own
     ORDER BY occurred_at DESC NULLS LAST, id DESC
     LIMIT v_limit OFFSET v_offset
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'note_id',                p.id,
                 'title',                  p.title,
                 'occurred_at',            p.occurred_at,
                 'duration_minutes',       p.duration_minutes,
                 'summary',                left(p.summary, 800),
                 'fireflies_action_items', left(p.ff_action_items, 600),
                 'attendees', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('name', s.e ->> 'displayName',
                                                        'email', s.e ->> 'email')
                                     ORDER BY s.ord)
                      FROM (SELECT x.e, x.ord
                              FROM jsonb_array_elements(p.att) WITH ORDINALITY AS x(e, ord)
                             WHERE jsonb_typeof(x.e) = 'object'
                             ORDER BY x.ord
                             LIMIT 15) s
                 ), '[]'::jsonb),
                 'booking_uid',            p.booking_uid,
                 'transcript_url',         p.transcript_url
               )
               ORDER BY p.occurred_at DESC NULLS LAST, p.id DESC)
        FROM paged p
    ), '[]'::jsonb),
    (SELECT count(*) FROM own),
    (SELECT count(*) FROM paged),
    (SELECT count(*) FROM own WHERE NULLIF(btrim(COALESCE(summary, '')), '') IS NULL),
    (SELECT array_agg(DISTINCT booking_id) FROM own WHERE booking_id IS NOT NULL)
  INTO v_notes, v_total, v_returned, v_no_summary, v_booking_ids;

  IF COALESCE(p_include_action_items, true) THEN
    WITH mine AS (
      SELECT ai.id, ai.action_text, ai.decision_text, ai.owner_label, ai.status,
             ai.due_date, ai.created_at, b.uid AS booking_uid
        FROM meeting_action_items ai
        LEFT JOIN meeting_bookings b ON b.id = ai.booking_id
       WHERE (ai.host_profile_id = v_uid OR ai.owner_profile_id = v_uid)
         AND (
               ai.booking_id = ANY (COALESCE(v_booking_ids, ARRAY[]::uuid[]))
               OR (v_search_pat IS NOT NULL
                   AND (ai.action_text   ILIKE v_search_pat ESCAPE '\'
                        OR ai.decision_text ILIKE v_search_pat ESCAPE '\'
                        OR ai.owner_label   ILIKE v_search_pat ESCAPE '\'))
               OR (v_person_pat IS NOT NULL
                   AND ai.owner_label ILIKE v_person_pat ESCAPE '\')
               -- No filter at all: "what have I got to do" — every item of mine.
               OR (v_search_pat IS NULL AND v_person_pat IS NULL
                   AND v_from IS NULL AND v_to IS NULL)
             )
    )
    SELECT COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'action_text',   m.action_text,
                        'decision_text', m.decision_text,
                        'owner_label',   m.owner_label,
                        'status',        m.status,
                        'due_date',      m.due_date,
                        'booking_uid',   m.booking_uid
                      )
                      ORDER BY (m.status = 'open') DESC, m.due_date NULLS LAST, m.created_at DESC, m.id)
               FROM (SELECT * FROM mine
                      ORDER BY (status = 'open') DESC, due_date NULLS LAST, created_at DESC, id
                      LIMIT 50) m
           ), '[]'::jsonb),
           (SELECT count(*) FROM mine)
      INTO v_items, v_items_total;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_notes,
    'action_items', v_items,
    'metadata', jsonb_build_object(
      'total_count',           v_total,
      'returned_count',        v_returned,
      'has_more',              v_total > v_offset + v_returned,
      'filters_applied',       v_filters,
      'notes_without_summary', v_no_summary,
      'action_items_count',    v_items_total,
      'action_items_included', COALESCE(p_include_action_items, true)
    ),
    'actions_available', '[]'::jsonb
  );
END;
$fn$;

COMMENT ON FUNCTION public.ai_rpc_meeting_history(uuid, text, text, text, text, boolean, integer, integer) IS
  'AI assistant: the signed-in person''s own past meetings (Fireflies notes) and their own action items. SECURITY INVOKER — table RLS applies to every row, so it can only narrow what the person may already read. p_user_id is ignored. Never returns raw, recording_url, audio_url or video_url.';

REVOKE EXECUTE ON FUNCTION public.ai_rpc_meeting_history(uuid, text, text, text, text, boolean, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_meeting_history(uuid, text, text, text, text, boolean, integer, integer) TO authenticated;

-- ─── B. The shared ai_tool_catalog DDL — the 18 lines below are copied
--        byte-for-byte from PR #3982 (20270301090000_ai_tool_catalog.sql,
--        lines 90-107, head 00ec803e), including its own section heading.
-- ─── 1. SHARED CATALOG DDL (verbatim) ──────────────────────────────────────
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

-- ─── C. The catalog row — in-app assistant ONLY, never the door ────────────
-- Column list matches PR #3982's seed INSERT exactly. requires_permission is
-- NULL: the function answers only about the caller's own meetings, and the
-- menu itself is already gated on ai_query.view (fn_ai_tool_menu, #3982).
INSERT INTO public.ai_tool_catalog (name, kind, target, description, params, is_write, audience, requires_permission) VALUES
  ('meeting_history', 'rpc', 'ai_rpc_meeting_history',
   'This person''s OWN past meetings: the notes and summaries of meetings they attended or hosted, who was there, and the action items they host or own. Use for "what did I discuss with X", "which of my meetings mentioned Y", "what did we agree in the meeting about Z", "what do I still have to do from my meetings". It never shows other people''s meetings and never returns recordings.',
   '{"type":"object","properties":{"p_person":{"type":"string","description":"A name or email of someone in the meeting (matched against the attendee list, the meeting title and the booked attendee). At least 2 characters."},"p_search":{"type":"string","description":"Words to look for in the meeting title, summary and action items. At least 2 characters."},"p_date_from":{"type":"string","description":"Earliest meeting date, YYYY-MM-DD, Indian time."},"p_date_to":{"type":"string","description":"Latest meeting date, YYYY-MM-DD, Indian time."},"p_include_action_items":{"type":"boolean","description":"Also list this person''s action items from these meetings.","default":true},"p_limit":{"type":"integer","description":"Most meetings to return (at most 50).","default":20},"p_offset":{"type":"integer","description":"Meetings to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant']::text[], NULL)
ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind, target = EXCLUDED.target, description = EXCLUDED.description, params = EXCLUDED.params, is_write = EXCLUDED.is_write, audience = EXCLUDED.audience, requires_permission = EXCLUDED.requires_permission, updated_at = now();

-- ─── D. End-state assertions — fail the apply, not a reader weeks later ────
DO $assert$
DECLARE
  v_secdef boolean;
BEGIN
  SELECT p.prosecdef INTO v_secdef
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'ai_rpc_meeting_history';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_rpc_meeting_history was not created';
  END IF;
  IF v_secdef THEN
    RAISE EXCEPTION 'ai_rpc_meeting_history must be SECURITY INVOKER — table RLS is the access rule';
  END IF;

  IF has_function_privilege('anon', 'public.ai_rpc_meeting_history(uuid, text, text, text, text, boolean, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute ai_rpc_meeting_history';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.ai_rpc_meeting_history(uuid, text, text, text, text, boolean, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute ai_rpc_meeting_history';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_tool_catalog
     WHERE name = 'meeting_history'
       AND target = 'ai_rpc_meeting_history'
       AND audience = ARRAY['assistant']::text[]
       AND NOT is_write
  ) THEN
    RAISE EXCEPTION 'meeting_history catalog row missing, or offered beyond the in-app assistant';
  END IF;
END;
$assert$;

NOTIFY pgrst, 'reload schema';
