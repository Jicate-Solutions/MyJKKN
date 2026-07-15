-- Migration: AI Assistant Artifacts — Phase 1 (charts + reports foundation)
-- Date: 2026-07-13
-- Spec: specs/ai-query-artifacts-spec-2026-07-13.md §5
--
-- Adds ai_artifacts + ai_artifact_downloads and 5 SECURITY DEFINER RPCs.
-- Per-user scoping IS the boundary: an artifact holds only data the requester
-- could already see. Reads pin auth.uid(); writes owner-bind (a signed-in user
-- can only create/read its OWN artifacts; the service_role Windows drain must
-- name the requester explicitly via p_owner). anon is REVOKE'd on every RPC —
-- Supabase's default `GRANT ALL ON FUNCTIONS TO anon` would otherwise expose
-- them to the public anon key embedded in the browser bundle.
-- See CLAUDE.md anon-lock rule + feedback_ai_rpc_confused_deputy_p_user_id.

-- ============================================================
-- 1. Tables
-- ============================================================

-- Updated: 2026-07-13 - AI Assistant artifacts (chart/report/spreadsheet/slides)
CREATE TABLE IF NOT EXISTS public.ai_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  conversation_id uuid,                        -- groups with the chat thread
  owner_id        uuid NOT NULL,               -- = requester (auth.uid of the asker)
  type            text NOT NULL CHECK (type IN ('chart','report','spreadsheet','slides')),
  title           text,
  content         jsonb NOT NULL,              -- type-specific (see spec §4)
  is_sensitive    boolean NOT NULL DEFAULT false,
  version         int NOT NULL DEFAULT 1,      -- bumps on refine (A6)
  supersedes_id   uuid REFERENCES public.ai_artifacts(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_artifacts_owner_created ON public.ai_artifacts(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_conversation  ON public.ai_artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_job           ON public.ai_artifacts(job_id);

ALTER TABLE public.ai_artifacts ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: every read/write flows through the SECURITY DEFINER
-- RPCs below (which run as owner and bypass RLS). Direct table access is locked.
REVOKE ALL ON TABLE public.ai_artifacts FROM anon, authenticated, PUBLIC;

-- Updated: 2026-07-13 - Download audit log (A3): who downloaded what, when, as what
CREATE TABLE IF NOT EXISTS public.ai_artifact_downloads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id   uuid NOT NULL REFERENCES public.ai_artifacts(id) ON DELETE CASCADE,
  downloaded_by uuid NOT NULL,                 -- auth.uid of the downloader
  format        text NOT NULL CHECK (format IN ('pdf','xlsx','csv','pptx','png')),
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_artifact_downloads_artifact ON public.ai_artifact_downloads(artifact_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifact_downloads_by       ON public.ai_artifact_downloads(downloaded_by);

ALTER TABLE public.ai_artifact_downloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_artifact_downloads FROM anon, authenticated, PUBLIC;

-- ============================================================
-- 2. RPCs (all SECURITY DEFINER, search_path pinned, anon revoked)
-- ============================================================

-- fn_ai_create_artifact — the drain (or, in principle, the user) inserts an
-- artifact. Owner binding is the confused-deputy guard: a signed-in user can
-- ONLY create artifacts owned by themselves (p_owner is ignored). Only a
-- service_role caller (no user context — and anon is revoked, so a NULL uid
-- here can only be service_role) may name the owner, and it MUST name one.
CREATE OR REPLACE FUNCTION public.fn_ai_create_artifact(
  p_owner uuid,
  p_job_id uuid,
  p_conversation_id uuid,
  p_type text,
  p_title text,
  p_content jsonb,
  p_is_sensitive boolean DEFAULT false,
  p_supersedes_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_ver   int := 1;
  v_id    uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_owner := v_uid;                 -- signed-in user: force self-owner
  ELSIF p_owner IS NOT NULL THEN
    v_owner := p_owner;               -- service_role runner: bind to the requester
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'owner required');
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('chart','report','spreadsheet','slides') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid type');
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) NOT IN ('object','array') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'content required');
  END IF;

  -- Refine (A6): a new version chains onto a prior artifact, but ONLY one the
  -- SAME owner already holds — never someone else's (IDOR guard on the chain).
  IF p_supersedes_id IS NOT NULL THEN
    SELECT version + 1 INTO v_ver
      FROM public.ai_artifacts
     WHERE id = p_supersedes_id AND owner_id = v_owner;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'supersedes not found');
    END IF;
  END IF;

  INSERT INTO public.ai_artifacts
    (job_id, conversation_id, owner_id, type, title, content, is_sensitive, version, supersedes_id)
  VALUES
    (p_job_id, p_conversation_id, v_owner, p_type, p_title, p_content,
     COALESCE(p_is_sensitive, false), v_ver, p_supersedes_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_create_artifact(uuid,uuid,uuid,text,text,jsonb,boolean,uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_create_artifact(uuid,uuid,uuid,text,text,jsonb,boolean,uuid) TO authenticated, service_role;

-- fn_ai_my_artifacts — the caller's own artifacts, newest first (lightweight:
-- no content). Used to attach artifacts to reopened history threads + a future
-- "Your artifacts" list. Pins auth.uid().
CREATE OR REPLACE FUNCTION public.fn_ai_my_artifacts(p_limit int DEFAULT 50)
RETURNS TABLE(id uuid, job_id uuid, conversation_id uuid, type text, title text,
              is_sensitive boolean, version int, supersedes_id uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT a.id, a.job_id, a.conversation_id, a.type, a.title,
         a.is_sensitive, a.version, a.supersedes_id, a.created_at
    FROM public.ai_artifacts a
   WHERE a.owner_id = v_uid
   ORDER BY a.created_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_my_artifacts(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_my_artifacts(int) TO authenticated;

-- fn_ai_get_artifact — one artifact's full content. IDOR-safe: filtered on
-- owner_id = auth.uid(), so a spoofed id (someone else's artifact) returns 0 rows.
CREATE OR REPLACE FUNCTION public.fn_ai_get_artifact(p_id uuid)
RETURNS TABLE(id uuid, job_id uuid, conversation_id uuid, type text, title text,
              content jsonb, is_sensitive boolean, version int, supersedes_id uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT a.id, a.job_id, a.conversation_id, a.type, a.title, a.content,
         a.is_sensitive, a.version, a.supersedes_id, a.created_at
    FROM public.ai_artifacts a
   WHERE a.id = p_id AND a.owner_id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_get_artifact(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_get_artifact(uuid) TO authenticated;

-- fn_ai_log_artifact_download — audit a download (A3). Verifies the caller owns
-- the artifact before logging (and thus gates the download), so the log can
-- only ever record the owner downloading their own artifact.
CREATE OR REPLACE FUNCTION public.fn_ai_log_artifact_download(p_id uuid, p_format text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authorized');
  END IF;
  IF p_format IS NULL OR p_format NOT IN ('pdf','xlsx','csv','pptx','png') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid format');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_artifacts WHERE id = p_id AND owner_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not found');   -- don't leak existence
  END IF;
  INSERT INTO public.ai_artifact_downloads (artifact_id, downloaded_by, format)
  VALUES (p_id, v_uid, p_format);
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_log_artifact_download(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_log_artifact_download(uuid,text) TO authenticated;

-- fn_ai_artifact_downloads — admin read of the download audit log. Super-admin
-- gated (is_super_admin()); non-admins get an exception, not a silent empty set.
CREATE OR REPLACE FUNCTION public.fn_ai_artifact_downloads(p_limit int DEFAULT 100)
RETURNS TABLE(id uuid, artifact_id uuid, artifact_title text, artifact_type text,
              downloaded_by uuid, downloader_email text, format text, downloaded_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT d.id, d.artifact_id, a.title, a.type,
         d.downloaded_by, p.email, d.format, d.downloaded_at
    FROM public.ai_artifact_downloads d
    LEFT JOIN public.ai_artifacts a ON a.id = d.artifact_id
    LEFT JOIN public.profiles    p ON p.id = d.downloaded_by
   ORDER BY d.downloaded_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_artifact_downloads(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_artifact_downloads(int) TO authenticated;
