-- ─── mess_categories master table ──────────────────────────────────────
-- Global lookup (no institution_id) — shared across all institutions,
-- mirroring hostel_categories. Standalone for now: no FK from other mess
-- tables yet. Admin-managed list of mess/food categories.

CREATE TABLE IF NOT EXISTS mess_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mess_categories_name_unique UNIQUE (name)
);

-- Index for common query patterns (active list ordered by sort_order)
CREATE INDEX IF NOT EXISTS idx_mess_categories_active
  ON mess_categories (is_active, sort_order);

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE mess_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mess_categories_select"
  ON mess_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "mess_categories_insert"
  ON mess_categories FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "mess_categories_update"
  ON mess_categories FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "mess_categories_delete"
  ON mess_categories FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── updated_at trigger ─────────────────────────────────────────────────
-- Reuse the canonical shared trigger fn from 00_master_setup.sql
-- (update_updated_at_column) instead of a bespoke one.
CREATE TRIGGER trg_mess_categories_updated_at
  BEFORE UPDATE ON mess_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
