-- Composite indexes that make the strict-counselor visibility filter
--   (counselor_id = X OR assigned_counselor_id = Y) AND source <> 'referral'
--   ORDER BY created_at DESC, id
-- sargable: Postgres can now BitmapOr the two legs. Previously
-- assigned_counselor_id had NO index (only counselor_id did), so the count(*)
-- pagination aggregate did a full Seq Scan over all leads on every list load
-- (verified: 1663 buffers / ~9.8ms -> 311 buffers / ~1.58ms after these).
-- Also clears the unindexed-FK advisor on admission_leads_assigned_counselor_id_fkey.
--
-- On the live DB these were built CONCURRENTLY (out-of-transaction) via the
-- Supabase SQL runner; this IF NOT EXISTS form is a no-op there and recreates
-- them (with a brief lock) on a fresh rebuild.
CREATE INDEX IF NOT EXISTS idx_admission_leads_assigned_counselor_created
  ON public.admission_leads (assigned_counselor_id, created_at DESC, id)
  WHERE assigned_counselor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admission_leads_counselor_created
  ON public.admission_leads (counselor_id, created_at DESC, id)
  WHERE counselor_id IS NOT NULL;
