-- Migration: project_change_requests — permission hardening + notifications
-- Date: 2026-07-25
-- Why: Change Requests (PM module, Feature F14) shipped with a wide-open RLS policy
--   (`project_change_requests_write` = FOR ALL USING auth.uid() IS NOT NULL) — ANY
--   logged-in user could create / approve / reject / delete ANY request on ANY
--   project. This migration locks the base table to read-only for project members
--   & admins and routes every mutation through SECURITY DEFINER RPCs that enforce
--   the agreed rules (interview 2026-07-24/25):
--     • raise  : project member (owner + project_members) OR admin
--     • decide : minor -> project owner (or admin); major -> admin only
--     • edit   : requester only, while status='submitted' (is_major/status frozen)
--     • delete : requester only, while status='submitted'
--     • decided rows are locked (no edit / delete / re-decide) — audit integrity
--   RPCs also fan out in-app notifications: approver on a new request, requester on
--   a decision. (The legacy ai_rpc_send_notification is stale vs the current
--   notifications schema, so fanout is done inline here.)
-- Identity: auth.uid() = profiles.id; project owner = projects.owner_staff_id ->
--   staff.id, mapped to a user via staff.profile_id.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER so the membership check ignores the caller's
-- own row-visibility). REVOKE anon per the mandatory RPC-locking policy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_is_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    JOIN staff s ON s.id = p.owner_staff_id
    WHERE p.id = p_project_id
      AND s.profile_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_is_project_owner(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_project_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_is_project_owner(p_project_id)
      OR EXISTS (
        SELECT 1
        FROM project_members pm
        JOIN staff s ON s.id = pm.staff_id
        WHERE pm.project_id = p_project_id
          AND s.profile_id = auth.uid()
      );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_is_project_member(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_project_member(uuid) TO authenticated;

-- Internal fanout helper. Not callable by clients (revoked from authenticated too);
-- only invoked by the SECDEF RPCs below, which run as the function owner.
CREATE OR REPLACE FUNCTION public.fn_cr_notify(
  p_creator     uuid,
  p_recipients  uuid[],
  p_title       text,
  p_body        text,
  p_url         text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nid uuid;
  v_recipients uuid[];
BEGIN
  -- de-dup, drop nulls, and never notify the actor about their own action
  SELECT array_agg(DISTINCT r)
    INTO v_recipients
  FROM unnest(COALESCE(p_recipients, ARRAY[]::uuid[])) AS r
  WHERE r IS NOT NULL AND r IS DISTINCT FROM p_creator;

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (title, body, created_by, targeting, kind, category, priority, url)
  VALUES (
    p_title,
    p_body,
    COALESCE(p_creator, v_recipients[1]),
    jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recipients)),
    'work_item',
    'projects:change_request',
    'normal',
    p_url
  )
  RETURNING id INTO v_nid;

  INSERT INTO user_notifications (notification_id, user_id)
  SELECT v_nid, r FROM unnest(v_recipients) AS r;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cr_notify(uuid, uuid[], text, text, text) FROM anon, PUBLIC, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Mutation RPCs — all enforce authz + status rules in one place.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_create_change_request(
  p_project_id     uuid,
  p_change_type    text,
  p_title          text,
  p_description    text    DEFAULT NULL,
  p_impact_summary text    DEFAULT NULL,
  p_is_major       boolean DEFAULT false
) RETURNS public.project_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_row        public.project_change_requests;
  v_owner      uuid;
  v_recipients uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.' USING errcode = '28000';
  END IF;
  IF NOT (public.fn_is_project_member(p_project_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this project.' USING errcode = '42501';
  END IF;
  IF p_change_type IS NULL OR p_change_type NOT IN ('scope', 'timeline', 'budget', 'other') THEN
    RAISE EXCEPTION 'Invalid change type: %', p_change_type USING errcode = '22023';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required.' USING errcode = '22023';
  END IF;

  INSERT INTO project_change_requests
    (project_id, change_type, title, description, impact_summary, is_major, status, requested_by, created_by)
  VALUES
    (p_project_id, p_change_type, btrim(p_title),
     NULLIF(btrim(COALESCE(p_description, '')), ''),
     NULLIF(btrim(COALESCE(p_impact_summary, '')), ''),
     COALESCE(p_is_major, false), 'submitted', v_uid, v_uid)
  RETURNING * INTO v_row;

  -- approver recipients: minor -> project owner; major -> super admins
  IF v_row.is_major THEN
    SELECT array_agg(id) INTO v_recipients FROM profiles WHERE is_super_admin = true;
  ELSE
    SELECT s.profile_id INTO v_owner
    FROM projects p JOIN staff s ON s.id = p.owner_staff_id
    WHERE p.id = p_project_id;
    v_recipients := ARRAY[v_owner];
  END IF;

  PERFORM public.fn_cr_notify(
    v_uid,
    v_recipients,
    CASE WHEN v_row.is_major THEN 'Major change request raised' ELSE 'New change request' END,
    v_row.title,
    '/projects/' || p_project_id::text || '/changes'
  );

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_create_change_request(uuid, text, text, text, text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_create_change_request(uuid, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_update_change_request(
  p_id             uuid,
  p_change_type    text DEFAULT NULL,
  p_title          text DEFAULT NULL,
  p_description    text DEFAULT NULL,
  p_impact_summary text DEFAULT NULL
) RETURNS public.project_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.project_change_requests;
BEGIN
  SELECT * INTO v_row FROM project_change_requests WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change request not found.' USING errcode = 'P0002';
  END IF;
  IF v_row.requested_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the requester can edit this change.' USING errcode = '42501';
  END IF;
  IF v_row.status <> 'submitted' THEN
    RAISE EXCEPTION 'A decided change request can no longer be edited.' USING errcode = '42501';
  END IF;
  IF p_change_type IS NOT NULL AND p_change_type NOT IN ('scope', 'timeline', 'budget', 'other') THEN
    RAISE EXCEPTION 'Invalid change type: %', p_change_type USING errcode = '22023';
  END IF;

  UPDATE project_change_requests SET
    change_type    = COALESCE(p_change_type, change_type),
    title          = COALESCE(NULLIF(btrim(COALESCE(p_title, '')), ''), title),
    description    = NULLIF(btrim(COALESCE(p_description, '')), ''),
    impact_summary = NULLIF(btrim(COALESCE(p_impact_summary, '')), ''),
    updated_at     = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_update_change_request(uuid, text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_update_change_request(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_decide_change_request(
  p_id     uuid,
  p_status text
) RETURNS public.project_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_row     public.project_change_requests;
  v_allowed boolean;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.' USING errcode = '22023';
  END IF;
  SELECT * INTO v_row FROM project_change_requests WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change request not found.' USING errcode = 'P0002';
  END IF;
  IF v_row.status <> 'submitted' THEN
    RAISE EXCEPTION 'This change request has already been decided.' USING errcode = '42501';
  END IF;

  -- major -> admin only; minor -> project owner or admin
  IF v_row.is_major THEN
    v_allowed := public.is_admin();
  ELSE
    v_allowed := public.fn_is_project_owner(v_row.project_id) OR public.is_admin();
  END IF;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'You are not authorized to decide this change request.' USING errcode = '42501';
  END IF;

  UPDATE project_change_requests SET
    status     = p_status,
    decided_by = v_uid,
    decided_at = now(),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  PERFORM public.fn_cr_notify(
    v_uid,
    ARRAY[v_row.requested_by],
    'Change request ' || p_status,
    v_row.title,
    '/projects/' || v_row.project_id::text || '/changes'
  );

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_decide_change_request(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_decide_change_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_delete_change_request(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.project_change_requests;
BEGIN
  SELECT * INTO v_row FROM project_change_requests WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN; -- idempotent
  END IF;
  IF v_row.requested_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the requester can delete this change.' USING errcode = '42501';
  END IF;
  IF v_row.status <> 'submitted' THEN
    RAISE EXCEPTION 'A decided change request can no longer be deleted.' USING errcode = '42501';
  END IF;
  DELETE FROM project_change_requests WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_delete_change_request(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_delete_change_request(uuid) TO authenticated;

-- Read-only context for the UI (which buttons to show).
CREATE OR REPLACE FUNCTION public.fn_change_request_context(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'my_profile_id', auth.uid(),
    'is_admin',      public.is_admin(),
    'is_owner',      public.fn_is_project_owner(p_project_id),
    'is_member',     public.fn_is_project_member(p_project_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_change_request_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_change_request_context(uuid) TO authenticated;

-- NOTE: the RLS lockdown (making the base table read-only, forcing all writes
-- through the RPCs above) is a SEPARATE migration —
-- 20260725000001_project_change_requests_rls_lock.sql — applied only AFTER the
-- RPC-based application code is deployed. Applying it earlier would deny the
-- currently-deployed direct-insert path and break create during the deploy gap.
