-- ─────────────────────────────────────────────────────────────────────────────
-- smtp_configuration — Academic Council "From" override
-- ─────────────────────────────────────────────────────────────────────────────
-- Board of Studies and Academic Council share ONE SMTP account per institution
-- (same host / port / user / password). Only the visible From: identity should
-- differ for Academic Council notices. These two nullable columns hold that
-- override:
--   • ac_sender_email — From address used ONLY for meeting_type='academic_council'
--   • ac_sender_name  — From display name for the same
--
-- When either is NULL, AC meetings fall back to the shared sender_email /
-- sender_name (i.e. current behaviour). BoS emails NEVER read these columns.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so it can be re-run safely. Practical-
-- allotment and other readers are unaffected — the columns are additive and
-- nullable.

ALTER TABLE public.smtp_configuration
  ADD COLUMN IF NOT EXISTS ac_sender_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ac_sender_name  VARCHAR(255);

COMMENT ON COLUMN public.smtp_configuration.ac_sender_email IS
  'Optional From: address used only for Academic Council meeting notices. NULL = fall back to sender_email.';
COMMENT ON COLUMN public.smtp_configuration.ac_sender_name IS
  'Optional From: display name for Academic Council notices. NULL = fall back to sender_name.';
