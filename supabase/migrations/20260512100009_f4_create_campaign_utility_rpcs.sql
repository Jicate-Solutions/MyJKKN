-- ──────────────────────────────────────────────────────────────
-- Migration F4: Campaign utility RPCs
-- increment_campaign_link_clicks    — one-round-trip counter bump for /c/{token}
-- get_campaigns_overview_stats      — landing-page aggregate KPIs (admin.campaigns.view)
-- reconcile_campaign_link_counters  — manual drift recovery (admin.campaigns.edit)
-- ──────────────────────────────────────────────────────────────

-- 9.1 increment_campaign_link_clicks ─────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_campaign_link_clicks(p_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE admission_campaign_links
     SET click_count = click_count + 1,
         updated_at  = now()
   WHERE id = p_link_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_campaign_link_clicks(uuid) TO authenticated;


-- 9.2 get_campaigns_overview_stats ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_campaigns_overview_stats(
  p_start_date timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_end_date   timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.campaigns.view')
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  WITH visible_campaigns AS (
    SELECT id, status, budget_inr, archived_at
      FROM admission_campaigns
     WHERE archived_at IS NULL
       AND (is_super_admin() OR is_admin() OR role_has_institution_access(institution_id))
  ),
  visible_links AS (
    SELECT l.id, l.cost_inr, l.click_count, l.capture_count
      FROM admission_campaign_links l
      JOIN visible_campaigns c ON c.id = l.campaign_id
  )
  SELECT jsonb_build_object(
    'total_active',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'active'),
    'total_paused',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'paused'),
    'total_archived',  0,
    'total_spent_inr', COALESCE((SELECT SUM(cost_inr) FROM visible_links), 0),
    'total_clicks',    COALESCE((SELECT SUM(click_count) FROM visible_links), 0),
    'total_captures',  COALESCE((SELECT SUM(capture_count) FROM visible_links), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_overview_stats(timestamptz, timestamptz) TO authenticated;


-- 9.3 reconcile_campaign_link_counters ───────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_campaign_link_counters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clicks_updated   integer;
  v_captures_updated integer;
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.campaigns.edit')
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  UPDATE admission_campaign_links l
     SET click_count = sub.n
    FROM (
      SELECT l2.id AS link_id,
             COALESCE((SELECT COUNT(*) FROM admission_campaign_link_clicks c WHERE c.link_id = l2.id), 0)::integer AS n
        FROM admission_campaign_links l2
    ) sub
   WHERE l.id = sub.link_id
     AND l.click_count <> sub.n;
  GET DIAGNOSTICS v_clicks_updated = ROW_COUNT;

  UPDATE admission_campaign_links l
     SET capture_count = sub.n
    FROM (
      SELECT l2.id AS link_id,
             COALESCE((SELECT COUNT(*) FROM admission_lead_source_captures c
                        WHERE c.campaign_link_id = l2.id), 0)::integer AS n
        FROM admission_campaign_links l2
    ) sub
   WHERE l.id = sub.link_id
     AND l.capture_count <> sub.n;
  GET DIAGNOSTICS v_captures_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'clicks_updated',   v_clicks_updated,
    'captures_updated', v_captures_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_campaign_link_counters() TO authenticated;
