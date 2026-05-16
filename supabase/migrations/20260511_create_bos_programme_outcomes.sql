-- ============================================================================
-- Migration: 20260511_create_bos_programme_outcomes.sql
-- Description: Normalised programme-level PO/PSO tables for the BOS module.
--
--   bos_board_programmes          — which programmes a board governs
--   bos_programme_outcomes        — PO rows per regulation + programme
--   bos_programme_specific_outcomes — PSO rows per regulation + programme
--
-- Access model
--   READ  : any user with institution access (via role_has_institution_access)
--   WRITE : super_admin | admin | board chairman
--
-- "Chairman" = bos_members.member_type = 'chairman' in an active composition
-- of any board that governs the target programme (resolved by DB helper
-- is_board_chairman_for_programme, defined below).
-- ============================================================================


-- ── Helper: is current user the chairman for a programme? ────────────────────
-- Used in RLS WITH CHECK policies for programme_outcomes and
-- programme_specific_outcomes tables. Runs as SECURITY DEFINER so it can
-- join across staff / bos_members / bos_compositions even when the caller's
-- RLS would otherwise block those tables.

CREATE OR REPLACE FUNCTION public.is_board_chairman_for_programme(
  p_institutions_id UUID,
  p_programme_code  VARCHAR
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id     UUID;
  v_is_chairman  BOOLEAN := false;
BEGIN
  -- Resolve current auth user → staff record (added by 20250121_add_profile_id_to_staff)
  SELECT id INTO v_staff_id
  FROM public.staff
  WHERE profile_id = auth.uid()
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN false;
  END IF;

  -- Is this staff member chairman in any active composition of a board that
  -- governs the target programme at the given institution?
  SELECT EXISTS (
    SELECT 1
    FROM   public.bos_members        m
    JOIN   public.bos_compositions   c  ON c.id        = m.composition_id
    JOIN   public.bos_board_programmes bp ON bp.board_id = c.board_id
    WHERE  (bp.institutions_id = p_institutions_id OR bp.institutions_id IS NULL)
      AND  bp.programme_code  = p_programme_code
      AND  c.is_active        = true
      AND  m.staff_id         = v_staff_id
      AND  m.member_type      = 'chairman'
  ) INTO v_is_chairman;

  RETURN v_is_chairman;
END;
$$;

COMMENT ON FUNCTION public.is_board_chairman_for_programme IS
  'Returns true when the calling auth user is chairman of an active BoS composition '
  'for any board that governs the given programme at the given institution.';


-- ── bos_board_programmes ─────────────────────────────────────────────────────
-- Maps a board to the programme codes it governs.
-- Institution-level (not regulation-scoped): a board governs UEN across all
-- regulations. POs are separately scoped to regulation in the outcome tables.

CREATE TABLE IF NOT EXISTS public.bos_board_programmes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to bos_boards (CASCADE so removing a board cleans up its programme list)
  board_id         UUID        NOT NULL REFERENCES public.bos_boards(id) ON DELETE CASCADE,

  -- Denormalized from bos_boards for RLS scoping without an extra join
  institutions_id  UUID        NOT NULL,

  -- Short programme code matching programs.program_id (UEN, UCM, UTA…)
  programme_code   VARCHAR(20) NOT NULL,

  -- Denormalized display name (avoids COE round-trips in list queries)
  programme_name   VARCHAR(150),

  is_active        BOOLEAN     NOT NULL DEFAULT true,

  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_board_programmes_unique UNIQUE (board_id, programme_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_board_programmes_board
  ON public.bos_board_programmes (board_id);
CREATE INDEX IF NOT EXISTS idx_bos_board_programmes_institution
  ON public.bos_board_programmes (institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_board_programmes_prog_code
  ON public.bos_board_programmes (institutions_id, programme_code);

ALTER TABLE public.bos_board_programmes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_board_programmes_select" ON public.bos_board_programmes
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
  );

CREATE POLICY "bos_board_programmes_insert" ON public.bos_board_programmes
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
  );

CREATE POLICY "bos_board_programmes_update" ON public.bos_board_programmes
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
  );

CREATE POLICY "bos_board_programmes_delete" ON public.bos_board_programmes
  FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- updated_at trigger (reuses project-wide helper if available)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE $trg$
      DROP TRIGGER IF EXISTS trg_bos_board_programmes_updated_at
        ON public.bos_board_programmes;
      CREATE TRIGGER trg_bos_board_programmes_updated_at
        BEFORE UPDATE ON public.bos_board_programmes
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $trg$;
  END IF;
END $$;

COMMENT ON TABLE  public.bos_board_programmes IS
  'Maps each BoS board to the programme codes (UEN, UCM, UTA…) it governs.';
COMMENT ON COLUMN public.bos_board_programmes.programme_code IS
  'Short code matching programs.program_id in the COE / MyJKKN programs table.';


-- ── bos_programme_outcomes ───────────────────────────────────────────────────
-- One row per Programme Outcome per programme per regulation.
-- Replaces the flat pos JSONB on bos_regulation_taxonomies.

CREATE TABLE IF NOT EXISTS public.bos_programme_outcomes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id  UUID        NOT NULL,
  regulation_id    UUID        NOT NULL REFERENCES public.regulations(id) ON DELETE CASCADE,
  programme_code   VARCHAR(20) NOT NULL,   -- UEN, UCM, UTA…

  po_code          VARCHAR(20) NOT NULL,   -- PO1, PO2, … (auto-assigned by form)
  description      TEXT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_programme_outcomes_unique
    UNIQUE (institutions_id, regulation_id, programme_code, po_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_po_institution_regulation
  ON public.bos_programme_outcomes (institutions_id, regulation_id);
CREATE INDEX IF NOT EXISTS idx_bos_po_programme
  ON public.bos_programme_outcomes (institutions_id, regulation_id, programme_code);

ALTER TABLE public.bos_programme_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_po_select" ON public.bos_programme_outcomes
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
  );

CREATE POLICY "bos_po_insert" ON public.bos_programme_outcomes
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

CREATE POLICY "bos_po_update" ON public.bos_programme_outcomes
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

CREATE POLICY "bos_po_delete" ON public.bos_programme_outcomes
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE $trg$
      DROP TRIGGER IF EXISTS trg_bos_po_updated_at ON public.bos_programme_outcomes;
      CREATE TRIGGER trg_bos_po_updated_at
        BEFORE UPDATE ON public.bos_programme_outcomes
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $trg$;
  END IF;
END $$;

COMMENT ON TABLE  public.bos_programme_outcomes IS
  'Programme Outcomes (PO1…POn) per programme per regulation. '
  'regulation_id FK → regulations (local MyJKKN table). '
  'Chairman-only write; all members read.';
COMMENT ON COLUMN public.bos_programme_outcomes.po_code IS
  'Sequential outcome code assigned by the form: PO1, PO2, …';
COMMENT ON COLUMN public.bos_programme_outcomes.regulation_id IS
  'FK to public.regulations — this is a local MyJKKN table, not COE. '
  'CASCADE delete so removing a regulation cleans its POs.';


-- ── bos_programme_specific_outcomes ─────────────────────────────────────────
-- Same shape as bos_programme_outcomes but for Programme Specific Outcomes.

CREATE TABLE IF NOT EXISTS public.bos_programme_specific_outcomes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id  UUID        NOT NULL,
  regulation_id    UUID        NOT NULL REFERENCES public.regulations(id) ON DELETE CASCADE,
  programme_code   VARCHAR(20) NOT NULL,

  pso_code         VARCHAR(20) NOT NULL,   -- PSO1, PSO2, …
  description      TEXT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_programme_specific_outcomes_unique
    UNIQUE (institutions_id, regulation_id, programme_code, pso_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_pso_institution_regulation
  ON public.bos_programme_specific_outcomes (institutions_id, regulation_id);
CREATE INDEX IF NOT EXISTS idx_bos_pso_programme
  ON public.bos_programme_specific_outcomes (institutions_id, regulation_id, programme_code);

ALTER TABLE public.bos_programme_specific_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_pso_select" ON public.bos_programme_specific_outcomes
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
  );

CREATE POLICY "bos_pso_insert" ON public.bos_programme_specific_outcomes
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

CREATE POLICY "bos_pso_update" ON public.bos_programme_specific_outcomes
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

CREATE POLICY "bos_pso_delete" ON public.bos_programme_specific_outcomes
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR is_board_chairman_for_programme(institutions_id, programme_code)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE $trg$
      DROP TRIGGER IF EXISTS trg_bos_pso_updated_at
        ON public.bos_programme_specific_outcomes;
      CREATE TRIGGER trg_bos_pso_updated_at
        BEFORE UPDATE ON public.bos_programme_specific_outcomes
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $trg$;
  END IF;
END $$;

COMMENT ON TABLE  public.bos_programme_specific_outcomes IS
  'Programme Specific Outcomes (PSO1…PSOn) per programme per regulation. '
  'Chairman-only write; all members read.';
COMMENT ON COLUMN public.bos_programme_specific_outcomes.pso_code IS
  'Sequential outcome code assigned by the form: PSO1, PSO2, …';
