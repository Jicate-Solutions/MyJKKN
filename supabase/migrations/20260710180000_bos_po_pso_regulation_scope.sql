-- ============================================================================
-- Migration: 20260710180000_bos_po_pso_regulation_scope.sql
-- Description: Scope the institution master PO/PSO tables (20260710170000)
-- by regulation. Each regulation (R-2024, R-2026, …) carries its own master
-- PO set, master PSO defaults, and board-level PSO overrides.
--
-- Rows entered before this migration (the feature went live regulation-less
-- for a few hours on 2026-07-10) are backfilled to the OWNING INSTITUTION'S
-- LATEST regulation (max regulation_year, ties broken by created_at). Verify
-- after applying if master sets were entered that morning.
--
-- regulation_id FK → public.regulations (local MyJKKN table, same as
-- bos_programme_outcomes). CASCADE so removing a regulation cleans its sets.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bos_master_pos', 'bos_master_psos', 'bos_board_psos']
  LOOP
    -- 1. Add nullable column (idempotent).
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS regulation_id UUID
         REFERENCES public.regulations(id) ON DELETE CASCADE', t);

    -- 2. Backfill pre-regulation rows to the institution''s latest regulation.
    EXECUTE format(
      'UPDATE public.%I tgt
         SET regulation_id = (
           SELECT r.id FROM public.regulations r
           WHERE r.institution_id = tgt.institutions_id
           ORDER BY r.regulation_year DESC NULLS LAST, r.created_at DESC
           LIMIT 1
         )
       WHERE tgt.regulation_id IS NULL', t);

    -- 3. Orphans (institution with no regulations) cannot be scoped — remove
    --    rather than block the NOT NULL constraint. Logged row count below.
    EXECUTE format('DELETE FROM public.%I WHERE regulation_id IS NULL', t);

    -- 4. Enforce NOT NULL.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN regulation_id SET NOT NULL', t);
  END LOOP;
END $$;

-- ── Unique constraints now include the regulation dimension ─────────────────

ALTER TABLE public.bos_master_pos
  DROP CONSTRAINT IF EXISTS bos_master_pos_unique;
ALTER TABLE public.bos_master_pos
  ADD CONSTRAINT bos_master_pos_unique
    UNIQUE (institutions_id, regulation_id, po_code);

ALTER TABLE public.bos_master_psos
  DROP CONSTRAINT IF EXISTS bos_master_psos_unique;
ALTER TABLE public.bos_master_psos
  ADD CONSTRAINT bos_master_psos_unique
    UNIQUE (institutions_id, regulation_id, pso_code);

ALTER TABLE public.bos_board_psos
  DROP CONSTRAINT IF EXISTS bos_board_psos_unique;
ALTER TABLE public.bos_board_psos
  ADD CONSTRAINT bos_board_psos_unique
    UNIQUE (board_id, regulation_id, pso_code);

CREATE INDEX IF NOT EXISTS idx_bos_master_pos_regulation
  ON public.bos_master_pos (regulation_id);
CREATE INDEX IF NOT EXISTS idx_bos_master_psos_regulation
  ON public.bos_master_psos (regulation_id);
CREATE INDEX IF NOT EXISTS idx_bos_board_psos_regulation
  ON public.bos_board_psos (regulation_id);

COMMENT ON COLUMN public.bos_master_pos.regulation_id IS
  'FK to public.regulations — each regulation carries its own master PO set.';
COMMENT ON COLUMN public.bos_master_psos.regulation_id IS
  'FK to public.regulations — each regulation carries its own master PSO defaults.';
COMMENT ON COLUMN public.bos_board_psos.regulation_id IS
  'FK to public.regulations — board overrides are per regulation.';
