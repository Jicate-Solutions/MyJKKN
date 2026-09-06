-- Migration: MBA Department Playbooks — unified AI-drafted artifacts store
-- Created: 2026-07-28
-- Module: per-department (improvement_area) organogram + SOP + workflow,
--         AI-drafts -> human-approve. Home = MBA Improvement-Board analytics.
-- One row per (area_id, artifact_type). Areas are system-wide (institution_id NULL),
-- so there is one playbook per area (no institution scoping).
-- Anon-locked table + SECURITY DEFINER RPCs (approve is the ONLY path to 'approved').
-- ============================================================================

-- 1) TABLE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mba_dept_artifacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id        uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  artifact_type  text NOT NULL CHECK (artifact_type IN ('organogram','sop','workflow')),
  content        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'ai_drafted'
                   CHECK (status IN ('ai_drafted','approved','needs_changes')),
  version        integer NOT NULL DEFAULT 1,
  -- AI provenance (grounding audit trail)
  ai_model       text,
  ai_prompt      text,
  ai_job_id      uuid,
  ai_drafted_at  timestamptz,
  -- review provenance (human approval)
  reviewed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  review_notes   text,
  -- standard
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mba_dept_artifact_area_type UNIQUE (area_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_mba_dept_artifacts_area   ON public.mba_dept_artifacts(area_id);
CREATE INDEX IF NOT EXISTS idx_mba_dept_artifacts_status ON public.mba_dept_artifacts(status);

COMMENT ON TABLE public.mba_dept_artifacts IS
  'AI-drafted -> human-approved department playbooks (organogram/sop/workflow) per improvement_area. One row per (area_id, artifact_type). Writes only via SECURITY DEFINER RPCs.';

-- 2) RLS + anon lock ───────────────────────────────────────────────────────
ALTER TABLE public.mba_dept_artifacts ENABLE ROW LEVEL SECURITY;
-- Supabase default-grants the public anon key ALL on new tables — revoke it.
REVOKE ALL ON public.mba_dept_artifacts FROM anon, PUBLIC;
-- Reads only from the browser client (RLS-gated). Writes go through SECDEF RPCs.
GRANT SELECT ON public.mba_dept_artifacts TO authenticated;

DROP POLICY IF EXISTS mba_dept_artifacts_select ON public.mba_dept_artifacts;
CREATE POLICY mba_dept_artifacts_select ON public.mba_dept_artifacts
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
    OR (
      public.user_has_permission('improvement.ideas.view')
      AND EXISTS (
        SELECT 1 FROM public.mba_associate_postings p
        WHERE p.area_id = mba_dept_artifacts.area_id
          AND p.associate_user_id = auth.uid()
      )
    )
  );
-- No INSERT/UPDATE/DELETE grant or policy for authenticated: all writes are
-- SECURITY DEFINER RPCs (which run as owner and bypass RLS).

-- 3) RPC — AI draft writer (called by the collect sweep as service_role) ─────
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_ai_draft_upsert(
  p_area_id       uuid,
  p_artifact_type text,
  p_content       jsonb,
  p_ai_model      text DEFAULT NULL,
  p_ai_prompt     text DEFAULT NULL,
  p_ai_job_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_artifact_type NOT IN ('organogram','sop','workflow') THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_ai_draft_upsert: invalid artifact_type %', p_artifact_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_ai_draft_upsert: no such improvement_area %', p_area_id;
  END IF;

  -- LOCK: an approved artifact must be reopened (fn_mba_dept_artifact_reopen)
  -- before a fresh AI draft may replace it — protects approved work from an
  -- accidental "Draft with AI" click.
  IF EXISTS (
    SELECT 1 FROM public.mba_dept_artifacts
    WHERE area_id = p_area_id AND artifact_type = p_artifact_type AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_ai_draft_upsert: % artifact is approved and locked — reopen it first', p_artifact_type;
  END IF;

  INSERT INTO public.mba_dept_artifacts (
    area_id, artifact_type, content, status, version,
    ai_model, ai_prompt, ai_job_id, ai_drafted_at, updated_at
  )
  VALUES (
    p_area_id, p_artifact_type, COALESCE(p_content, '{}'::jsonb), 'ai_drafted', 1,
    p_ai_model, p_ai_prompt, p_ai_job_id, now(), now()
  )
  ON CONFLICT (area_id, artifact_type) DO UPDATE SET
    content       = COALESCE(EXCLUDED.content, '{}'::jsonb),
    status        = 'ai_drafted',           -- a fresh AI draft resets the review state
    version       = public.mba_dept_artifacts.version + 1,
    ai_model      = EXCLUDED.ai_model,
    ai_prompt     = EXCLUDED.ai_prompt,
    ai_job_id     = EXCLUDED.ai_job_id,
    ai_drafted_at = now(),
    reviewed_by   = NULL,                    -- clear prior human review — this is new AI content
    reviewed_at   = NULL,
    review_notes  = NULL,
    updated_at    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_ai_draft_upsert(uuid, text, jsonb, text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_ai_draft_upsert(uuid, text, jsonb, text, text, uuid) TO service_role;

-- 4) RPC — approve (the ONLY path to status='approved') ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_approve(
  p_area_id       uuid,
  p_artifact_type text,
  p_content       jsonb DEFAULT NULL,       -- optional manager edits (COALESCE patch)
  p_review_notes  text  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: not authenticated';
  END IF;

  -- Authority: super-admin / admin bypass, else the improvement-board manager
  -- permission (areas are system-wide, so no institution scoping applies).
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: requires improvement.board.manage';
  END IF;

  -- Lock the row so two concurrent approve/request-changes calls cannot both pass.
  SELECT id, status INTO v_id, v_status
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: no % artifact for that area', p_artifact_type;
  END IF;
  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: already approved';
  END IF;

  UPDATE public.mba_dept_artifacts
  SET content      = COALESCE(p_content, content),   -- patch-style: keep AI content unless edited
      status       = 'approved',
      reviewed_by  = auth.uid(),
      reviewed_at  = now(),
      review_notes = p_review_notes,
      updated_by   = auth.uid(),
      updated_at   = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_approve(uuid, text, jsonb, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_approve(uuid, text, jsonb, text) TO authenticated;

-- 5) RPC — request changes (status -> needs_changes) ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_request_changes(
  p_area_id       uuid,
  p_artifact_type text,
  p_review_notes  text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: requires improvement.board.manage';
  END IF;

  SELECT id INTO v_id
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: no % artifact for that area', p_artifact_type;
  END IF;

  UPDATE public.mba_dept_artifacts
  SET status       = 'needs_changes',
      reviewed_by  = auth.uid(),
      reviewed_at  = now(),
      review_notes = p_review_notes,
      updated_by   = auth.uid(),
      updated_at   = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) TO authenticated;

-- 5b) RPC — reopen: the ONLY way out of 'approved' (manager-gated).
-- approved -> needs_changes, so a locked artifact can be re-drafted / edited again.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_reopen(
  p_area_id       uuid,
  p_artifact_type text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: requires improvement.board.manage';
  END IF;

  SELECT id, status INTO v_id, v_status
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: no % artifact for that area', p_artifact_type;
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: only an approved artifact can be reopened';
  END IF;

  UPDATE public.mba_dept_artifacts
  SET status       = 'needs_changes',
      reviewed_by  = auth.uid(),
      reviewed_at  = now(),
      review_notes = 'Reopened for changes.',
      updated_by   = auth.uid(),
      updated_at   = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_reopen(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_reopen(uuid, text) TO authenticated;

-- 6) Max-lane job type (₹0) — clone of the proven lesson-spine generate row ──
-- Only job_type / title / description differ from that template row.
INSERT INTO public.ai_job_types (
  job_type, title, description, prompt_template, tool_set, output_target,
  interactive, lane, allow_rule, max_inflight, schedulable, enabled,
  input_schema, provider, model_id, external_allowed
)
SELECT
  'mba.draft_dept_artifact',
  'MBA · Department Playbook Draft',
  'Config carrier — drafts-gated route (organogram / SOP / workflow AI draft, human-approved)',
  '{{prompt}}', 'none', 'job.result',
  false, 'max', 'seat_owner', 3, true, true,
  '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb,
  'anthropic', 'sonnet', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_job_types WHERE job_type = 'mba.draft_dept_artifact'
);

-- ============================================================================
-- Delta 3: MBA department playbooks — version history + change-request notify.
-- Decisions (2026-07-28 follow-up interview): keep a history of approved versions;
-- notify the area's associates when a manager requests changes.
-- Note: the blessed ai_rpc_send_notification is broken (inserts non-existent
-- message/type cols), so we insert directly into notifications + user_notifications
-- (the mechanism behind 30k live deliveries), best-effort so it never blocks.
-- ============================================================================

-- 1) History table — one immutable snapshot per approval.
CREATE TABLE IF NOT EXISTS public.mba_dept_artifact_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id   uuid NOT NULL REFERENCES public.mba_dept_artifacts(id) ON DELETE CASCADE,
  area_id       uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  content       jsonb NOT NULL,
  version       integer NOT NULL,
  approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mba_dept_artifact_versions_area
  ON public.mba_dept_artifact_versions(area_id, artifact_type, approved_at DESC);

ALTER TABLE public.mba_dept_artifact_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mba_dept_artifact_versions FROM anon, PUBLIC;
GRANT SELECT ON public.mba_dept_artifact_versions TO authenticated;

DROP POLICY IF EXISTS mba_dept_artifact_versions_select ON public.mba_dept_artifact_versions;
CREATE POLICY mba_dept_artifact_versions_select ON public.mba_dept_artifact_versions
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
    OR (
      public.user_has_permission('improvement.ideas.view')
      AND EXISTS (
        SELECT 1 FROM public.mba_associate_postings p
        WHERE p.area_id = mba_dept_artifact_versions.area_id
          AND p.associate_user_id = auth.uid()
      )
    )
  );

-- 2) approve now writes a version snapshot after approving.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_approve(
  p_area_id       uuid,
  p_artifact_type text,
  p_content       jsonb DEFAULT NULL,
  p_review_notes  text  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: requires improvement.board.manage';
  END IF;

  SELECT id, status INTO v_id, v_status
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: no % artifact for that area', p_artifact_type;
  END IF;
  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: already approved';
  END IF;

  UPDATE public.mba_dept_artifacts
  SET content      = COALESCE(p_content, content),
      status       = 'approved',
      reviewed_by  = auth.uid(),
      reviewed_at  = now(),
      review_notes = p_review_notes,
      updated_by   = auth.uid(),
      updated_at   = now()
  WHERE id = v_id;

  -- history snapshot (immutable record of this approved version)
  INSERT INTO public.mba_dept_artifact_versions (
    artifact_id, area_id, artifact_type, content, version, approved_by, approved_at
  )
  SELECT id, area_id, artifact_type, content, version, reviewed_by, reviewed_at
  FROM public.mba_dept_artifacts WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_approve(uuid, text, jsonb, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_approve(uuid, text, jsonb, text) TO authenticated;

-- 3) request_changes now notifies the area's associates (best-effort).
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_request_changes(
  p_area_id       uuid,
  p_artifact_type text,
  p_review_notes  text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_notif uuid; v_label text; v_recipients uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: requires improvement.board.manage';
  END IF;

  SELECT id INTO v_id
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: no % artifact for that area', p_artifact_type;
  END IF;

  UPDATE public.mba_dept_artifacts
  SET status       = 'needs_changes',
      reviewed_by  = auth.uid(),
      reviewed_at  = now(),
      review_notes = p_review_notes,
      updated_by   = auth.uid(),
      updated_at   = now()
  WHERE id = v_id;

  -- Notify the area's associates (best-effort: never block the status change).
  BEGIN
    SELECT array_agg(DISTINCT ap.associate_user_id) INTO v_recipients
    FROM public.mba_associate_postings ap
    WHERE ap.area_id = p_area_id AND ap.associate_user_id IS NOT NULL;

    IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) > 0 THEN
      SELECT label INTO v_label FROM public.improvement_areas WHERE id = p_area_id;
      INSERT INTO public.notifications (title, body, category, url, priority, created_by)
      VALUES (
        'Playbook changes requested — ' || COALESCE(v_label, 'department') || ' · ' || p_artifact_type,
        COALESCE(NULLIF(btrim(p_review_notes), ''), 'A manager requested changes.'),
        'improvement:playbook', '/improvement-board/analytics', 'normal', auth.uid()
      )
      RETURNING id INTO v_notif;
      INSERT INTO public.user_notifications (notification_id, user_id)
      SELECT v_notif, unnest(v_recipients);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- notification is best-effort
  END;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) TO authenticated;

-- ============================================================================
-- Delta 4: MBA department playbooks — notify BOARD MANAGERS (not associates) on
-- request-changes, + a manager-gated delete. (2026-07-28 interview round 4.)
-- Only managers can draft, so the people who can act on 'request changes' are
-- other managers — use the canonical resolver tms_users_with_permission.
-- ============================================================================

-- 1) request_changes now notifies OTHER board managers (best-effort).
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_request_changes(
  p_area_id       uuid,
  p_artifact_type text,
  p_review_notes  text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_notif uuid; v_label text; v_recipients uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: requires improvement.board.manage';
  END IF;

  SELECT id INTO v_id
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: no % artifact for that area', p_artifact_type;
  END IF;

  UPDATE public.mba_dept_artifacts
  SET status       = 'needs_changes',
      reviewed_by  = auth.uid(),
      reviewed_at  = now(),
      review_notes = p_review_notes,
      updated_by   = auth.uid(),
      updated_at   = now()
  WHERE id = v_id;

  -- Notify OTHER board managers (they can actually redraft/fix it). Best-effort.
  BEGIN
    SELECT array_agg(u) INTO v_recipients
    FROM (
      SELECT u FROM public.tms_users_with_permission('improvement.board.manage') u
      WHERE u <> auth.uid()
      LIMIT 50   -- notifications are capped at 50 recipients
    ) s;

    IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) > 0 THEN
      SELECT label INTO v_label FROM public.improvement_areas WHERE id = p_area_id;
      INSERT INTO public.notifications (title, body, category, url, priority, created_by)
      VALUES (
        'Playbook changes requested — ' || COALESCE(v_label, 'department') || ' · ' || p_artifact_type,
        COALESCE(NULLIF(btrim(p_review_notes), ''), 'A manager requested changes.'),
        'improvement:playbook', '/improvement-board/analytics', 'normal', auth.uid()
      )
      RETURNING id INTO v_notif;
      INSERT INTO public.user_notifications (notification_id, user_id)
      SELECT v_notif, unnest(v_recipients);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- notification is best-effort; never block the status change
  END;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) TO authenticated;

-- 2) delete — manager-gated; removes the artifact (its versions cascade away).
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_delete(
  p_area_id       uuid,
  p_artifact_type text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_delete: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_delete: requires improvement.board.manage';
  END IF;

  DELETE FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_delete(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_delete(uuid, text) TO authenticated;
