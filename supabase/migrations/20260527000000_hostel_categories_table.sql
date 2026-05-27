-- ─── hostel_categories master table ────────────────────────────────────
-- Global lookup (no institution_id) — shared across all institutions.
-- Replaces the hardcoded hostel_type_enum for admin-managed categories.

CREATE TABLE IF NOT EXISTS hostel_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  type        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_categories_name_unique UNIQUE (name)
);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_hostel_categories_active ON hostel_categories (is_active, sort_order);

-- ─── Seed from existing hostel_type_enum values ───────────────────────
INSERT INTO hostel_categories (name, type, sort_order) VALUES
  ('Boys Hostel',          'boys',          1),
  ('Girls Hostel',         'girls',         2),
  ('Mixed Hostel',         'mixed',         3),
  ('Staff Hostel',         'staff',         4),
  ('International Hostel', 'international', 5),
  ('Married Hostel',       'married',       6),
  ('Working Women Hostel', 'working_women', 7),
  ('Medical Hostel',       'medical',       8)
ON CONFLICT (name) DO NOTHING;

-- ─── Add category_id FK to hostel_blocks ──────────────────────────────
ALTER TABLE hostel_blocks
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES hostel_categories(id);

-- Backfill category_id from existing hostel_type column
UPDATE hostel_blocks b
SET category_id = c.id
FROM hostel_categories c
WHERE b.hostel_type::text = c.type
  AND b.category_id IS NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE hostel_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostel_categories_select"
  ON hostel_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_categories_insert"
  ON hostel_categories FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_categories_update"
  ON hostel_categories FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "hostel_categories_delete"
  ON hostel_categories FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── updated_at trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_hostel_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hostel_categories_updated_at
  BEFORE UPDATE ON hostel_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_hostel_categories_updated_at();
