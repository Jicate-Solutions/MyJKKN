-- 2026-07-06 — Department Engagement Loop, owner surface: set the handle's brief.
-- social_dept_accounts is a credential vault (login_password) — SELECT is admin-only and
-- there is NO authenticated write policy (writes are service_role only). So a non-admin
-- accountable owner cannot UPDATE purpose_line/content_playbook directly. This SECDEF RPC
-- lets a handle MANAGER (admin / social.manage / accountable_owner_id) set ONLY the three
-- brief fields — never credentials — via fn_social_can_manage_handle.
CREATE OR REPLACE FUNCTION public.fn_social_set_handle_brief(
  p_dept_account_id     uuid,
  p_purpose_line        text,
  p_content_playbook    text,
  p_posting_cadence_days int DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_social_can_manage_handle(p_dept_account_id) THEN
    RAISE EXCEPTION 'not permitted to manage this handle' USING ERRCODE = '42501';
  END IF;
  -- Enforce the same 1..30 bound the UI clamps, so a direct API caller can't persist a
  -- nonsensical cadence (0 / negative / huge). NULL means "leave unchanged".
  IF p_posting_cadence_days IS NOT NULL AND (p_posting_cadence_days < 1 OR p_posting_cadence_days > 30) THEN
    RAISE EXCEPTION 'posting_cadence_days must be between 1 and 30' USING ERRCODE = '22023';
  END IF;
  -- Partial-update contract: a NULL param means "leave unchanged"; a provided value (even
  -- empty) sets/clears the field. This matches the cadence coalesce semantics and prevents a
  -- PATCH that omits a text field from silently wiping the existing purpose line / playbook.
  UPDATE public.social_dept_accounts
     SET purpose_line         = CASE WHEN p_purpose_line IS NULL THEN purpose_line
                                     ELSE nullif(btrim(p_purpose_line), '') END,
         content_playbook     = CASE WHEN p_content_playbook IS NULL THEN content_playbook
                                     ELSE nullif(btrim(p_content_playbook), '') END,
         posting_cadence_days = coalesce(p_posting_cadence_days, posting_cadence_days),
         updated_at           = now()
   WHERE id = p_dept_account_id;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_set_handle_brief(uuid, text, text, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_set_handle_brief(uuid, text, text, int) TO authenticated;

-- Owner-facing read: the handles a manager may curate, with their current brief + live tier.
-- Returns ONLY safe columns (never login_email/login_password). Managers see the handles they
-- own (accountable_owner_id) or, for admins/social.manage, all handles.
CREATE OR REPLACE FUNCTION public.fn_social_managed_handles()
RETURNS TABLE(
  dept_account_id uuid, username text, department_name text, college_label text,
  purpose_line text, content_playbook text, posting_cadence_days int,
  lifecycle_status text, metrics_source text, is_owner boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sda.id, sda.username, sda.department_name_raw, sda.college_label,
         sda.purpose_line, sda.content_playbook, sda.posting_cadence_days,
         sda.lifecycle_status, a.metrics_source,
         (sda.accountable_owner_id = auth.uid()) AS is_owner
  FROM public.social_dept_accounts sda
  LEFT JOIN public.ig_accounts a ON a.id = sda.ig_account_id
  WHERE sda.platform = 'instagram'
    AND public.fn_social_can_manage_handle(sda.id)
  ORDER BY sda.college_label, sda.username;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_managed_handles() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_managed_handles() TO authenticated;
