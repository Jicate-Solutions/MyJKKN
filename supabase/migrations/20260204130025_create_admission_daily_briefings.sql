-- Migration: Create admission_daily_briefings table
-- Purpose: Store personalized daily briefings for counselors, managers, and admins
-- Created: 2026-02-04

-- Create the daily briefings table
CREATE TABLE IF NOT EXISTS admission_daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('counselor', 'manager', 'admin')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one briefing per user per date
  UNIQUE(user_id, date)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_id ON admission_daily_briefings(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_institution_id ON admission_daily_briefings(institution_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date ON admission_daily_briefings(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_date ON admission_daily_briefings(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_is_read ON admission_daily_briefings(user_id, is_read) WHERE NOT is_read;

-- Add comment describing the content JSONB structure
COMMENT ON COLUMN admission_daily_briefings.content IS 'JSON structure: {
  summary: "Your day at a glance",
  priorities: [{title, lead_id, reason}],
  metrics: {new_leads, follow_ups_due, conversions, total_leads, conversion_rate},
  hot_leads: [{id, name, score, reason, phone}],
  scheduled: [{time, lead_name, action, lead_id}],
  yesterday_recap: {contacts_made, conversions, new_leads, meetings_held},
  team_performance: {top_performers, escalations, pending_reviews} (manager only),
  institution_metrics: {total_conversions, pipeline_value, growth_rate} (admin only)
}';

-- Enable RLS
ALTER TABLE admission_daily_briefings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own briefings
CREATE POLICY "Users can view own briefings"
  ON admission_daily_briefings
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own briefings (mark as read)
CREATE POLICY "Users can update own briefings"
  ON admission_daily_briefings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can insert briefings
CREATE POLICY "Service role can manage briefings"
  ON admission_daily_briefings
  FOR ALL
  USING (auth.role() = 'service_role');

-- Managers and admins can view all briefings in their institution
CREATE POLICY "Managers can view institution briefings"
  ON admission_daily_briefings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'institution_admin', 'manager')
      AND (
        admission_daily_briefings.institution_id IN (
          SELECT ui.institution_id
          FROM user_institution_access ui
          WHERE ui.user_id = auth.uid()
        )
      )
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_admission_daily_briefings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_admission_daily_briefings_updated_at
  BEFORE UPDATE ON admission_daily_briefings
  FOR EACH ROW
  EXECUTE FUNCTION update_admission_daily_briefings_updated_at();
