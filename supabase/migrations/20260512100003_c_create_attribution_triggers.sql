-- ──────────────────────────────────────────────────────────────
-- Migration C: Attribution triggers
-- 1. sync_lead_campaign_attribution — maintains first/last on admission_leads
-- 2. link_click_to_submission       — back-fills resulted_lead_id on click row
-- See: docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md §4.3
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_lead_campaign_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE admission_leads
     SET first_campaign_link_id = COALESCE(first_campaign_link_id, NEW.campaign_link_id),
         last_campaign_link_id  = NEW.campaign_link_id,
         updated_at             = now()
   WHERE id = NEW.lead_id;

  UPDATE admission_campaign_links
     SET capture_count = capture_count + 1,
         updated_at    = now()
   WHERE id = NEW.campaign_link_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_campaign_attribution ON admission_lead_source_captures;
CREATE TRIGGER trg_sync_lead_campaign_attribution
AFTER INSERT ON admission_lead_source_captures
FOR EACH ROW EXECUTE FUNCTION sync_lead_campaign_attribution();

CREATE OR REPLACE FUNCTION link_click_to_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE admission_campaign_link_clicks
     SET resulted_in_submission = true,
         resulted_lead_id       = NEW.lead_id
   WHERE id = (
     SELECT id FROM admission_campaign_link_clicks
      WHERE link_id = NEW.campaign_link_id
        AND clicked_at >= now() - INTERVAL '24 hours'
        AND resulted_in_submission = false
      ORDER BY clicked_at DESC
      LIMIT 1
   );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_click_to_submission ON admission_form_submissions;
CREATE TRIGGER trg_link_click_to_submission
AFTER INSERT ON admission_form_submissions
FOR EACH ROW EXECUTE FUNCTION link_click_to_submission();
