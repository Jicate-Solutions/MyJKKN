-- ──────────────────────────────────────────────────────────────
-- Migration F1: get_campaign_funnel RPC
-- Returns 5-stage funnel (clicks, captures, qualified, applied, enrolled)
-- for a single campaign, scoped by first/last/any-touch attribution mode.
--
-- Funnel-stage rollups use FILTER (WHERE funnel_stage IN (...)) so
-- 'qualified' honestly includes all downstream stages (since funnel-stage
-- progression is a poset, not a strict ordering).
--
-- See spec §4.6 / design doc 2026-05-12.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_funnel(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',  -- 'first' | 'last' | 'any'
  p_start_date         timestamptz DEFAULT NULL,
  p_end_date           timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_institution_id uuid;
  v_link_ids       uuid[];
  v_clicks         integer := 0;
  v_captures       integer := 0;
  v_qualified      integer := 0;
  v_applied        integer := 0;
  v_enrolled       integer := 0;
BEGIN
  -- Access control
  SELECT institution_id INTO v_institution_id
    FROM admission_campaigns WHERE id = p_campaign_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('admission.campaigns.view')
        AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- Collect this campaign's link IDs (used in all subsequent queries)
  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links WHERE campaign_id = p_campaign_id;

  -- If no links exist yet, return all zeros (campaign just created)
  IF v_link_ids IS NULL OR cardinality(v_link_ids) = 0 THEN
    RETURN jsonb_build_object(
      'campaign_id',      p_campaign_id,
      'attribution_mode', p_attribution_mode,
      'date_range',       jsonb_build_object('from', p_start_date, 'to', p_end_date),
      'stages',           jsonb_build_object('clicks',0,'captures',0,'qualified',0,'applied',0,'enrolled',0),
      'rates',            jsonb_build_object('click_to_capture',0,'capture_to_qual',0,'qual_to_applied',0,'applied_to_enrol',0,'overall',0)
    );
  END IF;

  -- Clicks (from append-only log)
  SELECT COUNT(*) INTO v_clicks
    FROM admission_campaign_link_clicks
   WHERE link_id = ANY(v_link_ids)
     AND (p_start_date IS NULL OR clicked_at >= p_start_date)
     AND (p_end_date   IS NULL OR clicked_at <  p_end_date);

  -- Captures + funnel-stage rollups (attribution-mode aware)
  WITH attributed_leads AS (
    SELECT DISTINCT l.id, l.funnel_stage, l.created_at
      FROM admission_leads l
     WHERE
       CASE p_attribution_mode
         WHEN 'first' THEN l.first_campaign_link_id = ANY(v_link_ids)
         WHEN 'last'  THEN l.last_campaign_link_id  = ANY(v_link_ids)
         WHEN 'any'   THEN EXISTS (
           SELECT 1 FROM admission_lead_source_captures c
            WHERE c.lead_id = l.id AND c.campaign_link_id = ANY(v_link_ids)
         )
       END
       AND (p_start_date IS NULL OR l.created_at >= p_start_date)
       AND (p_end_date   IS NULL OR l.created_at <  p_end_date)
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'qualified','application_started','application_submitted',
      'documents_pending','documents_verified','interview_scheduled',
      'interview_completed','offer_sent','offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'application_submitted','documents_pending','documents_verified',
      'interview_scheduled','interview_completed','offer_sent',
      'offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage = 'enrolled')
  INTO v_captures, v_qualified, v_applied, v_enrolled
  FROM attributed_leads;

  RETURN jsonb_build_object(
    'campaign_id',      p_campaign_id,
    'attribution_mode', p_attribution_mode,
    'date_range',       jsonb_build_object('from', p_start_date, 'to', p_end_date),
    'stages', jsonb_build_object(
      'clicks',    v_clicks,    'captures',  v_captures,
      'qualified', v_qualified, 'applied',   v_applied,
      'enrolled',  v_enrolled),
    'rates',  jsonb_build_object(
      'click_to_capture', CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_captures  / v_clicks,    2) ELSE 0 END,
      'capture_to_qual',  CASE WHEN v_captures  > 0 THEN ROUND(100.0 * v_qualified / v_captures,  2) ELSE 0 END,
      'qual_to_applied',  CASE WHEN v_qualified > 0 THEN ROUND(100.0 * v_applied   / v_qualified, 2) ELSE 0 END,
      'applied_to_enrol', CASE WHEN v_applied   > 0 THEN ROUND(100.0 * v_enrolled  / v_applied,   2) ELSE 0 END,
      'overall',          CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_enrolled  / v_clicks,    2) ELSE 0 END)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_funnel(uuid, text, timestamptz, timestamptz) TO authenticated;
