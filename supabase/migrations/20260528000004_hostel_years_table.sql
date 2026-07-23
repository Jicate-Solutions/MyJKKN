-- ─── hostel_years master table ─────────────────────────────────────────
-- Global lookup (no institution_id) — shared across all institutions.
-- A hostel's own academic-calendar year, used to scope hostel fee config
-- (replaces the academic_year_id reference on hostel_fee_config).

CREATE TABLE IF NOT EXISTS hostel_years (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  is_current  boolean     NOT NULL DEFAULT false,
  description text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_years_name_unique UNIQUE (name),
  CONSTRAINT hostel_years_date_order CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_hostel_years_active
  ON hostel_years (is_active, start_date DESC);

-- ─── Single-current enforcement ─────────────────────────────────────────
-- At most one hostel year may be is_current=true. When a row is set current,
-- unset every other row. The WHEN clause keeps this from recursing (the
-- cascade UPDATE sets others to false, which doesn't satisfy NEW.is_current).
CREATE OR REPLACE FUNCTION enforce_single_current_hostel_year()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE hostel_years
    SET is_current = false
    WHERE id <> NEW.id AND is_current = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hostel_years_single_current
  AFTER INSERT OR UPDATE OF is_current ON hostel_years
  FOR EACH ROW
  WHEN (NEW.is_current = true)
  EXECUTE FUNCTION enforce_single_current_hostel_year();

-- ─── RLS (read = all authenticated, write = super_admin/admin) ──────────
ALTER TABLE hostel_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostel_years_select"
  ON hostel_years FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_years_insert"
  ON hostel_years FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_years_update"
  ON hostel_years FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_years_delete"
  ON hostel_years FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── updated_at trigger (shared fn from 00_master_setup.sql) ────────────
CREATE TRIGGER trg_hostel_years_updated_at
  BEFORE UPDATE ON hostel_years
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
