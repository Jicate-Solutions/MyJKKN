-- ─── Unify hostel fees: rename hostel_category_fees → hostel_fees, add package target ───
-- The table was already a polymorphic fee-target table (exactly one of room/mess set).
-- We rename it to hostel_fees and add a THIRD target: package_id, so a single table holds
-- per-category fees AND flat per-package fees. A future "upgrade from package to a single
-- category" flow can then resolve either fee kind from one table with one query shape.
--
-- Also retrofits the write gate from the hardcoded role IN ('super_admin','admin') to
-- user_has_permission('campus_living.settings.edit') — fixing the latent mismatch where the
-- Fee Configuration page advertises that permission but the table only allowed super_admin/admin.
-- Verified DB-safe: no functions/views reference the old table name.

ALTER TABLE hostel_category_fees RENAME TO hostel_fees;

-- third fee target: a flat all-in fee for an admission package
ALTER TABLE hostel_fees
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES admission_packages(id) ON DELETE CASCADE;

-- exactly-one-target now spans three columns
ALTER TABLE hostel_fees DROP CONSTRAINT hostel_category_fees_one_category;
ALTER TABLE hostel_fees
  ADD CONSTRAINT hostel_fees_one_target
  CHECK (num_nonnulls(hostel_category_id, mess_category_id, package_id) = 1);

-- one fee per package per hostel year
CREATE UNIQUE INDEX IF NOT EXISTS uq_hf_package
  ON hostel_fees (hostel_year_id, package_id) WHERE package_id IS NOT NULL;

-- tidy carried-over object names to the hf_ / hostel_fees_ convention
ALTER INDEX uq_hcf_hostel_category    RENAME TO uq_hf_hostel_category;
ALTER INDEX uq_hcf_mess_category      RENAME TO uq_hf_mess_category;
ALTER INDEX idx_hcf_year_active       RENAME TO idx_hf_year_active;
ALTER INDEX hostel_category_fees_pkey RENAME TO hostel_fees_pkey;
ALTER TABLE hostel_fees RENAME CONSTRAINT hostel_category_fees_amount_nonneg          TO hostel_fees_amount_nonneg;
ALTER TABLE hostel_fees RENAME CONSTRAINT hostel_category_fees_frequency_check        TO hostel_fees_frequency_check;
ALTER TABLE hostel_fees RENAME CONSTRAINT hostel_category_fees_hostel_category_id_fkey TO hostel_fees_hostel_category_id_fkey;
ALTER TABLE hostel_fees RENAME CONSTRAINT hostel_category_fees_hostel_year_id_fkey     TO hostel_fees_hostel_year_id_fkey;
ALTER TABLE hostel_fees RENAME CONSTRAINT hostel_category_fees_mess_category_id_fkey   TO hostel_fees_mess_category_id_fkey;

-- RLS: replace hardcoded-role write policies with the permission-key gate; rename select
DROP POLICY IF EXISTS hostel_category_fees_insert ON hostel_fees;
DROP POLICY IF EXISTS hostel_category_fees_update ON hostel_fees;
DROP POLICY IF EXISTS hostel_category_fees_delete ON hostel_fees;
DROP POLICY IF EXISTS hostel_category_fees_select ON hostel_fees;

CREATE POLICY hostel_fees_select ON hostel_fees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY hostel_fees_insert ON hostel_fees
  FOR INSERT TO authenticated WITH CHECK (user_has_permission('campus_living.settings.edit'));
CREATE POLICY hostel_fees_update ON hostel_fees
  FOR UPDATE TO authenticated USING (user_has_permission('campus_living.settings.edit'));
CREATE POLICY hostel_fees_delete ON hostel_fees
  FOR DELETE TO authenticated USING (user_has_permission('campus_living.settings.edit'));

COMMENT ON TABLE hostel_fees IS
  'Hostel fees keyed by hostel_year_id. Each row targets exactly one of: hostel_category_id (per-bed room rate), mess_category_id (flat mess rate), or package_id (flat all-in package price). Enforced by hostel_fees_one_target.';
COMMENT ON COLUMN hostel_fees.package_id IS
  'When set, the row is a flat all-in fee for an admission_package (bundled room+mess); the category columns are null.';
