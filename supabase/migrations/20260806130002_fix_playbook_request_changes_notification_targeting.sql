-- Migration: Fix fn_mba_dept_artifact_request_changes — deliver the manager notification
-- Created: 2026-07-28
-- The playbook "request changes" RPC notifies OTHER board managers, but its
-- notifications insert omitted the `targeting` column (NOT NULL on notifications).
-- Because the notify block is wrapped in EXCEPTION WHEN OTHERS THEN NULL
-- (best-effort), the insert raised and was silently swallowed: the status change
-- to 'needs_changes' worked, but managers were never actually notified.
-- Fix: supply the required per-user `targeting` shape in the insert. Everything
-- else (auth check, improvement.board.manage gate, FOR UPDATE, status update,
-- recipient resolution via tms_users_with_permission, best-effort wrapper) is
-- unchanged. Verified on prod 2026-07-28: md5 changed, targeting present, anon-locked.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mba_dept_artifact_request_changes(p_area_id uuid, p_artifact_type text, p_review_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Keep the RPC anon-locked across the replace (defensive; CI anon-lock gate).
REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_artifact_request_changes(uuid, text, text) TO authenticated;
