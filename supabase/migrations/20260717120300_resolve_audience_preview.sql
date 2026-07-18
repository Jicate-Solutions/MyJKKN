-- Migration: ephemeral audience preview (compliance-6)
-- resolve_audience(p_audience_id) only accepts a PERSISTED audience row, which
-- forced the form to INSERT a real notification_audiences row on every Preview
-- click (DB pollution) and then navigate away. This wrapper lets the API
-- preview an UNSAVED audience: it inserts a temporary row inside its own
-- transaction, delegates to the existing resolve_audience (so the preview
-- matches production send-resolution EXACTLY), deletes the temp row, and
-- returns before commit — so NO audience row is ever persisted.
--
-- Granted to service_role ONLY (NOT authenticated): it is called from the POST
-- /audiences route via the service-role client, mirroring resolve_audience,
-- which is SECURITY DEFINER and granted to service_role only.
CREATE OR REPLACE FUNCTION public.resolve_audience_preview(
  p_query_type text,
  p_query_params jsonb
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_result json;
BEGIN
  INSERT INTO public.notification_audiences
    (name, query_type, query_params, is_active, created_by)
  VALUES
    ('__preview__' || gen_random_uuid()::text, p_query_type, p_query_params, true, auth.uid())
  RETURNING id INTO v_id;

  -- Reuse the exact production resolver so preview == send resolution.
  v_result := public.resolve_audience(v_id);

  -- Undo the transient row so nothing is persisted on commit. (If
  -- resolve_audience raises, the whole function transaction rolls back and the
  -- row is removed automatically.)
  DELETE FROM public.notification_audiences WHERE id = v_id;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_audience_preview(text, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_audience_preview(text, jsonb) TO service_role;