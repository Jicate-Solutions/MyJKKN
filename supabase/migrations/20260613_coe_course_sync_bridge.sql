-- ============================================================================
-- Migration: 20260613_coe_course_sync_bridge.sql
-- Purpose:   Bridge MyJKKN courses/course_mappings with COE without re-entry.
--
--   Background: Course master is owned PER-INSTITUTION. CAS (Arts: Aided+Self)
--   and Engineering maintain courses in COE; all other colleges + schools author
--   them in MyJKKN. The timetable reads MyJKKN courses.id and must keep working
--   unchanged. This migration adds:
--
--     1. institutions.course_master_source — which system owns this institution's
--        course master ('coe' | 'myjkkn'). Drives sync direction.
--     2. courses.coe_course_id + coe_synced_at — the cross-DB bridge. A bare uuid
--        (NO FK — it points into the separate COE database), linking each MyJKKN
--        course row to its COE twin. For CAS, the two MyJKKN rows (Aided + Self)
--        share the same coe_course_id.
--
--   NOTE: programs.program_id (TEXT) IS the shared program code COE uses as
--   program_code, so NO programs change is needed — the mapping sync matches
--   program_code directly against programs.program_id.
--
--   Idempotent — safe to re-run.
-- ============================================================================

-- ── 1. institutions.course_master_source ────────────────────────────────────
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS course_master_source text NOT NULL DEFAULT 'myjkkn';

-- CHECK constraint added separately so the column add stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'institutions_course_master_source_check'
  ) THEN
    ALTER TABLE public.institutions
      ADD CONSTRAINT institutions_course_master_source_check
      CHECK (course_master_source IN ('coe', 'myjkkn'));
  END IF;
END $$;

COMMENT ON COLUMN public.institutions.course_master_source IS
  'Which system owns this institution''s course master: ''coe'' (CAS, Engineering — synced down from COE) or ''myjkkn'' (default — authored locally).';

-- ── 2. courses.coe_course_id + coe_synced_at ────────────────────────────────
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS coe_course_id uuid NULL,
  ADD COLUMN IF NOT EXISTS coe_synced_at timestamptz NULL;

-- Non-unique on purpose: CAS fans one COE course out to TWO MyJKKN rows
-- (Aided + Self), both carrying the same coe_course_id.
CREATE INDEX IF NOT EXISTS idx_courses_coe_course_id
  ON public.courses (coe_course_id);

COMMENT ON COLUMN public.courses.coe_course_id IS
  'COE course UUID (bare — no FK, points into the COE database). Cross-DB bridge. NULL for MyJKKN-authored courses not yet linked. Shared across CAS Aided+Self siblings.';
COMMENT ON COLUMN public.courses.coe_synced_at IS
  'Last time this row was refreshed from COE by the course mirror sync.';

-- ── 3. Seed course_master_source = 'coe' for COE-mastered institutions ───────
-- EDIT THE COUNSELLING CODES BELOW to your real CAS + Engineering counselling
-- codes (== COE institution_code). Left as a no-op when the list is empty.
-- Re-runnable: only flips rows that aren't already 'coe'.
DO $$
DECLARE
  coe_mastered_codes text[] := ARRAY[
    -- '<CAS_COUNSELLING_CODE>',
    -- '<ENGINEERING_COUNSELLING_CODE>'
  ]::text[];
BEGIN
  IF array_length(coe_mastered_codes, 1) IS NULL THEN
    RAISE NOTICE 'course_master_source seed skipped: no counselling codes configured. Edit the migration or run an UPDATE manually.';
  ELSE
    UPDATE public.institutions
      SET course_master_source = 'coe'
      WHERE counselling_code = ANY (coe_mastered_codes)
        AND course_master_source IS DISTINCT FROM 'coe';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
