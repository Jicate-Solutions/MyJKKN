-- Board-scoped BoS taxonomy assignment.
--
-- Moves the taxonomy assignment grain from (institution + regulation) to
-- (institution + regulation + board). A regulation spans multiple boards, and
-- different boards may use different frameworks (one on Bloom's, another on
-- Fink's). Resolution is board-first with a regulation-wide fallback: a row with
-- board_id IS NULL is the per-regulation default that applies to any board lacking
-- its own override.
--
-- board_id is the COE board-id space (same as bos_course_syllabi.board_id and the
-- composition board_id) — a plain nullable UUID with NO FK, mirroring how
-- regulation_id is already stored uncoupled in this table.

-- 1. Add the board_id column (nullable; existing rows become the regulation-wide default).
ALTER TABLE public.bos_regulation_taxonomies
  ADD COLUMN IF NOT EXISTS board_id UUID;

-- 2. Drop the old unique constraint on (institutions_id, regulation_id) by signature,
--    regardless of its auto-generated name (later migrations may have altered it).
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.bos_regulation_taxonomies'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(att.attname ORDER BY att.attname)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute att
        ON att.attrelid = c.conrelid AND att.attnum = k.attnum
    ) = ARRAY['institutions_id', 'regulation_id']
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.bos_regulation_taxonomies DROP CONSTRAINT %I',
      con_name
    );
  END IF;
END $$;

-- 3. Replace it with two partial unique indexes. A plain UNIQUE(...) over a
--    nullable board_id would treat NULLs as distinct and allow multiple
--    regulation-wide rows, so partial indexes are required:
--      • exactly ONE regulation-wide row per (institution, regulation)
--      • exactly ONE row per (institution, regulation, board)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bos_reg_tax_regwide
  ON public.bos_regulation_taxonomies (institutions_id, regulation_id)
  WHERE board_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bos_reg_tax_perboard
  ON public.bos_regulation_taxonomies (institutions_id, regulation_id, board_id)
  WHERE board_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bos_reg_tax_board
  ON public.bos_regulation_taxonomies (board_id);

COMMENT ON COLUMN public.bos_regulation_taxonomies.board_id IS
  'COE board id (nullable, no FK). NULL = regulation-wide default; a non-null row overrides the framework for that specific board. Resolution is board-first then NULL fallback.';
