-- ─── amenities_categories master table ─────────────────────────────────
-- Global lookup (no institution_id) — shared across all institutions,
-- mirroring mess_categories / hostel_categories. Standalone for now: no FK
-- from other tables. Admin-managed list of amenity categories used to group
-- campus-living amenities (e.g. Recreation, Fitness, Connectivity).

CREATE TABLE IF NOT EXISTS amenities_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amenities_categories_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_amenities_categories_active
  ON amenities_categories (is_active, sort_order);

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE amenities_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amenities_categories_select"
  ON amenities_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "amenities_categories_insert"
  ON amenities_categories FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "amenities_categories_update"
  ON amenities_categories FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "amenities_categories_delete"
  ON amenities_categories FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── updated_at trigger ─────────────────────────────────────────────────
-- Reuse the canonical shared trigger fn from 00_master_setup.sql.
CREATE TRIGGER trg_amenities_categories_updated_at
  BEFORE UPDATE ON amenities_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
