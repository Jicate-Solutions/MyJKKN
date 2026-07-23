-- Migration: 20260512_fix_bos_board_programmes_null_institutions.sql
--
-- Root cause: bos_board_programmes rows inserted before the institutions_id bug fix
-- have NULL in that column. The SELECT RLS policy calls role_has_institution_access(NULL)
-- which returns false, so non-admin users receive zero rows even when they have access.
--
-- Fix (two steps):
--   1. Backfill institutions_id from bos_compositions for all NULL rows.
--   2. Loosen SELECT policy to allow NULL rows while backfill propagates.

-- ── Step 1: backfill NULL institutions_id ─────────────────────────────────────
-- Resolves institution from the most recent bos_compositions row for the same board.

UPDATE public.bos_board_programmes bp
SET institutions_id = subq.institutions_id
FROM (
  SELECT DISTINCT ON (board_id)
    board_id,
    institutions_id
  FROM public.bos_compositions
  WHERE institutions_id IS NOT NULL
  ORDER BY board_id, created_at DESC
) subq
WHERE bp.board_id = subq.board_id
  AND bp.institutions_id IS NULL;

-- ── Step 2: fix SELECT RLS (tolerates remaining NULLs after backfill) ────────

DROP POLICY IF EXISTS "bos_board_programmes_select" ON public.bos_board_programmes;
CREATE POLICY "bos_board_programmes_select" ON public.bos_board_programmes
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
    OR (institutions_id IS NULL AND auth.uid() IS NOT NULL)
  );
