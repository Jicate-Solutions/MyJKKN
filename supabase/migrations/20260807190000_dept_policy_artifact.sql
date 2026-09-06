-- Migration: department POLICY document — a fourth department-playbook artifact
-- Created: 2026-07-29
-- Module: MBA Improvement Board → Department Playbook (organogram / SOP / workflow
--         + NEW 'policy'). Home = /improvement-board/analytics.
--
-- Director's decisions encoded here (2026-07-29):
--  1. 'policy' is a FOURTH artifact_type on the EXISTING mba_dept_artifacts —
--     not a new subsystem. Same lifecycle, same RLS audience, same print/history.
--  2. Two ways to get one: UPLOAD a real document, or AI-DRAFT it (₹0 Max lane).
--  3. AN UPLOADED FILE ALWAYS WINS. Once a document is uploaded it IS the policy:
--     the row flips to source='upload' + status='approved', and the AI writer RPC
--     refuses to overwrite it. The two are never live as co-equals.
--  4. Upload / approve a policy = officer action (CEO / CAO / EAO), held under a
--     NEW permission key 'improvement.area_policy.approve'. Board managers keep
--     DRAFT + SEE. Gated on the KEY, never a hardcoded role name.
--  5. Visibility is UNCHANGED — board people only, the same audience that already
--     sees the organogram/SOP (mba_dept_artifacts_select). Nothing is widened.
--  6. Old versions survive. Every upload snapshots what was standing into
--     mba_dept_artifact_versions and marks the previous rows superseded (when, and
--     by whom), so the newest upload is live and older ones stay viewable.
--
-- Files live in a PRIVATE storage bucket ('dept-policies'); the app serves them by
-- short-lived signed URL only. Storage RLS mirrors the artifact audience as
-- defence-in-depth (the upload/read routes use the service-role client).
-- ============================================================================

-- 1) artifact_type CHECK += 'policy' ─────────────────────────────────────────
ALTER TABLE public.mba_dept_artifacts
  DROP CONSTRAINT IF EXISTS mba_dept_artifacts_artifact_type_check;
ALTER TABLE public.mba_dept_artifacts
  ADD CONSTRAINT mba_dept_artifacts_artifact_type_check
  CHECK (artifact_type IN ('organogram', 'sop', 'workflow', 'policy'));

-- 2) Upload columns on the live row ──────────────────────────────────────────
-- `source` is the discriminator that makes decision 3 checkable in one predicate.
ALTER TABLE public.mba_dept_artifacts
  ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'ai_draft',
  ADD COLUMN IF NOT EXISTS file_path   text,
  ADD COLUMN IF NOT EXISTS file_name   text,
  ADD COLUMN IF NOT EXISTS file_size   bigint,
  ADD COLUMN IF NOT EXISTS file_mime   text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

ALTER TABLE public.mba_dept_artifacts
  DROP CONSTRAINT IF EXISTS mba_dept_artifacts_source_check;
ALTER TABLE public.mba_dept_artifacts
  ADD CONSTRAINT mba_dept_artifacts_source_check
  CHECK (source IN ('ai_draft', 'upload'));

-- A row that claims to be an upload must actually point at a stored object.
ALTER TABLE public.mba_dept_artifacts
  DROP CONSTRAINT IF EXISTS mba_dept_artifacts_upload_needs_file;
ALTER TABLE public.mba_dept_artifacts
  ADD CONSTRAINT mba_dept_artifacts_upload_needs_file
  CHECK (source <> 'upload' OR (file_path IS NOT NULL AND btrim(file_path) <> ''));

COMMENT ON COLUMN public.mba_dept_artifacts.source IS
  'ai_draft | upload. An uploaded document always wins: the AI writer RPC refuses to overwrite a row whose source is upload.';

-- 3) History carries uploads too (decision 6) ────────────────────────────────
-- mba_dept_artifact_versions already stores one immutable snapshot per approved
-- version; extend it rather than build a parallel store.
ALTER TABLE public.mba_dept_artifact_versions
  ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'ai_draft',
  ADD COLUMN IF NOT EXISTS file_path     text,
  ADD COLUMN IF NOT EXISTS file_name     text,
  ADD COLUMN IF NOT EXISTS file_size     bigint,
  ADD COLUMN IF NOT EXISTS file_mime     text,
  ADD COLUMN IF NOT EXISTS uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.mba_dept_artifact_versions.superseded_at IS
  'Set when a newer policy document replaced this version. NULL = this is the live one.';

-- 4) The new permission key, granted to the three offices ────────────────────
-- custom_roles.permissions stores keys FLAT, and Role Management writes an
-- unchecked box as key-present-value-false — so the VALUE is what matters, both
-- here and in every check below (user_has_permission compares the value).
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb)
                  || jsonb_build_object('improvement.area_policy.approve', true),
    updated_at  = now()
WHERE role_key IN ('ceo', 'cao', 'executive_admin_officer')
  AND COALESCE((permissions->>'improvement.area_policy.approve')::boolean, false) IS DISTINCT FROM true;

-- 5) PRIVATE storage bucket for uploaded policy documents ────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dept-policies',
  'dept-policies',
  false,                                   -- PRIVATE: served by signed URL only
  10485760,                                -- 10 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS — objects are laid out as "<area_id>/<uuid>.<ext>", so the first
-- path segment is the area. READ mirrors mba_dept_artifacts_select exactly
-- (decision 5: do not widen). WRITE is officers only (decision 4).
DROP POLICY IF EXISTS dept_policies_storage_select ON storage.objects;
CREATE POLICY dept_policies_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dept-policies'
    AND (
      COALESCE(public.is_super_admin(), false)
      OR public.is_admin()
      OR public.user_has_permission('improvement.board.manage')
      OR public.user_has_permission('improvement.area_policy.approve')
      OR (
        public.user_has_permission('improvement.ideas.view')
        AND EXISTS (
          SELECT 1 FROM public.mba_associate_postings p
          WHERE p.associate_user_id = auth.uid()
            AND p.area_id::text = (storage.foldername(objects.name))[1]
        )
      )
    )
  );

DROP POLICY IF EXISTS dept_policies_storage_insert ON storage.objects;
CREATE POLICY dept_policies_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dept-policies'
    AND (
      COALESCE(public.is_super_admin(), false)
      OR public.user_has_permission('improvement.area_policy.approve')
    )
  );

DROP POLICY IF EXISTS dept_policies_storage_update ON storage.objects;
CREATE POLICY dept_policies_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dept-policies'
    AND (
      COALESCE(public.is_super_admin(), false)
      OR public.user_has_permission('improvement.area_policy.approve')
    )
  )
  WITH CHECK (
    bucket_id = 'dept-policies'
    AND (
      COALESCE(public.is_super_admin(), false)
      OR public.user_has_permission('improvement.area_policy.approve')
    )
  );

DROP POLICY IF EXISTS dept_policies_storage_delete ON storage.objects;
CREATE POLICY dept_policies_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dept-policies'
    AND (
      COALESCE(public.is_super_admin(), false)
      OR public.user_has_permission('improvement.area_policy.approve')
    )
  );

-- 5b) The officers must be able to READ what they are asked to sign off ──────
-- Decision 5 says do not widen the audience, and this does not: the only people
-- who hold improvement.area_policy.approve are the three offices the Director put
-- in charge of the policy. Without this branch the key is inert for two of them —
-- checked on production 2026-07-29: ceo has improvement.board.manage = true, but
-- cao has it FALSE and executive_admin_officer has no value at all, so neither
-- could read mba_dept_artifacts, and the signed-URL route would answer 404 for
-- the very officer who uploaded the document. A permission to approve something
-- you cannot see is not a permission.
DROP POLICY IF EXISTS mba_dept_artifacts_select ON public.mba_dept_artifacts;
CREATE POLICY mba_dept_artifacts_select ON public.mba_dept_artifacts
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
    OR public.user_has_permission('improvement.area_policy.approve')
    OR (
      public.user_has_permission('improvement.ideas.view')
      AND EXISTS (
        SELECT 1 FROM public.mba_associate_postings p
        WHERE p.area_id = mba_dept_artifacts.area_id
          AND p.associate_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS mba_dept_artifact_versions_select ON public.mba_dept_artifact_versions;
CREATE POLICY mba_dept_artifact_versions_select ON public.mba_dept_artifact_versions
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
    OR public.user_has_permission('improvement.area_policy.approve')
    OR (
      public.user_has_permission('improvement.ideas.view')
      AND EXISTS (
        SELECT 1 FROM public.mba_associate_postings p
        WHERE p.area_id = mba_dept_artifact_versions.area_id
          AND p.associate_user_id = auth.uid()
      )
    )
  );

-- 6) AI writer — accept 'policy', and NEVER overwrite an uploaded document ───
-- Body is the live production definition (md5 d5faf0cb62cfa88c29b1f75822b3999b)
-- with two edits: the valid-type list, and the upload lock.
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
  IF p_artifact_type NOT IN ('organogram','sop','workflow','policy') THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_ai_draft_upsert: invalid artifact_type %', p_artifact_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_ai_draft_upsert: no such improvement_area %', p_area_id;
  END IF;

  -- LOCK 1: an approved artifact must be reopened before a new AI draft replaces it.
  IF EXISTS (
    SELECT 1 FROM public.mba_dept_artifacts
    WHERE area_id = p_area_id AND artifact_type = p_artifact_type AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_ai_draft_upsert: % artifact is approved and locked — reopen it first', p_artifact_type;
  END IF;

  -- LOCK 2 (uploaded wins): a real document beats any AI draft, full stop.
  IF EXISTS (
    SELECT 1 FROM public.mba_dept_artifacts
    WHERE area_id = p_area_id AND artifact_type = p_artifact_type AND source = 'upload'
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_ai_draft_upsert: a document has been uploaded for this % — the uploaded file is the record and an AI draft cannot replace it', p_artifact_type;
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
    status        = 'ai_drafted',
    version       = public.mba_dept_artifacts.version + 1,
    ai_model      = EXCLUDED.ai_model,
    ai_prompt     = EXCLUDED.ai_prompt,
    ai_job_id     = EXCLUDED.ai_job_id,
    ai_drafted_at = now(),
    reviewed_by   = NULL,
    reviewed_at   = NULL,
    review_notes  = NULL,
    updated_at    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_ai_draft_upsert(uuid, text, jsonb, text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_ai_draft_upsert(uuid, text, jsonb, text, text, uuid) TO service_role;

-- 7) approve — a POLICY is approved by an officer, everything else unchanged ──
-- Base: live production definition (md5 89ad2cc260dbf3a5605215b972e96533).
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
DECLARE v_id uuid; v_status text; v_source text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: not authenticated';
  END IF;

  IF p_artifact_type = 'policy' THEN
    -- A department policy is an official institution document, so signing it off
    -- is an officer action (CEO / CAO / EAO), not a board-manager one.
    IF NOT (
      COALESCE(public.is_super_admin(), false)
      OR public.user_has_permission('improvement.area_policy.approve')
    ) THEN
      RAISE EXCEPTION 'fn_mba_dept_artifact_approve: approving a policy requires improvement.area_policy.approve (CEO / CAO / EAO)';
    END IF;
  ELSIF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: requires improvement.board.manage';
  END IF;

  SELECT id, status, source INTO v_id, v_status, v_source
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: no % artifact for that area', p_artifact_type;
  END IF;
  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: already approved';
  END IF;

  -- An uploaded document is already the record; it is not edited-then-approved.
  IF v_source = 'upload' THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_approve: an uploaded document is already the record — replace the file instead';
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
    artifact_id, area_id, artifact_type, content, version, approved_by, approved_at, source
  )
  SELECT id, area_id, artifact_type, content, version, reviewed_by, reviewed_at, source
  FROM public.mba_dept_artifacts WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_approve(uuid, text, jsonb, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_approve(uuid, text, jsonb, text) TO authenticated;

-- 8) request changes — managers keep it, but cannot un-live an uploaded policy ─
-- Base: live production definition (md5 84f6d5c19b5ac744a0fa9b2e11c12710), which
-- already supplies notifications.targeting. Only the upload guard is added.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_request_changes(
  p_area_id       uuid,
  p_artifact_type text,
  p_review_notes  text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_source text; v_notif uuid; v_label text; v_recipients uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
    OR public.user_has_permission('improvement.area_policy.approve')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: requires improvement.board.manage';
  END IF;

  SELECT id, source INTO v_id, v_source
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: no % artifact for that area', p_artifact_type;
  END IF;

  -- An uploaded document IS the policy. A board manager asking for changes must
  -- not knock it out of "approved" — only an officer replacing the file can.
  IF v_source = 'upload' AND NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_policy.approve')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_request_changes: an uploaded document is the record — only the CEO / CAO / EAO can change its state';
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
      -- targeting is NOT NULL on notifications; supplying it is what makes this
      -- insert (and therefore the manager notification) actually succeed.
      INSERT INTO public.notifications (title, body, category, targeting, url, priority, created_by)
      VALUES (
        'Playbook changes requested — ' || COALESCE(v_label, 'department') || ' · ' || p_artifact_type,
        COALESCE(NULLIF(btrim(p_review_notes), ''), 'A manager requested changes.'),
        'improvement:playbook',
        jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recipients)),
        '/improvement-board/analytics', 'normal', auth.uid()
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

-- 9) reopen — a policy can only be reopened by an officer ─────────────────────
-- Base: live production definition (md5 5a8210a74c18064202bec727c69d17a2).
CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_reopen(
  p_area_id       uuid,
  p_artifact_type text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_status text; v_source text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: not authenticated';
  END IF;

  IF p_artifact_type = 'policy' THEN
    IF NOT (
      COALESCE(public.is_super_admin(), false)
      OR public.user_has_permission('improvement.area_policy.approve')
    ) THEN
      RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: reopening a policy requires improvement.area_policy.approve (CEO / CAO / EAO)';
    END IF;
  ELSIF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: requires improvement.board.manage';
  END IF;

  SELECT id, status, source INTO v_id, v_status, v_source
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = p_artifact_type
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: no % artifact for that area', p_artifact_type;
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: only an approved artifact can be reopened';
  END IF;
  IF v_source = 'upload' THEN
    RAISE EXCEPTION 'fn_mba_dept_artifact_reopen: an uploaded document is the record — upload a replacement instead of reopening';
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

-- 10) delete — removing a policy (and its document history) is an officer act ─
-- Base: live production definition (md5 622196231388bf98d6ee1489f91b6cf7).
-- Note: the stored objects themselves are not removed here (SQL cannot reach the
-- storage API). They stay in a private bucket with no row left that would let
-- anyone mint a signed URL for them.
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

  IF p_artifact_type = 'policy' THEN
    IF NOT (
      COALESCE(public.is_super_admin(), false)
      OR public.user_has_permission('improvement.area_policy.approve')
    ) THEN
      RAISE EXCEPTION 'fn_mba_dept_artifact_delete: deleting a policy requires improvement.area_policy.approve (CEO / CAO / EAO)';
    END IF;
  ELSIF NOT (
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

-- 11) NEW RPC — record an uploaded policy document (officers only) ────────────
-- The route puts the object in the private bucket first, then calls this with the
-- caller's own JWT so the DB re-checks the authority (defence in depth: the route
-- uploads with the service-role key, which bypasses storage RLS). If this raises,
-- the route removes the object it just wrote, so a rejected upload leaves nothing.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_policy_upload(
  p_area_id   uuid,
  p_file_path text,
  p_file_name text,
  p_file_size bigint DEFAULT NULL,
  p_file_mime text   DEFAULT NULL,
  p_note      text   DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_version integer;
  v_name    text;
  v_path    text;
  v_content jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_policy_upload: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_policy.approve')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_policy_upload: requires improvement.area_policy.approve (CEO / CAO / EAO)';
  END IF;

  v_path := btrim(COALESCE(p_file_path, ''));
  v_name := NULLIF(btrim(COALESCE(p_file_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_policy_upload: file_name is required';
  END IF;
  -- Objects live under "<area_id>/<name>". Pinning the shape here stops a caller
  -- pointing one department's policy row at another department's object.
  IF v_path !~ ('^' || p_area_id::text || '/[A-Za-z0-9._-]{1,200}$') THEN
    RAISE EXCEPTION 'fn_mba_dept_policy_upload: file_path must be "<area_id>/<file>"';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_policy_upload: no such improvement_area %', p_area_id;
  END IF;

  SELECT id, version INTO v_id, v_version
  FROM public.mba_dept_artifacts
  WHERE area_id = p_area_id AND artifact_type = 'policy'
  FOR UPDATE;

  -- Nothing already on record is destroyed: snapshot the standing row first if it
  -- was never written to history (an AI draft that was never approved has no
  -- version row of its own, and would otherwise be overwritten and lost).
  IF v_id IS NOT NULL THEN
    INSERT INTO public.mba_dept_artifact_versions (
      artifact_id, area_id, artifact_type, content, version,
      approved_by, approved_at, source,
      file_path, file_name, file_size, file_mime, uploaded_by, uploaded_at
    )
    SELECT a.id, a.area_id, a.artifact_type, a.content, a.version,
           a.reviewed_by, a.reviewed_at, a.source,
           a.file_path, a.file_name, a.file_size, a.file_mime, a.uploaded_by, a.uploaded_at
    FROM public.mba_dept_artifacts a
    WHERE a.id = v_id
      AND NOT EXISTS (
        SELECT 1 FROM public.mba_dept_artifact_versions v
        WHERE v.artifact_id = a.id AND v.version = a.version
      );
  END IF;

  -- Everything already on record is superseded BY THIS upload — recorded with the
  -- moment and the person, which is what makes the history readable.
  UPDATE public.mba_dept_artifact_versions
  SET superseded_at = now(), superseded_by = auth.uid()
  WHERE area_id = p_area_id AND artifact_type = 'policy' AND superseded_at IS NULL;

  v_content := jsonb_build_object(
    'source', 'upload',
    'file_name', v_name,
    'uploaded_at', to_jsonb(now()),
    'note', COALESCE(
      NULLIF(btrim(COALESCE(p_note, '')), ''),
      'Uploaded document — this file is the department policy.'
    )
  );

  IF v_id IS NULL THEN
    INSERT INTO public.mba_dept_artifacts (
      area_id, artifact_type, content, status, version, source,
      file_path, file_name, file_size, file_mime, uploaded_by, uploaded_at,
      reviewed_by, reviewed_at, created_by, updated_by, updated_at
    ) VALUES (
      p_area_id, 'policy', v_content, 'approved', 1, 'upload',
      v_path, v_name, p_file_size, p_file_mime, auth.uid(), now(),
      auth.uid(), now(), auth.uid(), auth.uid(), now()
    )
    RETURNING id, version INTO v_id, v_version;
  ELSE
    UPDATE public.mba_dept_artifacts
    SET content      = v_content,
        status       = 'approved',      -- decision 3: the uploaded file IS the policy
        source       = 'upload',
        version      = version + 1,
        file_path    = v_path,
        file_name    = v_name,
        file_size    = p_file_size,
        file_mime    = p_file_mime,
        uploaded_by  = auth.uid(),
        uploaded_at  = now(),
        reviewed_by  = auth.uid(),
        reviewed_at  = now(),
        review_notes = NULL,
        updated_by   = auth.uid(),
        updated_at   = now()
    WHERE id = v_id
    RETURNING version INTO v_version;
  END IF;

  -- The live version is on the history too, un-superseded, so "every version with
  -- its date and who replaced it" reads off one table.
  INSERT INTO public.mba_dept_artifact_versions (
    artifact_id, area_id, artifact_type, content, version,
    approved_by, approved_at, source,
    file_path, file_name, file_size, file_mime, uploaded_by, uploaded_at
  ) VALUES (
    v_id, p_area_id, 'policy', v_content, v_version,
    auth.uid(), now(), 'upload',
    v_path, v_name, p_file_size, p_file_mime, auth.uid(), now()
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_policy_upload(uuid, text, text, bigint, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_policy_upload(uuid, text, text, bigint, text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_mba_dept_policy_upload(uuid, text, text, bigint, text, text) IS
  'Records an uploaded department policy document as the live policy artifact (source=upload, status=approved) and snapshots the previous version. CEO / CAO / EAO only (improvement.area_policy.approve).';
