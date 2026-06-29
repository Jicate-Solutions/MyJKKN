-- =============================================================================
-- 20260630130000_scf_suggestions_kind.sql
-- SCF self-improving loop → learn from POSITIVE feedback, not only struggles.
-- Director directive 2026-06-30 (memory: project_scf_loop_learn_from_positive…).
-- =============================================================================
-- PROBLEM: the loop is one-eyed. scf-generate-suggestions only writes a row for
-- LOW-understanding windows (>=3 responses, avg < 3) — it can patch failure but
-- is blind to what WORKED. A self-improving loop should also capture standout
-- successes and propose replicating them.
--
-- FOUNDATION (this migration, additive + safe): one column on scf_ai_suggestions
-- distinguishing the two kinds of generated row:
--   * 'improvement' — the existing low-understanding "here's how to fix it" path.
--   * 'success'     — NEW: a standout-positive "here's what worked, replicate it"
--                     pattern (avg >= 4.5 with comments). Same row shape (input
--                     signal -> suggestion jsonb -> outcome lift -> verdict).
--
-- Backfill: every existing row is the legacy low path, so DEFAULT 'improvement'
-- correctly labels history. NOT NULL is safe because the DEFAULT covers existing
-- rows AND any insert that forgets to set kind (the generator sets it explicitly).
-- =============================================================================

ALTER TABLE public.scf_ai_suggestions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'improvement';

-- Constrain to the two known kinds (additive CHECK; existing rows are all the
-- default 'improvement', so this cannot fail validation).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scf_ai_suggestions_kind_chk'
  ) THEN
    ALTER TABLE public.scf_ai_suggestions
      ADD CONSTRAINT scf_ai_suggestions_kind_chk
      CHECK (kind IN ('improvement', 'success'));
  END IF;
END$$;

-- The loop activity panel + the success/strengths views filter by kind, so index it.
CREATE INDEX IF NOT EXISTS idx_scf_ai_suggestions_kind
  ON public.scf_ai_suggestions (kind, generated_at DESC);

COMMENT ON COLUMN public.scf_ai_suggestions.kind IS
  'improvement = generated from a low-understanding window (fix it); '
  'success = generated from a standout-positive window (what worked, replicate it). '
  'Added 2026-06-30 for the learn-from-positive upgrade.';

NOTIFY pgrst, 'reload schema';
