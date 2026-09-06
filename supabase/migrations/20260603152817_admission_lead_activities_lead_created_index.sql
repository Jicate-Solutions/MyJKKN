-- Composite index for the per-lead, created_at-ordered activity fetch
-- (ActivityService.getActivities / getEnhancedTimeline / getActivityStats).
-- Previously only a single-column (lead_id) index existed, so each per-lead fetch
-- index-scanned on lead_id then sorted created_at in memory. Built CONCURRENTLY
-- on the live DB via the SQL runner; this IF NOT EXISTS form is a no-op there and
-- recreates it on a fresh rebuild.
CREATE INDEX IF NOT EXISTS idx_admission_lead_activities_lead_created
  ON public.admission_lead_activities (lead_id, created_at DESC);
