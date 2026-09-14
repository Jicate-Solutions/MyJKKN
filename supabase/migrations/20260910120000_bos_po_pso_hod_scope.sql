-- ============================================================================
-- Migration: 20260910120000_bos_po_pso_hod_scope.sql
-- Description: Institution-wise PO / PSO maintained by the HOD — ONE source
-- of truth for /bos/po-pso, /bos/compositions (Outcomes tab) and the syllabus
-- CO–PO/PSO editor.
--
-- The programme-level tables bos_programme_outcomes /
-- bos_programme_specific_outcomes (20260511) already carry the axis the
-- spec asks for (institution + programme + regulation) and already feed the
-- compositions Outcomes tab and the syllabus CO-PO editor. This migration
-- extends them, ADDITIVELY, with:
--
--   department_id  → departments  (the HOD's scope)
--   programme_id   → programs     (stable id next to the programme_code)
--   is_active      → soft "Deactivate" (rows are NEVER deleted)
--
-- and adds bos_course_outcome_mappings — the HOD's course × PO/PSO matrix.
--
-- STRICTLY ADDITIVE. No DELETE, no DROP, no data rewrite: the backfill only
-- fills NULL department_id / programme_id from `programs`. The older
-- institution-master tables (bos_master_pos / bos_master_psos /
-- bos_board_psos) are left untouched.
-- ============================================================================


-- ── 1. Extend the programme-level outcome tables ─────────────────────────────

ALTER TABLE public.bos_programme_outcomes
  ADD COLUMN IF NOT EXISTS department_id UUID
    REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS programme_id UUID
    REFERENCES public.programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.bos_programme_specific_outcomes
  ADD COLUMN IF NOT EXISTS department_id UUID
    REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS programme_id UUID
    REFERENCES public.programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_bos_po_department
  ON public.bos_programme_outcomes (department_id);
CREATE INDEX IF NOT EXISTS idx_bos_po_programme_id
  ON public.bos_programme_outcomes (programme_id);
CREATE INDEX IF NOT EXISTS idx_bos_pso_department
  ON public.bos_programme_specific_outcomes (department_id);
CREATE INDEX IF NOT EXISTS idx_bos_pso_programme_id
  ON public.bos_programme_specific_outcomes (programme_id);

COMMENT ON COLUMN public.bos_programme_outcomes.department_id IS
  'Owning department (HOD scope). Backfilled from programs.department_id by programme_code.';
COMMENT ON COLUMN public.bos_programme_outcomes.programme_id IS
  'programs.id matching programme_code at the same institution (or CAS sibling).';
COMMENT ON COLUMN public.bos_programme_outcomes.is_active IS
  'Soft status — "Deactivate" flips this to false; rows are never deleted.';
COMMENT ON COLUMN public.bos_programme_specific_outcomes.department_id IS
  'Owning department (HOD scope). Backfilled from programs.department_id by programme_code.';
COMMENT ON COLUMN public.bos_programme_specific_outcomes.programme_id IS
  'programs.id matching programme_code at the same institution (or CAS sibling).';
COMMENT ON COLUMN public.bos_programme_specific_outcomes.is_active IS
  'Soft status — "Deactivate" flips this to false; rows are never deleted.';


-- ── 2. Backfill programme_id / department_id (NULL rows only) ────────────────
-- Pass A: same institution.  Pass B: CAS sibling (same counselling_code),
-- for rows whose programme lives under the other MyJKKN UUID of the pair.

UPDATE public.bos_programme_outcomes o
   SET programme_id  = p.id,
       department_id = COALESCE(o.department_id, p.department_id)
  FROM public.programs p
 WHERE o.programme_id IS NULL
   AND p.institution_id = o.institutions_id
   AND upper(p.program_id) = upper(o.programme_code);

UPDATE public.bos_programme_outcomes o
   SET programme_id  = p.id,
       department_id = COALESCE(o.department_id, p.department_id)
  FROM public.programs p
  JOIN public.institutions pi ON pi.id = p.institution_id
  JOIN public.institutions oi ON oi.counselling_code = pi.counselling_code
 WHERE o.programme_id IS NULL
   AND oi.id = o.institutions_id
   AND upper(p.program_id) = upper(o.programme_code);

UPDATE public.bos_programme_specific_outcomes o
   SET programme_id  = p.id,
       department_id = COALESCE(o.department_id, p.department_id)
  FROM public.programs p
 WHERE o.programme_id IS NULL
   AND p.institution_id = o.institutions_id
   AND upper(p.program_id) = upper(o.programme_code);

UPDATE public.bos_programme_specific_outcomes o
   SET programme_id  = p.id,
       department_id = COALESCE(o.department_id, p.department_id)
  FROM public.programs p
  JOIN public.institutions pi ON pi.id = p.institution_id
  JOIN public.institutions oi ON oi.counselling_code = pi.counselling_code
 WHERE o.programme_id IS NULL
   AND oi.id = o.institutions_id
   AND upper(p.program_id) = upper(o.programme_code);


-- ── 3. Course × PO/PSO mapping matrix (HOD entry) ────────────────────────────
-- One row per course per (institution, regulation, programme). Levels are
-- stored canonically as 1 / 2 / 3 (Low / Medium / High); the UI renders
-- 1/2/3 for engineering and L/M/H for CAS, like the syllabus CO-PO editor.
-- A course with no explicit row shows the level DERIVED from its latest
-- syllabus CO-PO matrix (max across COs) — the HOD's row overrides it.

CREATE TABLE IF NOT EXISTS public.bos_course_outcome_mappings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id  UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  regulation_id    UUID        NOT NULL REFERENCES public.regulations(id) ON DELETE CASCADE,
  programme_code   VARCHAR(20) NOT NULL,
  programme_id     UUID        REFERENCES public.programs(id) ON DELETE SET NULL,
  department_id    UUID        REFERENCES public.departments(id) ON DELETE SET NULL,

  -- COE course reference (no local FK — same convention as bos_course_syllabi)
  course_id        UUID,
  course_code      VARCHAR(50) NOT NULL,
  course_name      VARCHAR(255),

  po_levels        JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- {"PO1": 3, "PO2": 2}
  pso_levels       JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- {"PSO1": 3}

  is_active        BOOLEAN     NOT NULL DEFAULT true,

  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_course_outcome_mappings_unique
    UNIQUE (institutions_id, regulation_id, programme_code, course_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_com_scope
  ON public.bos_course_outcome_mappings (institutions_id, regulation_id, programme_code);
CREATE INDEX IF NOT EXISTS idx_bos_com_department
  ON public.bos_course_outcome_mappings (department_id);

ALTER TABLE public.bos_course_outcome_mappings ENABLE ROW LEVEL SECURITY;

-- READ: institution access. WRITE: super/admin at the DB layer — HOD / board
-- member writes are authorized in /api/bos/po-pso/course-mappings and run
-- service-role (same editor-flow pattern as bos_master_pos / bos_ta_da_claims).
DROP POLICY IF EXISTS "bos_course_outcome_mappings_select" ON public.bos_course_outcome_mappings;
CREATE POLICY "bos_course_outcome_mappings_select" ON public.bos_course_outcome_mappings
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
  );

DROP POLICY IF EXISTS "bos_course_outcome_mappings_insert" ON public.bos_course_outcome_mappings;
CREATE POLICY "bos_course_outcome_mappings_insert" ON public.bos_course_outcome_mappings
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS "bos_course_outcome_mappings_update" ON public.bos_course_outcome_mappings;
CREATE POLICY "bos_course_outcome_mappings_update" ON public.bos_course_outcome_mappings
  FOR UPDATE USING (is_super_admin() OR is_admin());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE $trg$
      DROP TRIGGER IF EXISTS trg_bos_course_outcome_mappings_updated_at
        ON public.bos_course_outcome_mappings;
      CREATE TRIGGER trg_bos_course_outcome_mappings_updated_at
        BEFORE UPDATE ON public.bos_course_outcome_mappings
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $trg$;
  END IF;
END $$;

COMMENT ON TABLE public.bos_course_outcome_mappings IS
  'HOD course × PO/PSO mapping per (institution, regulation, programme). '
  'PO/PSO definitions come from bos_programme_outcomes / bos_programme_specific_outcomes '
  '(single source of truth). Levels canonical 1/2/3. Never deleted — is_active soft flag.';
