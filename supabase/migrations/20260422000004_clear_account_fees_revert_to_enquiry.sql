-- ============================================================================
-- Clear all fee fields + revert lifecycle_status (account → enquiry)
-- ============================================================================
-- Date:   2026-04-22
-- Scope:  88 learners currently in lifecycle_status='account' across 5
--         institutions (Engineering 38, Nursing 26, Pharmacy 21, Dental 2,
--         Allied Health 1).
--
-- Reason: After today's billing module rebuild (3-tier categories restored,
--         test data wiped, finance tab UI rewritten with cascading dropdowns),
--         the user is restarting the fees-entry workflow with the new
--         category structure. These 88 rows are mid-funnel and need a clean
--         slate before re-entry.
--
-- Atomic: single UPDATE so the 88 never sit briefly in account-status with
--         empty fee_items (avoids race conditions for any auto-billing job).
--
-- fee_items uses '[]'::jsonb because the column is NOT NULL (verified
-- against information_schema). Any NULL would fail constraint check.
--
-- No backup taken (user explicitly opted to start fresh).
-- ============================================================================

UPDATE learners_profiles
SET
  fee_items             = '[]'::jsonb,
  fee_structure_type    = NULL,
  application_fee       = NULL,
  university_reg_fee    = NULL,
  tuition_fee           = NULL,
  hostel_fee            = NULL,
  dayscholar_fee        = NULL,
  uniform_fee           = NULL,
  hospital_training_fee = NULL,
  placement_fee         = NULL,
  transport_fee         = NULL,
  lifecycle_status      = 'enquiry',
  updated_at            = now()
WHERE lifecycle_status = 'account';
