-- ─── hostel_category_fees ───────────────────────────────────────────────
-- Global, year-scoped, ADDITIVE hostel fees. Each row prices ONE category
-- from one of three global lookups (hostel room / mess / amenity). A
-- learner's hostel total = sum of their selected categories' fees.
--
-- Global (no institution_id): fees are common to all institutions. This is a
-- separate, additive layer from admission_fee_structures (which stays the
-- per-institution/programme matrix for tuition). Billing combines both.

CREATE TABLE IF NOT EXISTS hostel_category_fees (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_year_id        uuid        NOT NULL REFERENCES hostel_years(id),
  hostel_category_id    uuid        NULL REFERENCES hostel_categories(id),
  mess_category_id      uuid        NULL REFERENCES mess_categories(id),
  amenities_category_id uuid        NULL REFERENCES amenities_categories(id),
  amount                numeric     NOT NULL,
  frequency             text        NOT NULL DEFAULT 'annual',
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- exactly one category reference is set
  CONSTRAINT hostel_category_fees_one_category CHECK (
    num_nonnulls(hostel_category_id, mess_category_id, amenities_category_id) = 1
  ),
  CONSTRAINT hostel_category_fees_frequency_check CHECK (
    frequency IN ('annual', 'semester', 'monthly', 'one_time')
  ),
  CONSTRAINT hostel_category_fees_amount_nonneg CHECK (amount >= 0)
);

-- One fee per category per hostel year (category split across 3 columns → 3 partial uniques)
CREATE UNIQUE INDEX IF NOT EXISTS uq_hcf_hostel_category
  ON hostel_category_fees (hostel_year_id, hostel_category_id)
  WHERE hostel_category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hcf_mess_category
  ON hostel_category_fees (hostel_year_id, mess_category_id)
  WHERE mess_category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hcf_amenities_category
  ON hostel_category_fees (hostel_year_id, amenities_category_id)
  WHERE amenities_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hcf_year_active
  ON hostel_category_fees (hostel_year_id, is_active);

-- ─── RLS (read: all authenticated; write: super_admin/admin) ────────────
ALTER TABLE hostel_category_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostel_category_fees_select"
  ON hostel_category_fees FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_category_fees_insert"
  ON hostel_category_fees FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_category_fees_update"
  ON hostel_category_fees FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_category_fees_delete"
  ON hostel_category_fees FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin'))
  );

CREATE TRIGGER trg_hostel_category_fees_updated_at
  BEFORE UPDATE ON hostel_category_fees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
