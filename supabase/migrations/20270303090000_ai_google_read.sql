-- 20270303090000_ai_google_read.sql
--
-- AI Assistant, lane C: a person may let the assistant read THEIR OWN Gmail and
-- Google Drive, read-only, opt-in, disconnect any time.
--
-- FILE ONLY — NOT APPLIED. The orchestrator applies it at merge.
--
-- WHAT THIS ADDS
--   1. public.ai_google_read_connections — one row per person who connected.
--      The Google refresh token is pgp-encrypted (same vault pattern as
--      meeting_host_google_connections, 20260612090000) and is NEVER readable
--      as a column by anyone: authenticated gets a column-level SELECT that
--      leaves the ciphertext out.
--   2. public.ai_google_read_audit — who used which tool, when, and how it
--      ended. NEVER content: no query text, no subject, no file name, no id.
--   3. Five SECURITY DEFINER functions, every one pinned to auth.uid(). There
--      is no parameter anywhere that names a person, so a caller can only ever
--      reach their own connection — the rule "never anyone else's mail" is
--      enforced here, not only in the route.
--   4. The switch ai.google_read.enabled in platform_policies, OFF. Google Cloud
--      must first be given the two scopes and the Gmail + Drive APIs (a human
--      step); until a super admin flips it, no connect button is shown and the
--      endpoints answer "not switched on yet".
--   5. The shared public.ai_tool_catalog DDL (verbatim, identical in lanes A
--      and B) and this lane's four rows — audience 'assistant' ONLY, never the
--      outside-AI door, so a leaked door key can never reach anybody's mail.
--
-- WHY A SEPARATE TABLE, NOT THE CALENDAR ROW
--   The calendar row drives the booking engine (busy checks, the D19 auto-hide,
--   the calendar-connect lock). Putting a mail token there would make a person
--   who only wants mail look "calendar connected" to the slot engine, and a
--   mail disconnect would have to rewrite the calendar token. Kept apart, each
--   connection can be broken, reconnected or removed without touching the other.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. the connection ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_google_read_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  -- pgp_sym_encrypt'd Google OAuth refresh token. Written and read ONLY through
  -- the functions below. No role holds a column grant on it.
  refresh_token_encrypted bytea,
  -- Exactly what Google said it granted (the token response's `scope`), so a
  -- person who unticked "Drive" on Google's consent screen is told so rather
  -- than handed a Google 403.
  granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','broken','revoked')),
  connected_at timestamptz,
  broken_at timestamptz,
  revoked_at timestamptz,
  -- true = MyJKKN also asked Google to withdraw the permission; false = only
  -- MyJKKN's key was deleted (see fn_ai_google_read_clear_token).
  revoked_at_google boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_google_read_connections IS
  'AI Assistant: a person''s own read-only Gmail + Drive connection (opt-in). Token vaulted, readable only through fn_ai_google_read_get_token for auth.uid(). Separate from meeting_host_google_connections on purpose.';

ALTER TABLE public.ai_google_read_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agrc_own_select" ON public.ai_google_read_connections;
CREATE POLICY "agrc_own_select" ON public.ai_google_read_connections
FOR SELECT USING (profile_id = auth.uid());

REVOKE ALL ON public.ai_google_read_connections FROM anon, authenticated, PUBLIC;
-- Column-level: the owner may see status/email/scopes (the card needs them),
-- never the ciphertext. All writes go through the functions below.
GRANT SELECT (id, profile_id, google_email, granted_scopes, status, connected_at,
              broken_at, revoked_at, revoked_at_google, created_at, updated_at)
  ON public.ai_google_read_connections TO authenticated;

-- ── 2. the audit trail (who, which tool, when — never content) ──────────────

CREATE TABLE IF NOT EXISTS public.ai_google_read_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool text NOT NULL CHECK (tool IN (
    'connect','disconnect',
    'google_mail_search','google_mail_read','google_drive_search','google_drive_read'
  )),
  -- A short fixed code ('ok', 'not_connected', 'disabled', 'missing_scope',
  -- 'google_error', 'reconnect_needed', 'revoked_at_google', ...). Never text
  -- that came from the mail or the file.
  outcome text NOT NULL CHECK (outcome ~ '^[a-z_]{1,40}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_google_read_audit IS
  'AI Assistant Gmail/Drive read: one row per tool call or connect/disconnect. Who, which tool, when, outcome code. NEVER content, queries, subjects, file names or ids.';

CREATE INDEX IF NOT EXISTS idx_agra_profile_created
  ON public.ai_google_read_audit (profile_id, created_at DESC);

ALTER TABLE public.ai_google_read_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agra_own_or_super_admin_select" ON public.ai_google_read_audit;
CREATE POLICY "agra_own_or_super_admin_select" ON public.ai_google_read_audit
FOR SELECT USING (profile_id = auth.uid() OR is_super_admin());

REVOKE ALL ON public.ai_google_read_audit FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ai_google_read_audit TO authenticated;

-- ── 3. functions — every one pinned to auth.uid(), none takes a person id ───

CREATE OR REPLACE FUNCTION public.fn_ai_google_read_set_token(
  p_google_email   text,
  p_refresh_token  text,
  p_granted_scopes text[],
  p_master_secret  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_ai_google_read_set_token: sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_google_email IS NULL OR length(trim(p_google_email)) = 0 THEN
    RAISE EXCEPTION 'fn_ai_google_read_set_token: p_google_email must not be empty';
  END IF;
  IF p_refresh_token IS NULL OR length(trim(p_refresh_token)) = 0 THEN
    RAISE EXCEPTION 'fn_ai_google_read_set_token: p_refresh_token must not be empty';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_ai_google_read_set_token: p_master_secret must not be empty';
  END IF;

  INSERT INTO public.ai_google_read_connections AS c
    (profile_id, google_email, refresh_token_encrypted, granted_scopes, status,
     connected_at, broken_at, revoked_at, revoked_at_google)
  VALUES
    (v_uid, p_google_email,
     extensions.pgp_sym_encrypt(p_refresh_token, p_master_secret),
     COALESCE(p_granted_scopes, '{}'::text[]), 'active', now(), NULL, NULL, NULL)
  ON CONFLICT (profile_id) DO UPDATE SET
    google_email            = EXCLUDED.google_email,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    granted_scopes          = EXCLUDED.granted_scopes,
    status                  = 'active',
    connected_at            = now(),
    broken_at               = NULL,
    revoked_at              = NULL,
    revoked_at_google       = NULL,
    updated_at              = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ai_google_read_get_token(
  p_master_secret text
)
RETURNS TABLE(google_email text, refresh_token text, granted_scopes text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_ai_google_read_get_token: sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_master_secret IS NULL OR length(trim(p_master_secret)) = 0 THEN
    RAISE EXCEPTION 'fn_ai_google_read_get_token: p_master_secret must not be empty';
  END IF;

  RETURN QUERY
  SELECT
    c.google_email,
    extensions.pgp_sym_decrypt(c.refresh_token_encrypted, p_master_secret)::text,
    c.granted_scopes
  FROM public.ai_google_read_connections c
  WHERE c.profile_id = v_uid
    AND c.refresh_token_encrypted IS NOT NULL
    AND c.status = 'active';
END;
$$;

-- Disconnect: the key is deleted here in every case. p_revoked_at_google records
-- whether the route ALSO withdrew the permission at Google — it does not when
-- the person's calendar runs on the same Google account, because Google's revoke
-- withdraws every permission MyJKKN holds for that account, calendar included.
CREATE OR REPLACE FUNCTION public.fn_ai_google_read_clear_token(
  p_revoked_at_google boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_ai_google_read_clear_token: sign in first' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_google_read_connections
  SET refresh_token_encrypted = NULL,
      status            = 'revoked',
      revoked_at        = now(),
      revoked_at_google = COALESCE(p_revoked_at_google, false),
      updated_at        = now()
  WHERE profile_id = v_uid;
END;
$$;

-- Google answered invalid_grant: the person removed MyJKKN in their Google
-- account, or changed their password. The key is useless; say so on the card.
CREATE OR REPLACE FUNCTION public.fn_ai_google_read_mark_broken()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_ai_google_read_mark_broken: sign in first' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_google_read_connections
  SET status     = 'broken',
      broken_at  = now(),
      updated_at = now()
  WHERE profile_id = v_uid
    AND status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ai_google_read_log(
  p_tool    text,
  p_outcome text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_ai_google_read_log: sign in first' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_google_read_audit (profile_id, tool, outcome)
  VALUES (v_uid, p_tool, p_outcome);
END;
$$;

-- ci:allow-secdef-authenticated Every signed-in person must be able to connect, use, disconnect and audit THEIR OWN Google read connection, and nothing more: each of the five functions raises when auth.uid() is NULL, takes no person id, and reads or writes only the row WHERE profile_id = auth.uid(). get_token additionally needs the server-only GOOGLE_TOKEN_MASTER_SECRET to decrypt anything. Rehearsed: person B cannot read, list or clear person A's connection.
REVOKE EXECUTE ON FUNCTION public.fn_ai_google_read_set_token(text, text, text[], text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ai_google_read_get_token(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ai_google_read_clear_token(boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ai_google_read_mark_broken() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ai_google_read_log(text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ai_google_read_set_token(text, text, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ai_google_read_get_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ai_google_read_clear_token(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ai_google_read_mark_broken() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ai_google_read_log(text, text) TO authenticated;

-- ── 4. the switch — OFF until Google Cloud is set up ────────────────────────

INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('ai.google_read.enabled','global','false'::jsonb,'boolean',
   'Lets a person connect their OWN Google account so the AI Assistant can search and read their own Gmail and Drive, read-only. When false: no connect card is offered (someone already connected still sees Disconnect) and the four assistant tools answer "not switched on yet". Leave OFF until Google Cloud''s OAuth consent screen lists gmail.readonly and drive.readonly, the Gmail API and Drive API are enabled, and /api/integrations/google-read/callback is an authorised redirect URI on the calendar OAuth client.',
   true, true, 'major','published','toggle','integrations')
) v(policy_key, scope_type, value, data_type, description,
    is_system, is_active, classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

-- ── 5. SHARED CATALOG DDL (verbatim — lanes A and B carry the identical block)

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

-- ── 6. this lane's four tools — assistant ONLY, never the door ──────────────

INSERT INTO public.ai_tool_catalog (name, kind, target, description, params, is_write, audience, requires_permission) VALUES
  ('google_mail_search', 'http', '/api/ai-tools/google/mail-search',
   'Search the ASKING person''s own Gmail (read-only). Use ONLY when the person asks about their own email. Returns up to 10 messages: id, from, subject, date, snippet. The query uses Gmail search-box syntax (from:, subject:, newer_than:7d, has:attachment). If the answer has ok=false with code not_connected, tell the person plainly that they have not connected Google yet and can do it under Meetings > My Availability > "Let the assistant read my Gmail and Drive". Never guess mail content that was not returned.',
   '{"type":"object","properties":{"query":{"type":"string","maxLength":500,"description":"Gmail search words, same syntax as the Gmail search box. Empty = most recent mail."},"limit":{"type":"integer","minimum":1,"maximum":10,"default":5,"description":"How many messages to return (1-10)."}},"required":["query"],"additionalProperties":false}'::jsonb,
   false, ARRAY['assistant']::text[], 'ai_query.view'),
  ('google_mail_read', 'http', '/api/ai-tools/google/mail-read',
   'Read ONE message from the asking person''s own Gmail as plain text (at most 20,000 characters; truncated=true when cut). Use ONLY when the person asks about their own email, with an id returned by google_mail_search. If ok=false with code not_connected, tell the person plainly that they have not connected Google yet.',
   '{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":200,"description":"A message id from google_mail_search."}},"required":["id"],"additionalProperties":false}'::jsonb,
   false, ARRAY['assistant']::text[], 'ai_query.view'),
  ('google_drive_search', 'http', '/api/ai-tools/google/drive-search',
   'Search the asking person''s own Google Drive (read-only; files they can open, including shared drives). Use ONLY when the person asks about their own files. Returns up to 10 files: id, name, type, modified, link. The query is plain words matched against file names and contents. If ok=false with code not_connected, tell the person plainly that they have not connected Google yet.',
   '{"type":"object","properties":{"query":{"type":"string","maxLength":500,"description":"Words to look for in file names and contents. Empty = most recently modified files."},"limit":{"type":"integer","minimum":1,"maximum":10,"default":5,"description":"How many files to return (1-10)."}},"required":["query"],"additionalProperties":false}'::jsonb,
   false, ARRAY['assistant']::text[], 'ai_query.view'),
  ('google_drive_read', 'http', '/api/ai-tools/google/drive-read',
   'Read ONE file from the asking person''s own Google Drive: a Google Doc comes back as plain text, a Google Sheet as CSV (first sheet), anything else as its name and link only (at most 20,000 characters; truncated=true when cut). Use ONLY when the person asks about their own files, with an id returned by google_drive_search. If ok=false with code not_connected, tell the person plainly that they have not connected Google yet.',
   '{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":200,"description":"A file id from google_drive_search."}},"required":["id"],"additionalProperties":false}'::jsonb,
   false, ARRAY['assistant']::text[], 'ai_query.view')
ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind, target = EXCLUDED.target, description = EXCLUDED.description, params = EXCLUDED.params, is_write = EXCLUDED.is_write, audience = EXCLUDED.audience, requires_permission = EXCLUDED.requires_permission, updated_at = now();

-- ── 7. loud, never silent ───────────────────────────────────────────────────

DO $$
DECLARE
  v_door int;
  v_rows int;
BEGIN
  SELECT count(*) INTO v_rows FROM public.ai_tool_catalog
  WHERE name IN ('google_mail_search','google_mail_read','google_drive_search','google_drive_read');
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'ai_google_read: expected 4 catalog rows, found %', v_rows;
  END IF;

  -- A leaked door key must never reach anybody's mail.
  SELECT count(*) INTO v_door FROM public.ai_tool_catalog
  WHERE name IN ('google_mail_search','google_mail_read','google_drive_search','google_drive_read')
    AND 'door' = ANY(audience);
  IF v_door <> 0 THEN
    RAISE EXCEPTION 'ai_google_read: % mail/drive tool(s) are exposed to the outside-AI door', v_door;
  END IF;

  IF has_table_privilege('anon', 'public.ai_google_read_connections', 'SELECT')
     OR has_table_privilege('anon', 'public.ai_google_read_audit', 'SELECT') THEN
    RAISE EXCEPTION 'ai_google_read: anon can read a Google read table';
  END IF;

  IF has_column_privilege('authenticated', 'public.ai_google_read_connections',
                          'refresh_token_encrypted', 'SELECT') THEN
    RAISE EXCEPTION 'ai_google_read: authenticated can read the encrypted token column';
  END IF;

  IF has_function_privilege('anon', 'public.fn_ai_google_read_get_token(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ai_google_read: anon can call fn_ai_google_read_get_token';
  END IF;
END $$;
