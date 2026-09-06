-- ============================================================================
-- Migration: 20260710170000_bos_po_pso_master.sql
-- Description: Institution-level master PO/PSO with per-board PSO overrides.
--
--   bos_master_pos   — Programme Outcomes per institution. COMMON to every
--                      board of that institution (e.g. all Engineering &
--                      Technology boards at CET share one PO set).
--   bos_master_psos  — Default Programme Specific Outcomes per institution.
--                      Boards inherit these unless they override.
--   bos_board_psos   — Board-level PSO override. When a board has ANY rows
--                      here, they replace the master PSO set for that board.
--                      Deleting all rows = reset to master (inherit again).
--
-- NOTE: this is a DIFFERENT axis from bos_programme_outcomes /
-- bos_programme_specific_outcomes (20260511), which are scoped per
-- (regulation, programme) inside /bos/taxonomy. Do not merge the two.
--
-- board_id is a COE API reference — NO local FK, same convention as
-- bos_compositions.board_id / bos_course_syllabi.board_id.
--
-- Access model
--   READ  : super_admin | admin | role_has_institution_access(institutions_id)
--   WRITE : super_admin | admin at the DB layer. Board-member writes go
--           through /api/bos/po-pso/* routes, which authorize via
--           resolveBosBoardScope (any active board membership at the
--           institution for master; membership of the specific board for
--           overrides) and then write with the service-role client — the
--           same editor-flow pattern as bos_ta_da_claims.
-- ============================================================================


-- ── bos_master_pos ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bos_master_pos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id  UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  po_code          VARCHAR(20) NOT NULL,   -- PO1, PO2, … (auto-assigned by form)
  description      TEXT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_master_pos_unique UNIQUE (institutions_id, po_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_master_pos_institution
  ON public.bos_master_pos (institutions_id);

ALTER TABLE public.bos_master_pos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_master_pos_select" ON public.bos_master_pos
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
  );

CREATE POLICY "bos_master_pos_insert" ON public.bos_master_pos
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

CREATE POLICY "bos_master_pos_update" ON public.bos_master_pos
  FOR UPDATE USING (is_super_admin() OR is_admin());

CREATE POLICY "bos_master_pos_delete" ON public.bos_master_pos
  FOR DELETE USING (is_super_admin() OR is_admin());

COMMENT ON TABLE public.bos_master_pos IS
  'Institution-level master Programme Outcomes — common to every board of the institution. '
  'Board-member writes are authorized in /api/bos/po-pso/master and executed service-role.';


-- ── bos_master_psos ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bos_master_psos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  institutions_id  UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  pso_code         VARCHAR(20) NOT NULL,   -- PSO1, PSO2, …
  description      TEXT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_master_psos_unique UNIQUE (institutions_id, pso_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_master_psos_institution
  ON public.bos_master_psos (institutions_id);

ALTER TABLE public.bos_master_psos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_master_psos_select" ON public.bos_master_psos
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
  );

CREATE POLICY "bos_master_psos_insert" ON public.bos_master_psos
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

CREATE POLICY "bos_master_psos_update" ON public.bos_master_psos
  FOR UPDATE USING (is_super_admin() OR is_admin());

CREATE POLICY "bos_master_psos_delete" ON public.bos_master_psos
  FOR DELETE USING (is_super_admin() OR is_admin());

COMMENT ON TABLE public.bos_master_psos IS
  'Institution-level DEFAULT Programme Specific Outcomes. Boards inherit these '
  'unless they have override rows in bos_board_psos.';


-- ── bos_board_psos ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bos_board_psos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- COE API board reference (no local FK — same convention as bos_compositions)
  board_id         UUID        NOT NULL,
  institutions_id  UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Denormalized display snapshot (avoids COE round-trips in list queries)
  board_code       VARCHAR(50),
  board_name       VARCHAR(255),

  pso_code         VARCHAR(20) NOT NULL,   -- PSO1, PSO2, …
  description      TEXT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_board_psos_unique UNIQUE (board_id, pso_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_board_psos_board
  ON public.bos_board_psos (board_id);
CREATE INDEX IF NOT EXISTS idx_bos_board_psos_institution
  ON public.bos_board_psos (institutions_id);

ALTER TABLE public.bos_board_psos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_board_psos_select" ON public.bos_board_psos
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(institutions_id)
  );

CREATE POLICY "bos_board_psos_insert" ON public.bos_board_psos
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

CREATE POLICY "bos_board_psos_update" ON public.bos_board_psos
  FOR UPDATE USING (is_super_admin() OR is_admin());

CREATE POLICY "bos_board_psos_delete" ON public.bos_board_psos
  FOR DELETE USING (is_super_admin() OR is_admin());

COMMENT ON TABLE public.bos_board_psos IS
  'Board-level PSO override. Any rows for a board_id replace the institution '
  'master PSO set (bos_master_psos) for that board; zero rows = inherit master.';


-- ── updated_at triggers (shared project helper) ─────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE $trg$
      DROP TRIGGER IF EXISTS trg_bos_master_pos_updated_at ON public.bos_master_pos;
      CREATE TRIGGER trg_bos_master_pos_updated_at
        BEFORE UPDATE ON public.bos_master_pos
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

      DROP TRIGGER IF EXISTS trg_bos_master_psos_updated_at ON public.bos_master_psos;
      CREATE TRIGGER trg_bos_master_psos_updated_at
        BEFORE UPDATE ON public.bos_master_psos
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

      DROP TRIGGER IF EXISTS trg_bos_board_psos_updated_at ON public.bos_board_psos;
      CREATE TRIGGER trg_bos_board_psos_updated_at
        BEFORE UPDATE ON public.bos_board_psos
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $trg$;
  END IF;
END $$;
