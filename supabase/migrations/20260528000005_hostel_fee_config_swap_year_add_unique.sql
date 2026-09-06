-- ─── hostel_fee_config: swap academic_year → hostel_year + add unique ───
-- The fee config is now scoped by hostel_years (a hostel-specific calendar)
-- instead of academic_years. Safe to do destructively: the table is empty
-- (0 rows) and academic_year_id was never a real FK.
--
-- Also adds the unique constraint the table never had, preventing duplicate
-- fee rows for the same (institution, hostel year, room type, AC, tier).

ALTER TABLE hostel_fee_config
  DROP COLUMN IF EXISTS academic_year_id;

ALTER TABLE hostel_fee_config
  ADD COLUMN hostel_year_id uuid NOT NULL REFERENCES hostel_years(id);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_config_hostel_year
  ON hostel_fee_config (hostel_year_id);

ALTER TABLE hostel_fee_config
  ADD CONSTRAINT hostel_fee_config_unique_dim
  UNIQUE (institution_id, hostel_year_id, room_type, ac_status, tier_id);
