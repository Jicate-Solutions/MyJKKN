-- ──────────────────────────────────────────────────────────────
-- Migration B: Attribution FK columns on existing tables (all NULLABLE)
-- See: docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md §4.2
-- ──────────────────────────────────────────────────────────────

ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS first_campaign_link_id uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_campaign_link_id  uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_first_campaign
  ON admission_leads (first_campaign_link_id)
  WHERE first_campaign_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_campaign
  ON admission_leads (last_campaign_link_id)
  WHERE last_campaign_link_id IS NOT NULL;

ALTER TABLE admission_lead_source_captures
  ADD COLUMN IF NOT EXISTS campaign_link_id uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_captures_campaign_link
  ON admission_lead_source_captures (campaign_link_id)
  WHERE campaign_link_id IS NOT NULL;

ALTER TABLE admission_form_submissions
  ADD COLUMN IF NOT EXISTS campaign_link_id uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_subs_campaign_link
  ON admission_form_submissions (campaign_link_id)
  WHERE campaign_link_id IS NOT NULL;
