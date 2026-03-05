-- Add total_users and active_users columns for tiered objective tracking
ALTER TABLE ss_appathon_submissions ADD COLUMN IF NOT EXISTS total_users INTEGER DEFAULT 0;
ALTER TABLE ss_appathon_submissions ADD COLUMN IF NOT EXISTS active_users INTEGER DEFAULT 0;
