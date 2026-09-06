-- Business-card scanner — make the sha256 dedupe atomic
--
-- The upload route SELECTs for a prior job with the same sha256 and then calls
-- fn_ai_enqueue. That is a read-then-write with no lock: two concurrent uploads
-- of the SAME photo (two tabs, two devices, or a retry racing a slow first call)
-- both see "no prior job" and both enqueue. Result: the same card twice in the
-- review queue, and — before the save path became idempotent — the same person
-- twice in the shared contact book.
--
-- Found by the advisory review panel on PR #2835, 2026-08-05 (finding #2).
-- Companion fix: the save route now claims contact_card_scans (UNIQUE on job_id)
-- BEFORE writing to Networker, so the twin cannot survive even if two jobs exist.
-- This index closes the other half — two jobs cannot be created in the first place.
--
-- Verified before writing: zero existing (requested_by, sha256) duplicates for
-- this job type, so the index builds without conflict.
--
-- Partial and expression-based: it covers ONLY this job type, so the other ~30k
-- ai_jobs rows and every other feature on the table are untouched.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_card_scan_sha_uniq
  ON public.ai_jobs (requested_by, (payload ->> 'sha256'))
  WHERE job_type = 'contacts.card_extract'
    AND payload ->> 'sha256' IS NOT NULL;

COMMENT ON INDEX public.ai_jobs_card_scan_sha_uniq IS
  'One card-scan job per (user, photo bytes). Makes the sha256 dedupe atomic instead of read-then-write — PR #2835 review finding #2.';

COMMIT;

-- ROLLBACK
--   DROP INDEX IF EXISTS public.ai_jobs_card_scan_sha_uniq;
--
-- VERIFY (separate call — the Management API wraps a batch in one transaction)
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'ai_jobs' AND indexname = 'ai_jobs_card_scan_sha_uniq';
