-- ─── Per-program eligibility matrix ──────────────────────────────────────
-- Locked decisions 2026-05-28 (11, 21-25): each PROGRAM has an allowed list of
-- room categories + an allowed list of mess categories, plus a per-program
-- monthly-mess-allowed flag. Admin model = institution-level DEFAULT + per-program
-- OVERRIDE: a row with program_id = NULL is the institution default (applies to
-- all programs); a row with a concrete program_id overrides for that program.
--
-- effective_from is reserved for forward-only RESTRICTION semantics handled in a
-- later PR (mid-year EXPANSION is immediate; RESTRICTION is forward-only). This
-- PR only stores the data + the effective_from column; no runtime resolution
-- logic ships here.
--
-- Conventions mirror amenities_categories (Boobalan): is_active, created_at/
-- updated_at, the shared update_updated_at_column() trigger, RLS read=authenticated
-- / write=admin+super_admin via profiles.role. Audit columns (created_by/updated_by)
-- added per institutional audit-survivability discipline.

-- ─── Table 1: room category eligibility ──────────────────────────────────
CREATE TABLE IF NOT EXISTS hostel_program_room_eligibility (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  program_id       uuid        REFERENCES programs(id) ON DELETE CASCADE,  -- NULL = institution default
  room_category_id uuid        NOT NULL REFERENCES hostel_categories(id) ON DELETE CASCADE,
  is_active        boolean     NOT NULL DEFAULT true,
  effective_from   date        NULL,   -- reserved for forward-only restriction semantics (later PR)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES profiles(id),
  updated_by       uuid        REFERENCES profiles(id),
  CONSTRAINT uq_room_elig_inst_prog_cat UNIQUE (institution_id, program_id, room_category_id)
);

-- Partial unique so the institution default (program_id IS NULL) is deduped:
-- the table-level UNIQUE treats NULLs as distinct, so it cannot enforce
-- "one default row per (institution, category)". This index does.
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_elig_inst_default
  ON hostel_program_room_eligibility (institution_id, room_category_id)
  WHERE program_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_room_elig_inst_prog
  ON hostel_program_room_eligibility (institution_id, program_id, is_active);

-- ─── Table 2: mess category eligibility (+ per-program monthly flag) ──────
CREATE TABLE IF NOT EXISTS hostel_program_mess_eligibility (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id          uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  program_id              uuid        REFERENCES programs(id) ON DELETE CASCADE,  -- NULL = institution default
  mess_category_id        uuid        NOT NULL REFERENCES mess_categories(id) ON DELETE CASCADE,
  is_monthly_mess_allowed boolean     NOT NULL DEFAULT false,  -- decision 11: per-program monthly-mess flag
  is_active               boolean     NOT NULL DEFAULT true,
  effective_from          date        NULL,   -- reserved for forward-only restriction semantics (later PR)
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid        REFERENCES profiles(id),
  updated_by              uuid        REFERENCES profiles(id),
  CONSTRAINT uq_mess_elig_inst_prog_cat UNIQUE (institution_id, program_id, mess_category_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mess_elig_inst_default
  ON hostel_program_mess_eligibility (institution_id, mess_category_id)
  WHERE program_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_mess_elig_inst_prog
  ON hostel_program_mess_eligibility (institution_id, program_id, is_active);

-- ─── RLS: room eligibility ───────────────────────────────────────────────
ALTER TABLE hostel_program_room_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostel_program_room_eligibility_select"
  ON hostel_program_room_eligibility FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_program_room_eligibility_insert"
  ON hostel_program_room_eligibility FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_program_room_eligibility_update"
  ON hostel_program_room_eligibility FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_program_room_eligibility_delete"
  ON hostel_program_room_eligibility FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── RLS: mess eligibility ───────────────────────────────────────────────
ALTER TABLE hostel_program_mess_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostel_program_mess_eligibility_select"
  ON hostel_program_mess_eligibility FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_program_mess_eligibility_insert"
  ON hostel_program_mess_eligibility FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_program_mess_eligibility_update"
  ON hostel_program_mess_eligibility FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_program_mess_eligibility_delete"
  ON hostel_program_mess_eligibility FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── updated_at triggers ─────────────────────────────────────────────────
CREATE TRIGGER trg_hostel_program_room_eligibility_updated_at
  BEFORE UPDATE ON hostel_program_room_eligibility
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_hostel_program_mess_eligibility_updated_at
  BEFORE UPDATE ON hostel_program_mess_eligibility
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
