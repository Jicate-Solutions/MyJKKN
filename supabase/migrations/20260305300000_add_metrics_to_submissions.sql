-- Add objective metrics columns to ss_appathon_submissions
-- For Appathon 2.0: MRR + paying users replace subjective judging as primary ranking

ALTER TABLE ss_appathon_submissions
  ADD COLUMN IF NOT EXISTS mrr_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paying_users_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proof_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;

-- Comments for documentation
COMMENT ON COLUMN ss_appathon_submissions.mrr_amount IS 'Monthly Recurring Revenue in INR';
COMMENT ON COLUMN ss_appathon_submissions.paying_users_count IS 'Number of paying users';
COMMENT ON COLUMN ss_appathon_submissions.proof_urls IS 'Screenshot URLs proving revenue/users';
COMMENT ON COLUMN ss_appathon_submissions.metrics_updated_at IS 'Timestamp when metrics were last updated';

-- Index for leaderboard sorting by MRR
CREATE INDEX IF NOT EXISTS idx_ss_submissions_mrr ON ss_appathon_submissions (event_id, mrr_amount DESC, paying_users_count DESC);
