-- ──────────────────────────────────────────────────────────────
-- Migration A: Campaign attribution tables
-- Adds admission_campaigns, admission_campaign_links, admission_campaign_link_clicks
-- See: docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md §4.1
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admission_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text,
  source          lead_source NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','paused','completed','archived')),
  starts_at       timestamptz,
  ends_at         timestamptz,
  budget_inr      numeric(12,2),
  target_leads    integer,
  target_enrolled integer,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  UNIQUE (institution_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_inst_status ON admission_campaigns (institution_id, status)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_inst_source ON admission_campaigns (institution_id, source)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_inst_dates  ON admission_campaigns (institution_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS admission_campaign_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES admission_campaigns(id) ON DELETE CASCADE,
  form_id         uuid NOT NULL REFERENCES admission_forms(id),
  token           text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  cost_inr        numeric(12,2),
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  is_active       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,
  click_count     integer NOT NULL DEFAULT 0,
  capture_count   integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_campaign ON admission_campaign_links (campaign_id);
CREATE INDEX IF NOT EXISTS idx_links_form     ON admission_campaign_links (form_id);

CREATE TABLE IF NOT EXISTS admission_campaign_link_clicks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id         uuid NOT NULL REFERENCES admission_campaign_links(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES admission_campaigns(id) ON DELETE CASCADE,
  clicked_at      timestamptz NOT NULL DEFAULT now(),
  ip_hash         text,
  user_agent      text,
  referrer        text,
  device_type     text,
  country         text,
  session_id      text,
  resulted_in_submission boolean NOT NULL DEFAULT false,
  resulted_lead_id       uuid REFERENCES admission_leads(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_clicks_campaign_time ON admission_campaign_link_clicks (campaign_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_link_time     ON admission_campaign_link_clicks (link_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_session       ON admission_campaign_link_clicks (session_id)
  WHERE session_id IS NOT NULL;

-- Updated-at maintenance triggers (reuse existing function)
DROP TRIGGER IF EXISTS trg_admission_campaigns_updated ON admission_campaigns;
CREATE TRIGGER trg_admission_campaigns_updated
  BEFORE UPDATE ON admission_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_admission_campaign_links_updated ON admission_campaign_links;
CREATE TRIGGER trg_admission_campaign_links_updated
  BEFORE UPDATE ON admission_campaign_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
