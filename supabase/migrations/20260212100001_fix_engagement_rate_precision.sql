-- Fix engagement_rate columns to support percentage values (0-100+)
-- Was DECIMAL(5,4) max 9.9999, now DECIMAL(7,4) max 999.9999
ALTER TABLE sm_snapshots ALTER COLUMN engagement_rate TYPE DECIMAL(7,4);
ALTER TABLE sm_post_metrics ALTER COLUMN engagement_rate TYPE DECIMAL(7,4);
